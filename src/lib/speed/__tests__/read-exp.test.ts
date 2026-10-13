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

  it.each([1.25, 1.5, 2])("放大 %s 倍也找得到，scale 跟著變", async scale => {
    const bar = findStatusBar(await loadFixture("window-1364.png", scale))!;
    expect(bar).not.toBeNull();
    expect(bar.scale).toBeCloseTo(scale, 0);
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
