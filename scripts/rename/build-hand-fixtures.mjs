/**
 * 產生「名字變怪物」校正用的手寫樣本：src/lib/rename/__fixtures__/hand.json
 * 用法：
 *   node scripts/rename/build-hand-fixtures.mjs <graphics.txt>                         → 10 組，寫進 hand.json（進版控）
 *   node scripts/rename/build-hand-fixtures.mjs <graphics.txt> --calib <輸出.json>      → 60 組校正報告用（另一個種子，不進版控）
 *
 * graphics.txt 是 makemeahanzi 的筆畫資料（https://raw.githubusercontent.com/skishore/makemeahanzi/master/graphics.txt），
 * 一行一個字：{ character, medians }，medians＝每一筆的中線折線，1024 格、y 軸朝上（換成畫面座標 y' = 900 − y）。
 * 這個檔很大（約 30MB），不進 repo；下載到暫存資料夾，路徑當參數給。
 *
 * 做法（像一個人在簽名格裡由左到右寫 ID）：
 *   - 中文字：每字約 100px 方格，大小 ±10%、旋轉 ±4°、基線上下 ±6px 抖動，字距約 0.08 字寬
 *   - 英文、數字：這裡自己定義的手寫折線字母（一筆或兩筆，曲線用折線），高 100px
 *   - 每筆中線加密到約 4px 一點，再加平滑的手抖（低通亂數，偏移約 2px）；座標四捨五入到 0.1（跟 SignPad 一樣）
 * 輸出是「切段前」的原始筆畫（畫面座標，跟 SignPad 交出去的一樣），JSON：{ seed, ids: [{ id, strokes }] }。
 * 固定種子，同一份 graphics.txt 每次產出一樣。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const graphics = args[0];
if (!graphics || !existsSync(graphics)) {
  console.error("用法：node scripts/rename/build-hand-fixtures.mjs <graphics.txt> [--calib <輸出.json>]");
  process.exit(1);
}
const calibAt = args.indexOf("--calib");
const calibOut = calibAt >= 0 ? args[calibAt + 1] : null;

/** 固定的 10 組（8 中文＋2 英數） */
const MAIN_IDS = ["小樹", "楓谷玩家", "阿明", "夜貓子", "黑騎士", "雪吉拉", "王小明", "喵喵", "Clark", "8591"];
const MAIN_SEED = 20261120;
const CALIB_SEED = 7_654_321;

/** mulberry32：跟 src/lib/rename/synth.ts 同一個 */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 英文、數字：手寫折線字母（高 100，y 朝下；基線 y=90，小寫上緣 y=45） ----------

/** 圓弧折線：圓心、半徑（可橢圓）、起訖角度（度，0＝右、90＝下） */
function arc(cx, cy, rx, ry, a0, a1, step = 15) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}

/** 每個字母：w＝字寬、s＝筆畫 */
const GLYPHS = {
  C: { w: 62, s: [arc(40, 52, 30, 38, -45, -315, 15).map(([x, y]) => [x, y])] },
  a: { w: 48, s: [[...arc(24, 70, 18, 19, -20, -380, 20), [44, 52], [44, 90]]] },
  c: { w: 42, s: [arc(26, 68, 18, 21, -40, -320, 20)] },
  e: { w: 46, s: [[[8, 68], [42, 68], ...arc(25, 68, 18, 21, -10, -320, 20)]] },
  i: { w: 20, s: [[[10, 48], [10, 90]], [[10, 28], [11, 31]]] },
  k: { w: 44, s: [[[10, 8], [10, 90]], [[38, 46], [12, 70], [40, 90]]] },
  l: { w: 20, s: [[[10, 8], [10, 90]]] },
  m: { w: 66, s: [[[8, 48], [8, 90]], [[8, 62], ...arc(21, 62, 13, 14, 180, 360, 30), [34, 90]], [[34, 62], ...arc(47, 62, 13, 14, 180, 360, 30), [60, 90]]] },
  n: { w: 46, s: [[[8, 48], [8, 90]], [[8, 62], ...arc(23, 62, 15, 15, 180, 360, 30), [38, 90]]] },
  o: { w: 46, s: [arc(23, 68, 18, 21, -90, 270, 20)] },
  r: { w: 34, s: [[[10, 48], [10, 90]], [[10, 66], [16, 54], [26, 48], [34, 50]]] },
  s: { w: 40, s: [[...arc(20, 57, 14, 10, -20, -270, 25), ...arc(20, 79, 14, 11, -90, 160, 25)]] },
  0: { w: 52, s: [arc(26, 50, 20, 40, -90, 270, 15)] },
  1: { w: 36, s: [[[12, 26], [24, 10], [24, 90]]] },
  2: { w: 50, s: [[...arc(24, 34, 20, 22, 190, 380, 20), [6, 90], [46, 90]]] },
  3: { w: 48, s: [[...arc(22, 30, 19, 20, 200, 450, 25), ...arc(22, 68, 22, 22, -90, 160, 25)]] },
  5: { w: 48, s: [[[42, 12], [12, 12], [10, 46], ...arc(24, 66, 22, 22, -130, 150, 20)]] },
  7: { w: 48, s: [[[6, 12], [44, 12], [22, 90]]] },
  8: { w: 50, s: [[...arc(25, 30, 17, 19, 90, -270, 20), ...arc(25, 70, 21, 21, -90, 270, 20)]] },
  9: { w: 48, s: [[...arc(24, 32, 18, 20, 0, -360, 20), [42, 32], [36, 90]]] },
};

// ---------- 中文字 ----------

/** 只讀要用到的字（graphics.txt 一行一字） */
function loadHanzi(chars) {
  const want = new Set(chars);
  const map = new Map();
  for (const line of readFileSync(graphics, "utf8").split("\n")) {
    if (!line) continue;
    const m = /^\{"character":"(.+?)"/.exec(line);
    if (!m || !want.has(m[1])) continue;
    const o = JSON.parse(line);
    map.set(o.character, o.medians);
  }
  const miss = [...want].filter(c => !map.has(c) && !GLYPHS[c]);
  if (miss.length) throw new Error(`graphics.txt 沒有這些字：${miss.join("")}`);
  return map;
}

/** 折線加密到約 step px 一點 */
function densify(pts, step = 4) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}

/** 平滑手抖：低通亂數，穩定後標準差約 amp px（相鄰點不會互相亂跳，免得切段時每個點都像轉角） */
function shake(pts, rand, amp = 2) {
  const a = 0.9, k = amp * Math.sqrt(1 - a * a) * Math.sqrt(3);
  let nx = (rand() - 0.5) * 2 * amp, ny = (rand() - 0.5) * 2 * amp;
  return pts.map(([x, y]) => {
    nx = a * nx + (rand() - 0.5) * 2 * k;
    ny = a * ny + (rand() - 0.5) * 2 * k;
    return [x + nx, y + ny];
  });
}

const round1 = v => Math.round(v * 10) / 10;

/** 一個字的筆畫（字框左上角在 0,0、size 大小）＋這個字佔多寬 */
function glyph(ch, hanzi, size) {
  if (GLYPHS[ch]) {
    const g = GLYPHS[ch], k = size / 100;
    return { w: g.w * k, strokes: g.s.map(s => s.map(([x, y]) => [x * k, y * k])) };
  }
  const medians = hanzi.get(ch);
  const k = size / 1024;
  return { w: size, strokes: medians.map(s => s.map(([x, y]) => [x * k, (900 - y) * k])) };
}

/** 一個 ID 的原始筆畫（畫面座標，左上約在 20,20） */
function writeId(id, hanzi, rand) {
  const out = [];
  let pen = 20;
  const latin = [...id].every(c => GLYPHS[c]);
  for (const ch of id) {
    const size = 100 * (0.9 + rand() * 0.2);
    const rot = ((rand() - 0.5) * 8 * Math.PI) / 180;
    const base = 20 + (rand() - 0.5) * 12;
    const { w, strokes } = glyph(ch, hanzi, size);
    const cx = w / 2, cy = size / 2;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    for (const s of strokes) {
      const placed = s.map(([x, y]) => {
        const dx = x - cx, dy = y - cy;
        return [pen + cx + dx * cos - dy * sin, base + cy + dx * sin + dy * cos];
      });
      out.push(shake(densify(placed), rand).map(([x, y]) => [round1(x), round1(y)]));
    }
    pen += w + size * (latin ? 0.06 : 0.08) + (rand() - 0.5) * 6;
  }
  return out;
}

// ---------- 60 組校正用 ID ----------

const POOL = "小樹楓谷玩家阿明夜貓子黑騎士雪吉拉王喵之龍鳳風雲天使惡魔光影月星戰神劍刀獵人法師白紅藍冰火豬兔熊虎狼狗魚鳥蛋糕菜頭哥姐妹弟大中老皮卡丘啾咪嚕嘿哈";
const LATIN = ["Clark", "maria", "cosmic", "nico", "emma", "lemon", "ocean", "sakai", "1357", "5201", "9527", "2378", "8591", "0703", "Cream", "Carl"];

function calibIds(rand, count) {
  const out = [];
  const pool = [...POOL];
  for (let i = 0; i < count; i++) {
    if (rand() < 0.2) {
      out.push(LATIN[Math.floor(rand() * LATIN.length)]);
      continue;
    }
    const n = 2 + Math.floor(rand() * 3);
    let s = "";
    for (let k = 0; k < n; k++) s += pool[Math.floor(rand() * pool.length)];
    out.push(s);
  }
  return out;
}

// ---------- 主程式 ----------

const seed = calibOut ? CALIB_SEED : MAIN_SEED;
const rand = seeded(seed);
const ids = calibOut ? calibIds(rand, 60) : MAIN_IDS;
const hanzi = loadHanzi([...new Set(ids.join(""))].filter(c => !GLYPHS[c]));
const data = { seed, source: "makemeahanzi graphics.txt medians", ids: ids.map(id => ({ id, strokes: writeId(id, hanzi, rand) })) };

const out = calibOut ? path.resolve(calibOut) : path.join(root, "src/lib/rename/__fixtures__/hand.json");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data) + "\n");
const pts = data.ids.reduce((n, x) => n + x.strokes.reduce((m, s) => m + s.length, 0), 0);
console.log(`寫好 ${out}：${data.ids.length} 組、${pts} 點`);
