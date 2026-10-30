// src/lib/speed/__tests__/meso.test.ts
import { describe, expect, it } from "vitest";
import { mesoRates } from "../meso";

describe("mesoRates", () => {
  it("開始 1,000,000、20 分鐘後 1,060,000、藥水每 10 分鐘 3,360 → 淨 30,000、撿到 33,360", () => {
    const r = mesoRates({ startMeso: 1_000_000, startAt: 0, nowMeso: 1_060_000, nowAt: 20 * 60000 }, 3360);
    expect(r).toEqual({ net10: 30000, picked10: 33360 });
  });
  it("時間差 30 秒 → null", () => {
    expect(mesoRates({ startMeso: 1, startAt: 0, nowMeso: 99, nowAt: 30000 }, 0)).toEqual({ net10: null, picked10: null });
  });
  it("沒有起點 → null", () => {
    expect(mesoRates(null, 0)).toEqual({ net10: null, picked10: null });
  });
});
