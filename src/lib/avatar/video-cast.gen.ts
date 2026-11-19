// src/lib/avatar/video-cast.gen.ts
// 影片裡站著的角色（v2.40，11/19 使用者「紙娃娃去捏一些好看的、多種一點，這些都好醜」）。
// 首頁輪播是全隨機，衣服帽子各抽各的、常常很醜；這裡改成「同一系列的點裝湊成一整套」：
// 名字前 3 個字一樣、至少有套服（或上衣＋褲裙）再加 2 格的算一個系列，髮型臉型照性別挑、表情微笑，向 maplestory.io 要 2 倍圖。
// 兩步（要連得到 maplestory.io），跟首頁輪播同一套做法：
//   1. npm run video:cast                    抽候選，圖、candidates.json、contact.png（編號總表）寫到系統暫存 maplebook-video-cast，用眼睛挑
//   2. CAST_KEEP=3,7,12 npm run video:cast   把挑中的放進 pipeline/video/cast（舊圖清掉），影片照公告 id／題目固定挑兩張
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { it } from "vitest";
import { defaultOutfit, outfitQuery, wearItem } from "./outfit";
import type { Outfit } from "./outfit";
import { characterUrl } from "./render";
import type { AvatarData, AvatarItem, Gender, SlotKey } from "./types";

const TEMP = path.join(os.tmpdir(), "maplebook-video-cast");
const OUT = path.resolve("pipeline/video/cast");
const COUNT = 96;
/** 2 倍圖的寬上限：翅膀、大武器太寬的角色在畫面上會被縮得很小 */
const MAX_W = 220;

const LIGHT_SKIN = [2000, 2003];
/** 聯名角色（照真實作品角色做的）跟雕像這類變身裝不放 */
const SKIP = /芙莉蓮|欣梅爾|變身用|木乃伊/;

type Theme = { stem: string; g: Gender; items: AvatarItem[] };

const fits = (g: 0 | 1 | 2, who: Gender) => g === who || g === 2;

/** 同名系列的點裝：有套服（或上衣＋褲裙）、加起來至少 3 格 */
export function themes(data: AvatarData): Theme[] {
  const out: Theme[] = [];
  for (const g of [0, 1] as Gender[]) {
    const groups = new Map<string, Map<SlotKey, AvatarItem>>();
    for (const item of data.items) {
      if (!item.cash || !item.r || !fits(item.g, g) || item.k === "weapon" || item.k === "shield") continue;
      if (SKIP.test(item.n)) continue;
      const stem = [...item.n].slice(0, 3).join("");
      const slots = groups.get(stem) ?? new Map<SlotKey, AvatarItem>();
      if (!slots.has(item.k)) slots.set(item.k, item);
      groups.set(stem, slots);
    }
    for (const [stem, slots] of groups) {
      const body = slots.has("overall") || (slots.has("coat") && slots.has("pants"));
      if (body && slots.size >= 3) out.push({ stem, g, items: [...slots.values()] });
    }
  }
  return out;
}

/** 固定種子的亂數（同一批候選每次一樣） */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function dress(data: AvatarData, theme: Theme, r: () => number): Outfit {
  const pick = <T,>(list: T[]) => list[Math.floor(r() * list.length)];
  let o: Outfit = { ...defaultOutfit(theme.g), wear: {} };
  for (const item of theme.items) o = wearItem(o, item, data);
  const hair = pick(data.hair.filter((s) => fits(s.g, theme.g) && s.t.length));
  const face = pick(data.face.filter((s) => fits(s.g, theme.g) && s.t.length));
  // 髮色只用台服有的；膚色只用奶油、乳白（11/19 第一批深膚色太多看起來髒）；表情用預設的睜眼（微笑是閉眼）
  o = { ...o, hair: hair.id + pick(hair.t), face: face.id + pick(face.t) * 100, skin: pick(LIGHT_SKIN) };
  return o;
}

async function draw() {
  const data = JSON.parse(fs.readFileSync("public/data/avatar.json", "utf8")) as AvatarData;
  const all = themes(data);
  console.log(`系列 ${all.length} 個`);
  const r = rng(20261119);
  const chosen = [...all].sort(() => r() - 0.5).slice(0, COUNT);
  fs.rmSync(TEMP, { recursive: true, force: true });
  fs.mkdirSync(TEMP, { recursive: true });
  const found: { no: number; stem: string; q: string }[] = [];
  const queue = chosen.map((t, no) => ({ t, no }));
  await Promise.all(
    [0, 1, 2, 3].map(async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const outfit = dress(data, job.t, rng(job.no + 7));
        try {
          const res = await fetch(characterUrl(outfit, data, { frame: 0, resize: 2 }), { signal: AbortSignal.timeout(40_000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const png = Buffer.from(await res.arrayBuffer());
          if (png.readUInt32BE(16) > MAX_W) continue;
          fs.writeFileSync(path.join(TEMP, `${job.no}.png`), png);
          found.push({ no: job.no, stem: job.t.stem, q: outfitQuery(outfit) });
        } catch (error) {
          console.warn(`第 ${job.no} 套（${job.t.stem}）要不到：${String(error)}`);
        }
      }
    }),
  );
  found.sort((a, b) => a.no - b.no);
  fs.writeFileSync(path.join(TEMP, "candidates.json"), JSON.stringify(found, null, 1));
  console.log(`候選 ${found.length} 套在 ${TEMP}`);
}

function keep(numbers: number[]) {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const candidates = JSON.parse(fs.readFileSync(path.join(TEMP, "candidates.json"), "utf8")) as { no: number; stem: string; q: string }[];
  const kept = numbers.map((no, i) => {
    const c = candidates.find((x) => x.no === no);
    if (!c) throw new Error(`候選沒有第 ${no} 套`);
    const name = `${String(i + 1).padStart(2, "0")}.png`;
    fs.copyFileSync(path.join(TEMP, `${no}.png`), path.join(OUT, name));
    return { file: name, stem: c.stem, q: c.q };
  });
  fs.writeFileSync(path.join(OUT, "cast.json"), `${JSON.stringify(kept, null, 1)}\n`);
  console.log(`放進 ${kept.length} 套`);
}

it("產影片角色圖", async () => {
  const picked = process.env.CAST_KEEP;
  if (picked) keep(picked.split(",").map(Number));
  else await draw();
}, 600_000);
