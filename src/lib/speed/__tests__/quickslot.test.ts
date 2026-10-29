// src/lib/speed/__tests__/quickslot.test.ts
import { describe, expect, it } from "vitest";
import type { Frame } from "../frame";
import { findStatusBar } from "../status-bar";
import { findQuickslot, readQuickslot } from "../quickslot";
import { loadFixture, paintSlotCount, quickslotOnScene, scaleFrame } from "./fixture";

/** 基準截圖快捷鍵 8 格的數量（左上到右下）：Shift 技能、Ins 702、Hm 技能、Pup 279、Ctrl 141、Del 0、End 技能、Pdn 2 */
const REAL = [null, 702, null, 279, 141, 0, null, 2];

const counts = (frame: Frame) => readQuickslot(frame, findStatusBar(frame)!)?.map(slot => slot.count) ?? null;

describe("findQuickslot", () => {
  it("基準截圖：8 格，2 列 4 欄，左上第一格在 (1213, 652)", async () => {
    const frame = await loadFixture("window-1364.png");
    const rects = findQuickslot(frame, findStatusBar(frame)!)!;
    expect(rects).toHaveLength(8);
    expect(Math.abs(rects[0].x - 1213)).toBeLessThanOrEqual(1);
    expect(Math.abs(rects[0].y - 652)).toBeLessThanOrEqual(1);
    // 欄距 35、列距 33
    expect(Math.abs(rects[3].x - rects[0].x - 105)).toBeLessThanOrEqual(1);
    expect(Math.abs(rects[4].y - rects[0].y - 33)).toBeLessThanOrEqual(1);
    expect(rects[4].x).toBe(rects[0].x);
  });

  it("縮放 1.5 倍也找得到（位置跟著放大）", async () => {
    const frame = scaleFrame(await loadFixture("window-1364.png"), 1.5);
    const rects = findQuickslot(frame, findStatusBar(frame)!)!;
    expect(rects).toHaveLength(8);
    expect(Math.abs(rects[0].x - 1213 * 1.5)).toBeLessThanOrEqual(2);
    expect(Math.abs(rects[7].y - 685 * 1.5)).toBeLessThanOrEqual(2);
  });

  it("1920×1080 場景、快捷鍵貼在右下：找得到", async () => {
    const frame = quickslotOnScene(await loadFixture("window-1364.png"));
    const rects = findQuickslot(frame, findStatusBar(frame)!)!;
    expect(rects).toHaveLength(8);
    expect(Math.abs(rects[0].x - (1920 - (1364 - 1213)))).toBeLessThanOrEqual(1);
  });

  it("沒有快捷鍵（整塊塗成場景色）→ null", async () => {
    const frame = await loadFixture("window-1364.png");
    const data = new Uint8ClampedArray(frame.data);
    for (let y = 640; y < 726; y++) for (let x = 1200; x < 1364; x++) data.set([60, 50, 30, 255], (y * frame.width + x) * 4);
    const blank = { ...frame, data };
    expect(findQuickslot(blank, findStatusBar(blank)!)).toBeNull();
  });
});

describe("readQuickslot", () => {
  it("基準截圖讀到 702、279、141、0、2，技能格是 null", async () => {
    const frame = await loadFixture("window-1364.png");
    expect(counts(frame)).toEqual(REAL);
  });

  it("每一格都有 16×16 的圖示", async () => {
    const frame = await loadFixture("window-1364.png");
    const slots = readQuickslot(frame, findStatusBar(frame)!)!;
    expect(slots.map(slot => slot.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const slot of slots) expect(slot.icon?.length).toBe(16 * 16 * 4);
  });

  it("縮放 1.1～2 倍也讀得對", async () => {
    for (const scale of [1.1, 1.25, 1.5, 1.75, 2]) expect(counts(scaleFrame(await loadFixture("window-1364.png"), scale))).toEqual(REAL);
  });

  it("1920×1080 場景讀得對", async () => {
    expect(counts(quickslotOnScene(await loadFixture("window-1364.png")))).toEqual(REAL);
  });

  // 0～9 每個字都要出現（v1.05 的教訓：基準截圖缺的字最容易認錯）；3、5、6、8 基準截圖沒有
  const SETS: Array<Array<number | null>> = [
    [1234, 5678, 90, 3, 8, 6, 5, 9],
    [3, 58, 6, 8888, 3333, 5555, 6666, 7],
    [10, 0, 99, 100, 4, 2, 1, 6385],
  ];

  it("all digits：畫進格子的 0～9 都讀對（1 倍）", async () => {
    const base = await loadFixture("window-1364.png");
    const rects = findQuickslot(base, findStatusBar(base)!)!;
    for (const set of SETS) {
      const frame = set.reduce<Frame>((f, count, i) => paintSlotCount(f, rects[i], count), base);
      expect(counts(frame)).toEqual(set);
    }
  });

  it("all digits：縮放 1.1～2 倍也讀對", async () => {
    const base = await loadFixture("window-1364.png");
    const rects = findQuickslot(base, findStatusBar(base)!)!;
    for (const set of SETS) {
      const frame = set.reduce<Frame>((f, count, i) => paintSlotCount(f, rects[i], count), base);
      for (const scale of [1.1, 1.25, 1.5, 1.75, 2]) expect(counts(scaleFrame(frame, scale))).toEqual(set);
    }
  });

  it("unreadable is null：數字下半被蓋暗（像冷卻遮罩）→ null，不是錯的數", async () => {
    const base = await loadFixture("window-1364.png");
    const rects = findQuickslot(base, findStatusBar(base)!)!;
    const frame = paintSlotCount(base, rects[1], 702);
    const data = new Uint8ClampedArray(frame.data);
    for (let y = rects[1].y + 24; y < rects[1].y + 30; y++) {
      for (let x = rects[1].x; x < rects[1].x + 24; x++) {
        const i = (y * frame.width + x) * 4;
        for (let k = 0; k < 3; k++) data[i + k] = Math.round(data[i + k] * 0.15);
      }
    }
    expect(counts({ ...frame, data })![1]).toBeNull();
  });

  it("unreadable is null：數字右半被圖示蓋掉 → null，不是只讀前面幾位", async () => {
    const base = await loadFixture("window-1364.png");
    const rects = findQuickslot(base, findStatusBar(base)!)!;
    const frame = paintSlotCount(base, rects[1], 702);
    const data = new Uint8ClampedArray(frame.data);
    // 「0」的右半跟「2」整個蓋成亮灰（像白色圖示壓在上面）
    for (let y = rects[1].y + 19; y < rects[1].y + 30; y++) {
      for (let x = rects[1].x + 12; x < rects[1].x + 24; x++) data.set([200, 200, 200, 255], (y * frame.width + x) * 4);
    }
    expect(counts({ ...frame, data })![1]).toBeNull();
  });
});
