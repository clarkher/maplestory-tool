// src/lib/speed/__tests__/ink.test.ts
import { describe, expect, it } from "vitest";
import { bbox, components, grid, inkMask, textRows } from "../ink";
import { loadFixture } from "./fixture";

describe("畫面的墨", () => {
  it("EXP 那一行：去掉上面兩條白線（757、761），文字列是 766～774", async () => {
    const frame = await loadFixture("window-1364.png");
    const mask = inkMask(frame, { x: 809, y: 756, w: 167, h: 22 })!;
    const [y0, y1] = textRows(mask);
    expect(756 + y0).toBe(766);
    expect(756 + y1).toBe(775);
  });

  it("連通塊把 406947 切成六個字（數字高 7～9）", async () => {
    const frame = await loadFixture("window-1364.png");
    // 2026-10-13 量的：4 在 839–844、7 在 869–874，875 起是「[」
    const mask = inkMask(frame, { x: 838, y: 762, w: 37, h: 13 })!;
    const boxes = components(mask, 0, mask.h).filter(box => box.y1 - box.y0 >= 5);
    expect(boxes).toHaveLength(6);
    for (const box of boxes) expect(box.y1 - box.y0).toBeGreaterThanOrEqual(7);
  });

  it("格子是面積平均、範圍外算 0", () => {
    const mask = { w: 2, h: 2, m: new Float32Array([1, 0, 0, 1]) };
    expect(Array.from(grid(mask, bbox(mask)!, 1, 1))).toEqual([0.5]);
    expect(Array.from(grid(mask, bbox(mask)!, 2, 2))).toEqual([1, 0, 0, 1]);
  });
});
