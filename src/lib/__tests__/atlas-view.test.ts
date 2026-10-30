import { describe, expect, it } from "vitest";
import { doorList, levelRange, mapSummary, MOB_COLORS, mobColor, pinPercent, showNpcLabels } from "@/lib/atlas-view";
import type { AtlasMap } from "@/lib/types";

const map1020000: AtlasMap = {
  id: 1020000,
  n: "楓葉村東郊平原",
  st: "彩虹之地",
  rg: "楓之島",
  ret: 1000000,
  b: [-422, -694, 2240, 1216],
  mobs: [
    { id: 130100, n: "木妖", lv: 4, k: 7, p: [[303, 194]], pg: 1 },
    { id: 130101, n: "紅寶", lv: 4, k: 7, p: [[1488, 79]], pg: 1 },
    { id: 210100, n: "綠水靈", lv: 6, k: 4, p: [[928, -220]], pg: 1 },
    { id: 1210100, n: "肥肥", lv: 7, k: 3, p: [[1124, -574]], pg: 1 },
  ],
  npcs: [{ id: 12100, n: "麥加", x: -21, y: 87 }],
  doors: [
    { to: 1000005, n: "草叢狩獵場Ⅰ", p: [[713, -571]] },
    { to: 1010000, n: "楓葉村", p: [[-216, 93]] },
  ],
};

const npc = (id: number) => ({ id, n: `N${id}`, x: 0, y: 0 });

describe("pinPercent", () => {
  it("麥加在 1020000 的位置", () => {
    const pos = pinPercent(map1020000.b!, [-21, 87]);
    expect(pos.left).toBeCloseTo(17.9, 1);
    expect(Math.abs(pos.top - 64.2)).toBeLessThan(0.1);
  });
  it("超出範圍就夾在 0～100", () => {
    expect(pinPercent([0, 0, 100, 100], [-50, 500])).toEqual({ left: 0, top: 100 });
  });
});

describe("mobColor", () => {
  it("6 色依序給、超過就循環", () => {
    expect(MOB_COLORS).toHaveLength(6);
    expect(mobColor(0)).toBe("#3f8f4f");
    expect(mobColor(6)).toBe(mobColor(0));
    expect(mobColor(7)).toBe("#d4553a");
  });
});

describe("levelRange", () => {
  it("等級有範圍", () => expect(levelRange(map1020000.mobs)).toBe("4～7 等"));
  it("同等級", () => expect(levelRange([{ id: 1, n: "a", lv: 12, k: 1, p: [] }, { id: 2, n: "b", lv: 12, k: 1, p: [] }])).toBe("12 等"));
  it("沒怪", () => expect(levelRange([])).toBeUndefined());
});

describe("showNpcLabels", () => {
  it("6 個以下寫名字", () => expect(showNpcLabels([1, 2, 3, 4, 5, 6].map(npc))).toBe(true));
  it("7 個只畫菱形", () => expect(showNpcLabels([1, 2, 3, 4, 5, 6, 7].map(npc))).toBe(false));
});

describe("doorList", () => {
  it("同目的地合併、座標接在一起", () => {
    const doors = doorList([
      { to: 1, n: "甲", p: [[1, 1]] },
      { to: 2, n: "乙", p: [] },
      { to: 1, n: "甲", p: [[2, 2]] },
    ]);
    expect(doors).toEqual([
      { to: 1, n: "甲", p: [[1, 1], [2, 2]] },
      { to: 2, n: "乙", p: [] },
    ]);
  });
});

describe("mapSummary", () => {
  const nameOf = (id: number) => (id === 1000000 ? "楓葉村" : undefined);
  it("1020000 寫出怪、NPC、門", () => {
    const text = mapSummary(map1020000, nameOf);
    expect(text).toContain("楓葉村東郊平原（楓之島・彩虹之地）");
    expect(text).toContain("木妖 7 隻");
    expect(text).toContain("麥加");
    expect(text).toContain("可以通往草叢狩獵場Ⅰ、楓葉村");
  });
  it("只有門的圖不寫怪、NPC", () => {
    const text = mapSummary({ ...map1020000, mobs: [], npcs: [] }, nameOf);
    expect(text).not.toContain("NPC");
    expect(text).not.toContain("隻");
    expect(text).toContain("可以通往");
  });
});
