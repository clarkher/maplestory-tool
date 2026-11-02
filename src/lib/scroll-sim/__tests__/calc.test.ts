import { describe, expect, it } from "vitest";
import { simulate, simTable } from "@/lib/scroll-sim/calc";

describe("simulate 衝卷計算", () => {
  it("60% 衝 5/5", () => {
    const r = simulate({ tuc: 5, k: 5, rate: 60, boom: 0 });
    expect(r.p).toBeCloseTo(0.0778, 3);
    expect(r.tiny).toBe(false);
    expect(r.items90).toBe(29);
    expect(r.scrolls90).toBe(64);
    expect(r.avgItems).toBeCloseTo(12.86, 1);
    expect(r.avgScrolls).toBeCloseTo(29.7, 1);
    expect(r.avgWhite).toBe(0);
  });
  it("60% 衝 4/5", () => {
    const r = simulate({ tuc: 5, k: 4, rate: 60, boom: 0 });
    expect(r.p).toBeCloseTo(0.337, 3);
    expect(r.items90).toBe(6);
    expect(r.scrolls90).toBe(22);
  });
  it("詛咒 70% 爆 50% 衝 5/5", () => {
    const r = simulate({ tuc: 5, k: 5, rate: 70, boom: 0.5 });
    expect(r.p).toBeCloseTo(0.168, 3);
    expect(r.items90).toBe(13);
    expect(r.scrolls90).toBe(33);
  });
  it("100% 卷", () => {
    const r = simulate({ tuc: 5, k: 3, rate: 100, boom: 0 });
    expect(r.p).toBe(1);
    expect(r.avgScrolls).toBeCloseTo(3, 9);
    expect(r.items90).toBe(1);
    expect(r.scrolls90).toBe(3);
  });
  it("10% 衝 7/7 是天文數字：tiny、不算張數、很快", () => {
    const t0 = performance.now();
    const r = simulate({ tuc: 7, k: 7, rate: 10, boom: 0 });
    expect(performance.now() - t0).toBeLessThan(50);
    expect(r.tiny).toBe(true);
    expect(r.items90).toBeNull();
    expect(r.scrolls90).toBeNull();
  });
  it("15% 衝 10/10 不丟例外", () => {
    const r = simulate({ tuc: 10, k: 10, rate: 15, boom: 0 });
    expect(r.tiny).toBe(true);
    expect(r.items90).toBeNull();
  });
  it("tuc 15 的極端組合也很快、沒有 NaN", () => {
    const t0 = performance.now();
    for (const rate of [10, 30, 60, 100]) {
      for (const boom of [0, 0.5, 1]) {
        for (const w of [undefined, 10]) {
          const r = simulate({ tuc: 15, k: 15, rate, boom, whiteRate: w });
          expect(Number.isNaN(r.p)).toBe(false);
          expect(Number.isNaN(r.avgScrolls)).toBe(false);
        }
      }
    }
    expect(performance.now() - t0).toBeLessThan(500);
  });
  it("白衣：一般卷一定衝成", () => {
    const r = simulate({ tuc: 5, k: 5, rate: 60, boom: 0, whiteRate: 10 });
    expect(r.p).toBe(1);
    expect(r.avgScrolls).toBeCloseTo(5 / 0.6, 6);
    expect(r.avgWhite).toBeCloseTo((5 / 0.6 - 5) * 10, 6);
    expect(r.items90).toBe(1);
    expect(r.scrolls90).toBeGreaterThanOrEqual(5);
  });
  it("白衣＋詛咒卷", () => {
    const r = simulate({ tuc: 5, k: 5, rate: 70, boom: 0.5, whiteRate: 20 });
    expect(r.p).toBeGreaterThan(0);
    expect(r.p).toBeLessThan(1);
    expect(r.avgWhite).toBeGreaterThan(0);
  });
  it("simTable 長度 tuc、p 隨 k 遞減", () => {
    const rows = simTable(5, 60, 0);
    expect(rows).toHaveLength(5);
    expect(rows.map((x) => x.k)).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < rows.length; i++) expect(rows[i].p).toBeLessThan(rows[i - 1].p);
  });
});
