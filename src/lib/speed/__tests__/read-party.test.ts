import { describe, expect, it } from "vitest";
import type { Frame } from "../frame";
import { readParty } from "../read-party";
import { findStatusBar } from "../status-bar";
import { loadFixture } from "./fixture";

/** 在畫面上畫紅色或灰色的隊伍血條 */
function paint(frame: Frame, x: number, y: number, w: number, h: number, rgb: [number, number, number]) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) frame.data.set([...rgb, 255], (yy * frame.width + xx) * 4);
}

describe("組隊人數", () => {
  it("基準截圖：三人隊伍，兩個隊友灰掉（不在線）→ 1", async () => {
    const frame = await loadFixture("window-1364.png");
    expect(readParty(frame, findStatusBar(frame)!)).toBe(1);
  });

  it("把灰掉的兩條塗紅（隊友在同一張圖）→ 3", async () => {
    const frame = await loadFixture("window-1364.png");
    paint(frame, 1298, 587, 62, 6, [220, 20, 20]);
    paint(frame, 1298, 604, 62, 6, [220, 20, 20]);
    expect(readParty(frame, findStatusBar(frame)!)).toBe(3);
  });

  it("畫面中間隨便一條紅條（怪物血條）不算組隊", async () => {
    const frame = await loadFixture("window-1364.png");
    paint(frame, 700, 300, 60, 6, [220, 20, 20]);
    expect(readParty(frame, findStatusBar(frame)!)).toBe(1);
  });

  it("基準截圖放大 1.5 倍還能認出紅條 → 1", async () => {
    const frame = await loadFixture("window-1364.png", 1.5);
    expect(readParty(frame, findStatusBar(frame)!)).toBe(1);
  });
});
