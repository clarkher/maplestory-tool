import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { staticMonsters } from "../../static-data";
import shapesJson from "../shapes.json";

type Shape = { id: number; n: string; pts: [number, number][]; area: number };
const data = shapesJson as { v: number; grid: number; shapes: Shape[] };

/** 單向：A 每點到 B 最近點的平均距離 */
function oneWay(a: [number, number][], b: [number, number][]): number {
  let sum = 0;
  for (const [x, y] of a) {
    let best = Infinity;
    for (const [u, v] of b) {
      const d = (x - u) * (x - u) + (y - v) * (y - v);
      if (d < best) best = d;
    }
    sum += Math.sqrt(best);
  }
  return sum / a.length;
}

describe("怪物輪廓資料", () => {
  it("格式與數量", () => {
    expect(data.v).toBe(1);
    expect(data.grid).toBe(64);
    expect(data.shapes.length).toBeGreaterThanOrEqual(70); // 已開放怪物只有 113 隻、換色怪去重後 76 隻（原訂 100 不可能）
  });

  it("每筆 id 在已開放怪物、圖存在、沒重複、點數合理", () => {
    const ids = new Set(staticMonsters().map(m => m.id));
    const seen = new Set<number>();
    for (const s of data.shapes) {
      expect(ids.has(s.id), `id ${s.id}`).toBe(true);
      expect(existsSync(path.join(process.cwd(), "public/assets/monster_frames", `${s.id}.png`)), `圖 ${s.id}`).toBe(true);
      expect(seen.has(s.id), `重複 ${s.id}`).toBe(false);
      seen.add(s.id);
      expect(s.pts.length).toBeGreaterThanOrEqual(40);
      expect(s.pts.length).toBeLessThanOrEqual(400);
      expect(s.area).toBeGreaterThan(0);
    }
  });

  it("外形太像（Chamfer 距離 < 1.0 格）的只留一隻", () => {
    const list = data.shapes;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        // 面積差太多一定不像，先略過省時間
        if (Math.abs(a.area - b.area) > 0.25 * Math.max(a.area, b.area)) continue;
        const d = (oneWay(a.pts, b.pts) + oneWay(b.pts, a.pts)) / 2;
        expect(d, `${a.id} 與 ${b.id} 太像`).toBeGreaterThanOrEqual(1.0);
      }
    }
  });
});
