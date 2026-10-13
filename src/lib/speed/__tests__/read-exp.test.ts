// src/lib/speed/__tests__/read-exp.test.ts
import { describe, expect, it } from "vitest";
import { findStatusBar } from "../status-bar";
import { readExpText } from "../read-exp";
import { loadFixture } from "./fixture";

describe("找狀態列", () => {
  it("基準截圖：HP、MP、EXP 三條，EXP 條 809～976、高 18", async () => {
    const bar = findStatusBar(await loadFixture("window-1364.png"))!;
    expect(bar.exp[0]).toBeGreaterThanOrEqual(807);
    expect(bar.exp[0]).toBeLessThanOrEqual(811);
    expect(bar.exp[1]).toBeGreaterThanOrEqual(974);
    expect(bar.exp[1]).toBeLessThanOrEqual(978);
    expect(bar.bottom - bar.top).toBe(18);
    expect(bar.scale).toBeCloseTo(1, 1);
    expect(bar.hp[0]).toBeLessThan(bar.mp[0]);
  });

  it.each([1.25, 1.5, 2])("放大 %s 倍也找得到，scale 跟著變（誤差 5% 內）", async scale => {
    const bar = findStatusBar(await loadFixture("window-1364.png", scale))!;
    expect(bar).not.toBeNull();
    expect(Math.abs(bar.scale / scale - 1)).toBeLessThan(0.05);
  });

  // 視窗大小隨便拉都要認得到：0.90～2.00 每 0.05 一格，外加以前會認不到的幾格
  // （HP、MP 中間那條只有 1px 的縫，縮放後亮起來，兩條會黏成一段）
  const SWEEP = [
    ...Array.from({ length: 23 }, (_, i) => Math.round((0.9 + i * 0.05) * 100) / 100),
    0.99, 1.01, 1.02, 1.08, 1.11,
  ];
  it.each(SWEEP)("縮放 %s 倍：找得到三條，scale 誤差 5% 內，三條寬度一致、由左到右", async scale => {
    const bar = findStatusBar(await loadFixture("window-1364.png", scale));
    expect(bar).not.toBeNull();
    expect(Math.abs(bar!.scale / scale - 1)).toBeLessThan(0.05);
    const [hp, mp, exp] = [bar!.hp, bar!.mp, bar!.exp].map(([a, b]) => b - a);
    expect(Math.max(hp, mp, exp)).toBeLessThanOrEqual(Math.min(hp, mp, exp) * 1.1);
    expect(bar!.hp[1]).toBeLessThanOrEqual(bar!.mp[0]);
    expect(bar!.mp[1]).toBeLessThan(bar!.exp[0]);
  });

  it("全黑畫面找不到", () => {
    const frame = { width: 400, height: 300, data: new Uint8ClampedArray(400 * 300 * 4) };
    expect(findStatusBar(frame)).toBeNull();
  });
});

describe("讀 EXP 那行", () => {
  it.each([1, 1.25, 1.5, 2])("放大 %s 倍：最後一組的數字開頭是 406947", async scale => {
    const frame = await loadFixture("window-1364.png", scale);
    const text = readExpText(frame, findStatusBar(frame)!);
    const last = text.trim().split(/\s+/).pop()!;
    expect(last.replace(/\D/g, "").startsWith("406947")).toBe(true);
  });
});
