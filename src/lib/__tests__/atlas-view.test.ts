import { describe, expect, it } from "vitest";
import { doorList, labelSides, levelRange, mapSummary, MOB_COLORS, mobColor, npcSummary, pinPercent, shopRows, showNpcLabels } from "@/lib/atlas-view";
import type { AtlasMap, AtlasNpc } from "@/lib/types";

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

describe("labelSides", () => {
  const b = map1020000.b!;
  const overlap = (p: { left: number; top: number }, q: { left: number; top: number }, sp: string, sq: string) =>
    sp === sq && Math.abs(p.top - q.top) < 6 && Math.abs(p.left - q.left) < 14;

  it("1020000 麥加跟「往 楓葉村」不互相蓋住", () => {
    const npc = pinPercent(b, [-21, 87]);
    const door = pinPercent(b, [-216, 93]);
    const sides = labelSides([npc, door]);
    expect(sides[0]).toBe("up");
    expect(overlap(npc, door, sides[0], sides[1])).toBe(false);
  });
  it("兩個靠很近的門，後面那個翻到下面", () => {
    expect(labelSides([{ left: 82.7, top: 73.4 }, { left: 93.9, top: 73.6 }])).toEqual(["up", "down"]);
  });
  it("離很遠的照舊放上面；靠上緣的放下面", () => {
    expect(labelSides([{ left: 10, top: 50 }, { left: 60, top: 50 }, { left: 30, top: 5 }])).toEqual(["up", "up", "down"]);
  });
});

describe("shopRows", () => {
  const duringEvent = Date.parse("2026-10-24T12:00:00+08:00");
  const afterEvent = Date.parse("2026-11-12T00:00:00+08:00");
  const end = "2026-11-11T23:59+08:00";

  it("常駐的照價格由低到高，寫「N 楓幣」", () => {
    const rows = shopRows([
      { id: 1072026, pr: 9000, s: "鞋子" },
      { id: 1002033, pr: 3000, s: "帽子" },
      { id: 1041008, pr: 5500, s: "上衣" },
    ], duringEvent);
    expect(rows.map(row => [row.id, row.price, row.until])).toEqual([
      [1002033, "3,000 楓幣", undefined],
      [1041008, "5,500 楓幣", undefined],
      [1072026, "9,000 楓幣", undefined],
    ]);
  });

  it("活動店沒過期：標到幾號、寫真的幣別跟一次幾個，排在常駐後面", () => {
    const rows = shopRows([
      { id: 2047421, pr: 3, u: "萬聖節硬幣", e: end, s: "卷軸" },
      { id: 2001001, pr: 1, k: 10, u: "萬聖節硬幣", e: end, s: "藥水" },
      { id: 1002033, pr: 3000, s: "帽子" },
    ], duringEvent);
    expect(rows.map(row => [row.id, row.price, row.until])).toEqual([
      [1002033, "3,000 楓幣", undefined],
      [2001001, "10 個 1 萬聖節硬幣", "11/11"],
      [2047421, "3 萬聖節硬幣", "11/11"],
    ]);
    expect(rows[1].e).toBe(end);
  });

  it("活動結束後（11/12 起）活動店不列；23:59 那一分鐘還算開著", () => {
    const shop = [{ id: 2001001, pr: 1, k: 10, u: "萬聖節硬幣", e: end, s: "藥水" }, { id: 1002033, pr: 3000, s: "帽子" }];
    expect(shopRows(shop, afterEvent).map(row => row.id)).toEqual([1002033]);
    expect(shopRows(shop, Date.parse("2026-11-11T23:59:30+08:00"))).toHaveLength(2);
    expect(shopRows(undefined, duringEvent)).toEqual([]);
  });
});

describe("npcSummary", () => {
  const sam: AtlasNpc = { id: 1011001, n: "山姆", img: 1, maps: [100000101], shop: Array.from({ length: 90 }, (_, i) => ({ id: i, pr: 100, s: "鞋子" })) };
  const names = (id: number) => ({ 100000101: "弓箭手村武器店", 1020000: "楓葉村東郊平原" } as Record<number, string>)[id];

  it("山姆：在哪、賣幾樣", () => {
    const text = npcSummary(sam, names);
    expect(text).toContain("弓箭手村武器店");
    expect(text).toContain("90 樣");
    expect(text).not.toContain("任務");
  });
  it("麥加：在哪、幾個任務，不提賣東西", () => {
    const maple: AtlasNpc = { id: 12100, n: "麥加", maps: [1020000], quests: [{ id: "1016", n: "麥加的修煉", r: "接・交" }, { id: "1019", n: "桑姆的考驗", r: "交" }] };
    expect(npcSummary(maple, names)).toBe("麥加在楓葉村東郊平原，有 2 個任務。");
  });
  it("同名的分流圖只寫一次（行商人開在 5 張雪原的面具祭典現場）", () => {
    const vendor: AtlasNpc = { id: 9402818, n: "行商人", maps: [1, 2, 3, 4, 5], shop: [{ id: 2001001, pr: 1, s: "藥水" }] };
    expect(npcSummary(vendor, () => "雪原的面具祭典現場")).toBe("行商人在雪原的面具祭典現場，賣 1 樣東西。");
  });
});
