// src/lib/speed/__tests__/frame-throttle.test.ts
import { describe, expect, it } from "vitest";
import { createFrameThrottle } from "../frame-throttle";

describe("一秒最多讀一張", () => {
  it("第一張一定讀；隔不到一秒的丟掉，滿一秒的讀", () => {
    const due = createFrameThrottle(1000);
    expect(due(5000)).toBe(true);
    expect(due(5200)).toBe(false);
    expect(due(5999)).toBe(false);
    expect(due(6000)).toBe(true);
    expect(due(6400)).toBe(false);
  });

  it("一秒進來五張（5 fps）：每五張讀一張，一分鐘剛好 60 張", () => {
    const due = createFrameThrottle(1000);
    let read = 0;
    for (let i = 0; i < 5 * 60; i++) if (due(1_000_000 + i * 200)) read++;
    expect(read).toBe(60);
  });

  it("是從『上一次讀的那張』算起，被丟掉的不重算", () => {
    const due = createFrameThrottle(1000);
    expect(due(0)).toBe(true);
    expect(due(900)).toBe(false);
    expect(due(1000)).toBe(true);
    expect(due(1900)).toBe(false);
  });

  it("系統時間被往回調：當成隔夠久，不會卡到時間追回來", () => {
    const due = createFrameThrottle(1000);
    expect(due(10_000_000)).toBe(true);
    expect(due(10_000_000 - 3_600_000)).toBe(true);
    expect(due(10_000_000 - 3_600_000 + 300)).toBe(false);
  });
});
