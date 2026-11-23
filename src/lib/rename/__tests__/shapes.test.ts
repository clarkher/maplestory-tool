import { describe, expect, it } from "vitest";
import shapesJson from "../shapes.json";

type Shape = { id: number; n: string; alt?: { id: number; n: string }[]; pts: [number, number][]; base?: [number, number] };
const data = shapesJson as unknown as { v: number; grid: number; shapes: Shape[] };

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

  // 只驗 shapes.json 自己：不比現在的怪物資料（資料自動更新增減怪會讓這裡紅、擋住更新 PR）。
  // 拿掉的怪：結果卡「在哪打／怎麼去」靠 liveShapeIds 不放連結（share.test.ts 有測）。
  it("每筆結構合理、id（含 alt）沒重複", () => {
    const seen = new Set<number>();
    for (const s of data.shapes) {
      for (const id of [s.id, ...(s.alt ?? []).map(a => a.id)]) {
        expect(Number.isInteger(id) && id > 0, `id ${id}`).toBe(true);
        expect(seen.has(id), `重複 ${id}`).toBe(false);
        seen.add(id);
      }
      expect(s.n.length, `名字 ${s.id}`).toBeGreaterThan(0);
      for (const a of s.alt ?? []) expect(a.n.length, `alt 名字 ${a.id}`).toBeGreaterThan(0);
      expect(s.pts.length).toBeGreaterThanOrEqual(40);
      expect(s.pts.length).toBeLessThanOrEqual(400);
      for (const [x, y] of s.pts) {
        expect(x >= 0 && x <= data.grid && y >= 0 && y <= data.grid, `${s.id} 點超出格子`).toBe(true);
      }
      expect(s.base?.length).toBe(2);
    }
  });

  it("外形太像（Chamfer 距離 < 1.0 格）的只留一隻", () => {
    const list = data.shapes;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const d = (oneWay(a.pts, b.pts) + oneWay(b.pts, a.pts)) / 2;
        expect(d, `${a.id} 與 ${b.id} 太像`).toBeGreaterThanOrEqual(1.0);
      }
    }
  });
});
