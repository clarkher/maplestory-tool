import { describe, expect, it } from "vitest";
import { curveBars, lowRunText, nextCurve, type Curve } from "../curve";
import type { Segment } from "../tracker";

const seg = (startedAt: number, gained: number): Segment => ({
  mode: "auto", startedAt, endedAt: startedAt, lastChangeAt: startedAt, startLevel: 10, level: 10, exp: 0,
  job: null, party: 1, mapKey: null, gained, levelUps: 0, deaths: 0, byMap: {},
});
const MIN = 60000;

describe("每分鐘經驗曲線", () => {
  it("accumulates per minute", () => {
    let c: Curve | null = null;
    c = nextCurve(c, seg(0, 100), 10_000);
    c = nextCurve(c, seg(0, 300), MIN + 10_000);
    c = nextCurve(c, seg(0, 600), 2 * MIN + 10_000);
    expect(c?.minutes).toEqual([100, 200, 300]);
  });
  it("new segment resets", () => {
    let c = nextCurve(null, seg(0, 100), 1000);
    c = nextCurve(c, seg(5 * MIN, 50), 5 * MIN + 1000);
    expect(c).toMatchObject({ startedAt: 5 * MIN, lastGained: 50, minutes: [50] });
    expect(nextCurve(c, null, 0)).toBeNull();
  });
  it("level up keeps positive", () => {
    let c = nextCurve(null, seg(0, 100), 1000);
    c = nextCurve(c, seg(0, 100), 2000);
    c = nextCurve(c, seg(0, 90), 3000);
    expect(c?.minutes).toEqual([100]);
    expect(c?.lastGained).toBe(100);
  });
  it("gap minutes are zero", () => {
    let c = nextCurve(null, seg(0, 100), 1000);
    c = nextCurve(c, seg(0, 150), 3 * MIN + 1000);
    expect(c?.minutes).toEqual([100, 0, 0, 50]);
  });
  it("last 60 only", () => {
    const c: Curve = { startedAt: 0, lastGained: 0, minutes: Array.from({ length: 100 }, (_, i) => i + 1) };
    const bars = curveBars(c, 99 * MIN + 1000);
    expect(bars).toHaveLength(60);
    expect(bars[0].value).toBe(41);
    expect(bars[59]).toMatchObject({ value: 100, current: true, low: false });
  });
  const mk = (minutes: number[]): Curve => ({ startedAt: 0, lastGained: 0, minutes });
  it("low bar and text", () => {
    const a = curveBars(mk([500, 500, 100, 500]), 4 * MIN + 1000);
    expect(a.map((b) => b.low)).toEqual([false, false, true, false, false]);
    expect(lowRunText(a, 5)).toBe("第 3 分鐘掉很多（可能死了或在補藥）");
    const b = curveBars(mk([500, 100, 100, 500]), 4 * MIN + 1000);
    expect(lowRunText(b, 5)).toBe("第 2～3 分鐘掉很多（可能死了或在補藥）");
    expect(lowRunText(curveBars(mk([500, 500]), MIN + 1000), 2)).toBeNull();
  });
  it("current minute is not judged", () => {
    const bars = curveBars(mk([500, 500, 500, 20]), 3 * MIN + 1000);
    expect(bars.some((b) => b.low)).toBe(false);
    expect(bars[3].current).toBe(true);
    expect(lowRunText(bars, 4)).toBeNull();
  });
  it("idle minutes after the run are low", () => {
    const bars = curveBars(mk([500, 0, 0, 500]), 4 * MIN + 1000);
    expect(lowRunText(bars, 5)).toBe("第 2～3 分鐘掉很多（可能死了或在補藥）");
  });
  it("pads zero minutes up to now", () => {
    const bars = curveBars(mk([500, 500]), 4 * MIN + 1000);
    expect(bars).toHaveLength(5);
    expect(bars.map((b) => b.low)).toEqual([false, false, true, true, false]);
    expect(lowRunText(bars, 5)).toBe("第 3～4 分鐘掉很多（可能死了或在補藥）");
  });
});
