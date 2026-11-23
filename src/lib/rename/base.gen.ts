// src/lib/rename/base.gen.ts
// 名字變怪物：算每隻怪的比對基準 base = [平均, 標準差]，寫回 src/lib/rename/shapes.json。CI 不跑。
// 用法：npx vitest run -c vitest.gen.config.ts src/lib/rename/base.gen.ts
//（scripts/rename/build-shapes.mjs 產完輪廓會自動叫這支）
// 做法：固定種子 200 個假手寫名字（1～4 字、橫直各半，synth.ts 同一套），每隻怪各算 fitShape 的 raw。
// pickResult 用 z = (raw − 平均)/標準差 排名，點少或外形特殊、什麼筆跡都配得上的怪就不會一直贏。
import fs from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { fitShape, type Shape } from "./match";
import { synthSet } from "./synth";

/** 基準用的種子與數量；測試的分佈檢查用另一個種子，避免只對這批調好 */
const BASE_SEED = 20261120;
const BASE_COUNT = 200;

const FILE = path.resolve("src/lib/rename/shapes.json");

it("寫入 shapes.json 的 base", () => {
  const data = JSON.parse(fs.readFileSync(FILE, "utf8")) as { v: number; grid: number; shapes: Shape[] };
  const names = synthSet(BASE_SEED, BASE_COUNT);
  const t0 = Date.now();
  for (const s of data.shapes) {
    delete s.base; // 算基準時不受舊值影響（fitShape 本來就不看 base，保險）
    const raws = names.map(segs => fitShape(segs, s).raw);
    const mean = raws.reduce((a, b) => a + b, 0) / raws.length;
    const std = Math.sqrt(raws.reduce((a, b) => a + (b - mean) ** 2, 0) / raws.length);
    s.base = [Math.round(mean * 1e4) / 1e4, Math.round(std * 1e4) / 1e4];
  }
  // 欄位順序固定：id, n, pts, alt, base（不寫 area 之類沒在用的欄位）
  const shapes = data.shapes.map(s => ({ id: s.id, n: s.n, pts: s.pts, ...(s.alt ? { alt: s.alt } : {}), base: s.base }));
  fs.writeFileSync(FILE, JSON.stringify({ v: data.v, grid: data.grid, shapes }));
  console.log(`base 寫入 ${shapes.length} 隻，${BASE_COUNT} 個假名字，${Date.now() - t0} ms`);
});
