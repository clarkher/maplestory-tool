import { describe, expect, it } from "vitest";
import { minimapScale } from "@/lib/minimap";

describe("minimapScale：小地圖要放大幾倍才不糊、又不會爆版", () => {
  it("91×71 放進 343 寬：整數 3 倍兩邊都還塞得下，給 3", () => {
    expect(minimapScale(91, 71, 343)).toBe(3);
  });

  it("82×218 放進 343 寬：高度先撞到預設上限 260，只能給 1 倍", () => {
    expect(minimapScale(82, 218, 343)).toBe(1);
  });

  it("24×19 這種極小圖：就算整數倍數還塞得下很多倍，也封頂給 3", () => {
    expect(minimapScale(24, 19, 343)).toBe(3);
  });

  it("1265×701 比容器還大：1 倍都放不下，改縮小，寬是卡住的那邊", () => {
    expect(minimapScale(1265, 701, 343)).toBeCloseTo(343 / 1265, 10);
  });

  it("剛好卡在整數倍邊界上（含等於）：91×65 在 273 寬裡 3 倍剛好頂滿寬，算塞得下", () => {
    expect(minimapScale(91, 65, 273)).toBe(3);
  });

  it("maxH 可以自己傳，不一定用預設 260", () => {
    // 91×71 若 maxH 只給 140，2 倍高度 142 超過，退回 1 倍
    expect(minimapScale(91, 71, 343, 140)).toBe(1);
  });

  it("寬高其中一邊是 0（資料異常）：不要除以 0 炸掉，退回 1 倍", () => {
    expect(minimapScale(0, 0, 343)).toBe(1);
  });
});
