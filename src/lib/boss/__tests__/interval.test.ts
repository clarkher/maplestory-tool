import { describe, expect, it } from "vitest";
import { intervalOnKill, medianMinutes } from "@/lib/boss/interval";
import type { BossEvent } from "@/lib/boss/types";

const T0 = 1_800_000_000_000;
const MIN = 60_000;
const e = (kind: "kill" | "empty", min: number, ch = 1, boss = 1, server: "xuejila" | "gugu" = "xuejila"): BossEvent => ({
  id: `${kind}${min}`, server, boss, ch, kind, at: T0 + min * MIN,
});

describe("intervalOnKill", () => {
  it("interval basic", () => {
    expect(intervalOnKill(e("kill", 0), e("kill", 51))).toBe(3060);
  });
  it("沒有前一筆 → null", () => {
    expect(intervalOnKill(undefined, e("kill", 51))).toBeNull();
  });
  it("ignores double tap", () => {
    expect(intervalOnKill(e("kill", 0), e("kill", 2))).toBeNull();
    expect(intervalOnKill(e("kill", 0), e("kill", 420))).toBeNull();
    expect(intervalOnKill(e("empty", 0), e("kill", 51))).toBeNull();
    expect(intervalOnKill(e("kill", 0), e("empty", 51))).toBeNull();
    expect(intervalOnKill(e("kill", 0, 1), e("kill", 51, 2))).toBeNull();
    expect(intervalOnKill(e("kill", 0, 1, 1), e("kill", 51, 1, 2))).toBeNull();
    expect(intervalOnKill(e("kill", 0, 1, 1, "xuejila"), e("kill", 51, 1, 1, "gugu"))).toBeNull();
  });
  it("邊界含頭尾", () => {
    expect(intervalOnKill(e("kill", 0), e("kill", 10))).toBe(600);
    expect(intervalOnKill(e("kill", 0), e("kill", 360))).toBe(21600);
    expect(intervalOnKill(e("kill", 0), e("kill", 9.99))).toBeNull();
    expect(intervalOnKill(e("kill", 0), e("kill", 360.1))).toBeNull();
  });
});

describe("medianMinutes", () => {
  it("median", () => {
    expect(medianMinutes([2700, 2760, 3600])).toBe(46);
  });
  it("偶數個取中間兩個平均", () => {
    expect(medianMinutes([2700, 3300, 3000, 3600])).toBe(53); // (3000+3300)/2=3150s=52.5 分 → 53
  });
  it("不改動輸入", () => {
    const a = [3600, 60, 120];
    medianMinutes(a);
    expect(a).toEqual([3600, 60, 120]);
  });
});
