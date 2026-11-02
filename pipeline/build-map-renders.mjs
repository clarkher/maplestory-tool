/**
 * 把 atlas 收的地圖畫面圖轉成 webp：public/assets/map_renders/<id>.webp ＋ public/data/map-renders.json（{ id: 上游版本 }）。
 * 用法：node pipeline/build-map-renders.mjs（或 npm run data:renders）
 * 來源：data/cache/upstream/assets/map_renders/<id>.png（fetch-artale 取回的上游快取，沒有就沿用現有 webp）。
 * 不在 atlas 的既有 webp 不動（永遠不刪）。
 * 轉圖失敗不擋資料更新：單張失敗沿用舊圖；sharp 整個載不起來（runner 上原生程式壞掉）也一樣，全部當成沿用。
 */
import fs from "node:fs";
import path from "node:path";
import { renderPlan } from "./lib/map-renders.mjs";

// sharp 是原生程式，載不起來時不讓整支程式丟例外（資料更新會跟著失敗），改成每張都當轉檔失敗、沿用舊圖
let sharp = null;
try {
  sharp = (await import("sharp")).default;
} catch (e) {
  console.warn(`[map-renders] 警告：sharp 載不起來，這次不轉圖、全部沿用舊圖：${e.message}`);
}

const ROOT = path.join(import.meta.dirname, "..");
const readJson = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const OUT_DIR = path.join(ROOT, "public", "assets", "map_renders");
const INDEX = path.join(ROOT, "public", "data", "map-renders.json");
const cachePng = id => path.join(ROOT, "data", "cache", "upstream", "assets", "map_renders", `${id}.png`);
const outWebp = id => path.join(OUT_DIR, `${id}.webp`);

const atlasIds = readJson("public/data/atlas-maps.json").map(m => m.id);
const upstreamVersions = {};
for (const m of readJson("data/raw/artale.json").maps) {
  const v = /[?&]v=([^&]+)/.exec(m.renderedMap?.image ?? "")?.[1];
  if (v) upstreamVersions[m.id] = v;
}
const old = fs.existsSync(INDEX) ? JSON.parse(fs.readFileSync(INDEX, "utf8")) : {};
const have = {};
for (const id of atlasIds) if (old[id] !== undefined && fs.existsSync(outWebp(id))) have[id] = old[id];

const plan = renderPlan({ atlasIds, upstreamVersions, have, cacheHas: id => fs.existsSync(cachePng(id)) });
fs.mkdirSync(OUT_DIR, { recursive: true });

const next = {};
for (const id of plan.keep) next[id] = have[id];
const failed = [];
for (const id of plan.convert) {
  try {
    if (!sharp) throw new Error("sharp 載不起來");
    await sharp(cachePng(id)).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 75 }).toFile(outWebp(id));
    next[id] = upstreamVersions[id] ?? "";
  } catch (e) {
    failed.push(id);
    if (Object.prototype.hasOwnProperty.call(have, id)) next[id] = have[id]; // 舊圖還在就沿用
    console.error(`[map-renders] ${id} 轉檔失敗：${e.message}`);
  }
}
// 保留 atlas 以外的既有條目（不刪）
for (const [id, v] of Object.entries(old)) if (!(id in next) && !atlasIds.includes(Number(id)) && fs.existsSync(outWebp(id))) next[id] = v;

const sorted = Object.fromEntries(Object.entries(next).sort((a, b) => Number(a[0]) - Number(b[0])));
fs.writeFileSync(INDEX, JSON.stringify(sorted) + "\n");

let total = 0, count = 0;
for (const id of atlasIds) if (next[id] !== undefined) { total += fs.statSync(outWebp(id)).size; count++; }
console.log(`[map-renders] atlas ${atlasIds.length} 張：轉檔 ${plan.convert.length - failed.length}、沿用 ${plan.keep.length}、缺 ${plan.missing.length}、失敗 ${failed.length}`);
console.log(`[map-renders] 共 ${count} 張 webp，${(total / 1048576).toFixed(1)} MB，平均 ${count ? (total / count / 1024).toFixed(0) : 0} KB`);
if (plan.missing.length) console.log(`[map-renders] 缺圖 id：${plan.missing.join(", ")}`);
if (failed.length) console.warn(`[map-renders] 警告：${failed.length} 張轉檔失敗（不擋資料更新）：${failed.join(", ")}`);
