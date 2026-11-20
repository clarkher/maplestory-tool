import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { TIMELINE, drawStage, fallT, phaseAt, squashAt } from "../stage";
import type { Stroke } from "../strokes";

const segs: Stroke[] = [
  [[8, 8], [30, 10]],
  [[30, 10], [32, 40]],
  [[10, 20], [12, 50], [20, 55]],
  [[40, 12], [55, 30]],
];

describe("phaseAt", () => {
  it("邊界", () => {
    expect(phaseAt(0)).toEqual({ phase: "write", p: 0 });
    expect(phaseAt(1199).phase).toBe("write");
    expect(phaseAt(1200)).toEqual({ phase: "collect", p: 0 });
    expect(phaseAt(5499).phase).toBe("title");
    expect(phaseAt(5500)).toEqual({ phase: "done", p: 1 });
    expect(TIMELINE.write + TIMELINE.collect + TIMELINE.morph + TIMELINE.title).toBe(5500);
  });
});

describe("drawStage", () => {
  const outline: [number, number][] = [[5, 5], [60, 5], [60, 60], [5, 60]];
  it("四個時間點都畫得出來", () => {
    for (const ms of [600, 2000, 3500, 4800, 5500]) {
      const c = createCanvas(360, 480);
      const ctx = c.getContext("2d") as unknown as CanvasRenderingContext2D;
      expect(() =>
        drawStage(ctx, {
          w: 360, h: 480, segs, kept: [0, 2],
          result: { kind: "monster", id: 1, n: "嫩寶", kept: [0, 2], score: 77, xf: { sx: 1, sy: 1, dx: 0, dy: 0 } },
          shape: { pts: outline }, ms, caption: true,
        }),
      ).not.toThrow();
    }
  });
  it("同一個 ms 畫兩次結果相同", () => {
    const draw = (ms: number) => {
      const c = createCanvas(200, 260);
      const ctx = c.getContext("2d") as unknown as CanvasRenderingContext2D;
      drawStage(ctx, { w: 200, h: 260, segs, kept: [1], result: { kind: "poop", score: 10 }, ms, caption: false });
      return c.toBuffer("image/png").toString("base64");
    };
    expect(draw(2300)).toBe(draw(2300));
  });
  it("大便結尾所有筆畫的 y 都在下半部", () => {
    const ys: number[] = [];
    const rec = new Proxy({} as Record<string, unknown>, {
      get(_t, k: string) {
        if (k === "moveTo" || k === "lineTo") return (_x: number, y: number) => { ys.push(y); };
        if (k === "measureText") return () => ({ width: 10 });
        return () => undefined;
      },
      set() { return true; },
    }) as unknown as CanvasRenderingContext2D;
    drawStage(rec, { w: 360, h: 480, segs, kept: [], result: { kind: "poop", score: 10 }, ms: 5400, caption: true });
    expect(ys.length).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBeGreaterThan(480 / 2);
  });
  it("morph 結束時留下的段 = xf 變換後的點（誤差 1px 內）", () => {
    const pts: [number, number, string][] = [];
    const rec = new Proxy({} as Record<string, unknown>, {
      get(_t, k: string) {
        if (k === "moveTo" || k === "lineTo") return (x: number, y: number) => { pts.push([x, y, k]); };
        if (k === "measureText") return () => ({ width: 10 });
        return () => undefined;
      },
      set() { return true; },
    }) as unknown as CanvasRenderingContext2D;
    const xf = { sx: 0.5, sy: 0.7, dx: 10, dy: 6 };
    const result = { kind: "monster" as const, id: 1, n: "嫩寶", kept: [2], score: 77, xf };
    drawStage(rec, { w: 360, h: 480, segs, kept: [2], result, shape: { pts: outline }, ms: 4200, caption: false });
    const S = Math.min(360 * 0.88, 480 * 0.66), ox = (360 - S) / 2, oy = 480 * 0.07, k = S / 64;
    expect(pts.length).toBe(segs[2].length);
    segs[2].forEach(([x, y], i) => {
      expect(Math.abs(pts[i][0] - (ox + (x * xf.sx + xf.dx) * k))).toBeLessThan(1);
      expect(Math.abs(pts[i][1] - (oy + (y * xf.sy + xf.dy) * k))).toBeLessThan(1);
    });
  });
  it("落地壓扁跟下落連續：相鄰 33ms 差 < 0.2", () => {
    for (const delay of [0, 0.2, 0.35]) {
      let prev = squashAt(fallT(1200, delay));
      for (let ms = 1233; ms <= 4200; ms += 33) {
        const cur = squashAt(fallT(ms, delay));
        expect(Math.abs(cur - prev)).toBeLessThan(0.2);
        prev = cur;
      }
    }
  });
});
