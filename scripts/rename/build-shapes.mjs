/**
 * 產生「名字變怪物」要比對的怪物輪廓：src/lib/rename/shapes.json
 * 用法：node scripts/rename/build-shapes.mjs
 *
 * 流程：怪物圖 alpha>64 當實心 → 裁邊、等比縮進 56×56 置中於 64 格
 * → 取最大塊的外輪廓 → 沿輪廓每 1.5 格取一點 → 外形太像（Chamfer < 1.0 格）的只留一隻，
 * 其餘（換色怪）收進留下那隻的 alt（{ id, n }），之後比對贏了可從 id + alt 隨機挑名字。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GRID = 64, BOX = 56, STEP = 1.5, ALPHA = 64, DUP = 1.0;

const monsters = JSON.parse(readFileSync(path.join(root, "public/data/monsters.json"), "utf8")).filter(m => !m.un);

/** 圖 → 64×64 實心格（Uint8Array），回傳 null 代表沒東西 */
async function rasterize(file) {
  const img = await loadImage(file);
  const full = createCanvas(img.width, img.height);
  const fc = full.getContext("2d");
  fc.drawImage(img, 0, 0);
  const { data } = fc.getImageData(0, 0, img.width, img.height);
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (data[(y * img.width + x) * 4 + 3] > ALPHA) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, s = BOX / Math.max(w, h);
  const dw = Math.max(1, Math.round(w * s)), dh = Math.max(1, Math.round(h * s));
  const small = createCanvas(GRID, GRID);
  const sc = small.getContext("2d");
  sc.imageSmoothingQuality = "high";
  sc.drawImage(full, x0, y0, w, h, Math.round((GRID - dw) / 2), Math.round((GRID - dh) / 2), dw, dh);
  const px = sc.getImageData(0, 0, GRID, GRID).data;
  const g = new Uint8Array(GRID * GRID);
  for (let i = 0; i < g.length; i++) g[i] = px[i * 4 + 3] > ALPHA ? 1 : 0;
  return g;
}

/** 只留最大的一塊（8 連通），去掉飄在旁邊的小碎片 */
function largest(g) {
  const lab = new Int32Array(g.length);
  let best = 0, bestN = 0, id = 0;
  for (let i = 0; i < g.length; i++) {
    if (!g[i] || lab[i]) continue;
    id++;
    let n = 0;
    const st = [i]; lab[i] = id;
    while (st.length) {
      const c = st.pop(); n++;
      const cx = c % GRID, cy = (c / GRID) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
        const j = y * GRID + x;
        if (g[j] && !lab[j]) { lab[j] = id; st.push(j); }
      }
    }
    if (n > bestN) { bestN = n; best = id; }
  }
  const out = new Uint8Array(g.length);
  for (let i = 0; i < g.length; i++) out[i] = lab[i] === best ? 1 : 0;
  return { grid: out, area: bestN };
}

// Moore 鄰域，順時針（螢幕座標）
const NB = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];

/** 外輪廓逐格追蹤（格中心座標） */
function trace(g) {
  const at = (x, y) => x >= 0 && y >= 0 && x < GRID && y < GRID && g[y * GRID + x] === 1;
  let sx = -1, sy = -1;
  outer: for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (at(x, y)) { sx = x; sy = y; break outer; }
  if (sx < 0) return [];
  const path = [[sx, sy]];
  let cx = sx, cy = sy, back = 0; // 起點左邊一定是空的，所以從「西」開始找
  for (let guard = 0; guard < GRID * GRID * 4; guard++) {
    let found = false;
    for (let k = 1; k <= 8; k++) {
      const d = (back + k) % 8;
      const nx = cx + NB[d][0], ny = cy + NB[d][1];
      if (at(nx, ny)) {
        // 下一輪從「剛才來的方向」的前一格開始
        back = (d + 4 + 1) % 8 === 0 ? 0 : (d + 5) % 8;
        cx = nx; cy = ny; found = true; break;
      }
    }
    if (!found) break; // 單一格
    if (cx === sx && cy === sy) break;
    path.push([cx, cy]);
  }
  return path;
}

/** 沿封閉折線每 STEP 格取一點 */
function resample(poly) {
  if (poly.length < 2) return poly.map(([x, y]) => [x + 0.5, y + 0.5]);
  const p = poly.map(([x, y]) => [x + 0.5, y + 0.5]);
  p.push(p[0]);
  const out = [];
  let carry = 0;
  for (let i = 0; i + 1 < p.length; i++) {
    const [ax, ay] = p[i], [bx, by] = p[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    let t = carry;
    while (t < len) { out.push([ax + (bx - ax) * t / len, ay + (by - ay) * t / len]); t += STEP; }
    carry = t - len;
  }
  return out.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
}

function oneWay(a, b) {
  let sum = 0;
  for (const [x, y] of a) {
    let best = Infinity;
    for (const [u, v] of b) { const d = (x - u) ** 2 + (y - v) ** 2; if (d < best) best = d; }
    sum += Math.sqrt(best);
  }
  return sum / a.length;
}
const chamfer = (a, b) => (oneWay(a, b) + oneWay(b, a)) / 2;

const all = [];
for (const m of monsters) {
  const file = path.join(root, "public/assets/monster_frames", `${m.id}.png`);
  if (!existsSync(file)) continue;
  let g;
  try { g = await rasterize(file); } catch { continue; }
  if (!g) continue;
  const { grid, area } = largest(g);
  const pts = resample(trace(grid));
  if (pts.length < 40 || pts.length > 400) continue;
  all.push({ id: m.id, n: m.n, pts, area });
}

// 去重：先看到的留下（id 小的優先），面積差太多的一定不像，略過比對
const kept = [];
let folded = 0;
for (const s of all) {
  const hit = kept.find(k => Math.abs(k.area - s.area) <= 0.25 * Math.max(k.area, s.area) && chamfer(k.pts, s.pts) < DUP);
  if (hit) { (hit.alt ??= []).push({ id: s.id, n: s.n }); folded++; } else kept.push(s);
}

writeFileSync(path.join(root, "src/lib/rename/shapes.json"), JSON.stringify({ v: 1, grid: GRID, shapes: kept }));
console.log(`怪物 ${monsters.length}，可用 ${all.length}，併入 alt ${folded}，留下 ${kept.length}`);
