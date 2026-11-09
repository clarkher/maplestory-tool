import { describe, it, expect } from "vitest";
import { addedGroups, changedKinds, numberDiff, textDiff } from "../patch-view";
import type { PatchFile } from "../patches";

describe("textDiff", () => {
  it("切掉共同前後綴，中間一段刪、一段加", () => {
    expect(textDiff("各 1500 。", "各 1200 。")).toEqual([
      { t: "same", v: "各 1" },
      { t: "del", v: "5" },
      { t: "ins", v: "2" },
      { t: "same", v: "00 。" },
    ]);
  });
  it("完全相同回一段 same", () => {
    expect(textDiff("一樣", "一樣")).toEqual([{ t: "same", v: "一樣" }]);
  });
  it("只有加字：沒有空的 del", () => {
    expect(textDiff("HP 20", "HP 20、MP 30")).toEqual([
      { t: "same", v: "HP 20" },
      { t: "ins", v: "、MP 30" },
    ]);
  });
  it("前後綴不重疊（aa → aaa）", () => {
    const parts = textDiff("aa", "aaa");
    expect(parts.filter(p => p.t !== "ins").map(p => p.v).join("")).toBe("aa");
    expect(parts.filter(p => p.t !== "del").map(p => p.v).join("")).toBe("aaa");
  });
  it("兩邊都空回空陣列", () => {
    expect(textDiff("", "")).toEqual([]);
  });
});

describe("numberDiff（畫面用：改到數字中間就整個數字換）", () => {
  it("1500 → 1200 整個數字", () => {
    expect(numberDiff("各 1500 。", "各 1200 。")).toEqual([
      { t: "same", v: "各 " },
      { t: "del", v: "1500" },
      { t: "ins", v: "1200" },
      { t: "same", v: " 。" },
    ]);
  });
  it("後面接著數字也一起吃進來", () => {
    expect(numberDiff("恢復HP20。", "恢復HP40，MP30。")).toEqual([
      { t: "same", v: "恢復HP" },
      { t: "del", v: "20" },
      { t: "ins", v: "40，MP30" },
      { t: "same", v: "。" },
    ]);
  });
  it("改的不是數字就照 textDiff", () => {
    expect(numberDiff("A1好", "A1壞")).toEqual(textDiff("A1好", "A1壞"));
    expect(numberDiff("同", "同")).toEqual([{ t: "same", v: "同" }]);
  });
});

describe("changedKinds", () => {
  const row = (kind: string) => ({ id: 1, n: "x", kind, before: "a", after: "b" });
  it("照「說明、商店、掉落、能力、名稱」排，0 筆不列", () => {
    const rows = [row("掉落"), row("名稱"), row("掉落"), row("說明")];
    expect(changedKinds(rows)).toEqual([
      { kind: "說明", count: 1 },
      { kind: "掉落", count: 2 },
      { kind: "名稱", count: 1 },
    ]);
  });
  it("沒有資料回空陣列", () => {
    expect(changedKinds([])).toEqual([]);
  });
});

describe("addedGroups", () => {
  const patch: Pick<PatchFile, "added" | "counts"> = {
    counts: { items: 6, looks: 500, quests: 3, monsters: 1, maps: 1, changed: 0, goneItems: 0, goneLooks: 0, goneQuests: 0 },
    added: {
      items: [
        { id: 1, n: "帽A", c: "時裝", s: "帽子" },
        { id: 2, n: "卷A", c: "消耗", s: "卷軸" },
        { id: 3, n: "卷B", c: "消耗", s: "卷軸" },
        { id: 4, n: "卷C", c: "消耗", s: "卷軸" },
        { id: 5, n: "帽B", c: "時裝", s: "帽子" },
        { id: 6, n: "椅", c: "裝飾", s: "椅子" },
      ],
      quests: [
        { id: "10", n: "q1", cat: "活動", area: "活動" },
        { id: "11", n: "q2", cat: "冰原雪域", area: "冰原雪域" },
        { id: "12", n: "q3", cat: "冰原雪域", area: "冰原雪域" },
      ] as unknown as PatchFile["added"]["quests"],
      monsters: [{ id: 100, n: "怪", lv: 10 }],
      maps: [{ id: 200, zh: "地圖", st: "隱藏地圖" }],
    },
  };

  it("道具照子分類多到少，再任務照地區，再怪物、地圖", () => {
    const groups = addedGroups(patch);
    expect(groups.map(g => [g.type, g.label, g.count])).toEqual([
      ["item", "卷軸", 3],
      ["item", "帽子", 2],
      ["item", "椅子", 1],
      ["quest", "冰原雪域", 2],
      ["quest", "活動", 1],
      ["monster", "怪物", 1],
      ["map", "地圖", 1],
    ]);
    expect(groups[0].rows.map(r => r.id)).toEqual([2, 3, 4]);
  });

  it("髮型臉型不在裡面（只有 looks 數字，不出組）", () => {
    const labels = addedGroups(patch).map(g => g.label);
    expect(labels.some(l => /髮型|臉型/.test(l))).toBe(false);
    expect(addedGroups(patch).reduce((n, g) => n + (g.type === "item" ? g.count : 0), 0)).toBe(6);
  });

  it("同一個子分類名出現在不同大類，標大類分開", () => {
    const groups = addedGroups({
      ...patch,
      added: {
        ...patch.added,
        items: [
          { id: 1, n: "a", c: "裝備", s: "戒指" },
          { id: 2, n: "b", c: "時裝", s: "戒指" },
          { id: 3, n: "c", c: "時裝", s: "戒指" },
          { id: 4, n: "d", c: "消耗", s: "消耗" },
        ],
        quests: [], monsters: [], maps: [],
      },
    });
    expect(groups.map(g => g.label)).toEqual(["時裝・戒指", "裝備・戒指", "消耗"]);
  });

  it("任務沒有地區歸「其他」；空的大類不出組", () => {
    const groups = addedGroups({
      ...patch,
      added: { items: [], quests: [{ id: "1", n: "q", cat: "x" }] as unknown as PatchFile["added"]["quests"], monsters: [], maps: [] },
    });
    expect(groups.map(g => [g.type, g.label])).toEqual([["quest", "其他"]]);
  });
});
