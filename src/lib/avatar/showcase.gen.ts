// src/lib/avatar/showcase.gen.ts
// 產首頁紙娃娃輪播的角色圖（v1.68）：照紙娃娃頁同一套隨機規則抽穿搭，向 maplestory.io 要 1 倍圖，圖放自己站上，首頁不用等外部圖庫。CI 不跑。
// 兩步（要連得到 maplestory.io）：
//   1. npm run avatar:showcase                      抽候選，圖跟 candidates.json 寫到系統暫存 maplebook-avatar-showcase，用眼睛挑
//   2. SHOWCASE_KEEP=3,7,12 npm run avatar:showcase 把挑中的編號照順序放進 public/avatar-showcase 跟 showcase.json（舊圖清掉）
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { it } from "vitest";
import { outfitQuery, defaultOutfit } from "./outfit";
import { randomOutfit } from "./random";
import { characterUrl } from "./render";
import type { ShowcaseLook } from "./showcase";
import type { AvatarData, Gender } from "./types";

const TEMP = path.join(os.tmpdir(), "maplebook-avatar-showcase");
const PUBLIC = path.resolve("public/avatar-showcase");
const COUNT = 60;
/** 翅膀太寬、武器太大的角色在輪播裡人會變很小（1 倍的寬高上限，輪播高度照這個留） */
const MAX_W = 90;
const MAX_H = 76;

type Candidate = ShowcaseLook & { no: number };

const pngSize = (b: Buffer) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

async function draw() {
  const data = JSON.parse(fs.readFileSync("public/data/avatar.json", "utf8")) as AvatarData;
  fs.rmSync(TEMP, { recursive: true, force: true });
  fs.mkdirSync(TEMP, { recursive: true });
  const found: Candidate[] = [];
  const queue = [...Array(COUNT).keys()];
  await Promise.all(
    [0, 1, 2, 3].map(async () => {
      for (let no = queue.shift(); no !== undefined; no = queue.shift()) {
        const outfit = randomOutfit(data, defaultOutfit((no % 2) as Gender));
        try {
          const res = await fetch(characterUrl(outfit, data, { frame: 0, resize: 1 }), { signal: AbortSignal.timeout(40_000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const png = Buffer.from(await res.arrayBuffer());
          const { w, h } = pngSize(png);
          if (w > MAX_W || h > MAX_H) continue;
          fs.writeFileSync(path.join(TEMP, `${no}.png`), png);
          found.push({ no, q: outfitQuery(outfit), w, h, src: "" });
        } catch (error) {
          console.warn(`第 ${no} 套要不到：${String(error)}`);
        }
      }
    }),
  );
  found.sort((a, b) => a.no - b.no);
  fs.writeFileSync(path.join(TEMP, "candidates.json"), JSON.stringify(found, null, 1));
  console.log(`候選 ${found.length} 套在 ${TEMP}`);
}

function keep(numbers: number[]) {
  const candidates = JSON.parse(fs.readFileSync(path.join(TEMP, "candidates.json"), "utf8")) as Candidate[];
  fs.rmSync(PUBLIC, { recursive: true, force: true });
  fs.mkdirSync(PUBLIC, { recursive: true });
  const looks: ShowcaseLook[] = numbers.map((no) => {
    const found = candidates.find((c) => c.no === no);
    if (!found) throw new Error(`候選沒有第 ${no} 套`);
    const png = fs.readFileSync(path.join(TEMP, `${no}.png`));
    // 檔名跟著內容走：重產之後不會吃到瀏覽器快取的舊圖
    const name = `${createHash("sha1").update(png).digest("hex").slice(0, 10)}.png`;
    fs.writeFileSync(path.join(PUBLIC, name), png);
    return { q: found.q, w: found.w, h: found.h, src: `/avatar-showcase/${name}` };
  });
  fs.writeFileSync("src/lib/avatar/showcase.json", `${JSON.stringify(looks, null, 1)}\n`);
  console.log(`放進 ${looks.length} 套`);
}

it("產首頁輪播的角色圖", async () => {
  const picked = process.env.SHOWCASE_KEEP;
  if (picked) keep(picked.split(",").map(Number));
  else await draw();
});
