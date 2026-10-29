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
    const bars = curveBars(c);
    expect(bars).toHaveLength(60);
    expect(bars[0].value).toBe(41);
    expect(bars[59].value).toBe(100);
  });
  it("low bar and text", () => {
    const mk = (minutes: number[]): Curve => ({ startedAt: 0, lastGained: 0, minutes });
    const a = curveBars(mk([500, 500, 100, 500]));
    expect(a.map((b) => b.low)).toEqual([false, false, true, false]);
    expect(lowRunText(a, 4)).toBe("第 3 分鐘掉很多（可能死了或在補藥）");
    const b = curveBars(mk([500, 100, 100, 500]));
    expect(lowRunText(b, 4)).toBe("第 2～3 分鐘掉很多（可能死了或在補藥）");
    expect(lowRunText(curveBars(mk([500, 500])), 2)).toBeNull();
  });
});
