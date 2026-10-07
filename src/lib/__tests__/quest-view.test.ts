import { describe, expect, it } from "vitest";
import { boardNote, compareListLevel, levelNote, listLevel, questBoard } from "@/lib/quest-view";
import type { Quest } from "@/lib/types";

const q = (id: string, extra: Partial<Quest> = {}): Quest => ({ id, n: `任務${id}`, cat: "維多利亞島", ...extra });
const profile = { level: 35, job: 130 };

describe("任務清單的等級：有需求等級用需求等級，沒寫的用建議等級", () => {
  const effective = new Map([["2", 18], ["3", 0]]);
  it("有 minLv 的照寫；沒寫的用推算的建議等級；推不出來回 null", () => {
    expect(listLevel(q("1", { minLv: 30 }), effective)).toEqual({ level: 30, suggested: false });
    expect(listLevel(q("2"), effective)).toEqual({ level: 18, suggested: true });
    expect(listLevel(q("3"), effective)).toBeNull();
    expect(listLevel(q("4"), effective)).toBeNull();
  });
  it("小字：Lv.30／建議 Lv.18／推不出來寫分類", () => {
    expect(levelNote(q("1", { minLv: 30 }), { level: 30, suggested: false })).toBe("Lv.30");
    expect(levelNote(q("2"), { level: 18, suggested: true })).toBe("建議 Lv.18");
    expect(levelNote(q("3", { cat: "稱號" }), null)).toBe("稱號");
  });
  it("排序：等級由低到高，推不出來的排最後", () => {
    const levels = [null, { level: 30, suggested: false }, { level: 18, suggested: true }];
    expect([...levels].sort(compareListLevel)).toEqual([{ level: 18, suggested: true }, { level: 30, suggested: false }, null]);
  });
});

describe("「只看我現在接得到的」：分段、做完的不列、前置還沒做的排後面", () => {
  it("分段順序：快過期 → 剛解鎖 → 隨時可以補", () => {
    const rows = questBoard([q("a", { minLv: 10 }), q("b", { minLv: 30 }), q("c", { minLv: 30, maxLv: 38 })], profile, new Set());
    expect(rows.map(row => [row.quest.id, row.bucket])).toEqual([["c", "expiring"], ["b", "fresh"], ["a", "backlog"]]);
  });

  it("同一段裡：快過期的剩得少的在前；需求等級一樣的，經驗多的在前", () => {
    const quests = [
      q("late", { minLv: 30, maxLv: 41 }),
      q("soon", { minLv: 30, maxLv: 36 }),
      q("lo", { minLv: 20, exp: 100 }),
      q("hi", { minLv: 20, exp: 900 }),
    ];
    expect(questBoard(quests, profile, new Set()).map(row => row.quest.id)).toEqual(["soon", "late", "hi", "lo"]);
  });

  it("做完的不列；卡片開著的那一筆例外", () => {
    const quests = [q("a", { minLv: 30 }), q("b", { minLv: 31 })];
    expect(questBoard(quests, profile, new Set(["a"])).map(row => row.quest.id)).toEqual(["b"]);
    expect(questBoard(quests, profile, new Set(["a"]), "a").map(row => row.quest.id).sort()).toEqual(["a", "b"]);
  });

  it("前置沒打勾、角色還接得到那個前置：照列，排在同一段能直接接的後面", () => {
    // 三個都是剛解鎖：能直接接的 y（Lv.31）、p（Lv.30）照需求等級新的在前，x 要先做 p 排最後
    const quests = [q("p", { minLv: 30 }), q("x", { minLv: 32, pre: ["p"] }), q("y", { minLv: 31 })];
    const rows = questBoard(quests, profile, new Set());
    expect(rows.map(row => row.quest.id)).toEqual(["y", "p", "x"]);
    expect(rows.find(row => row.quest.id === "x")!.missingPre.map(pre => pre.id)).toEqual(["p"]);
  });

  it("前置打勾了就不擋；前置已經接不到（過了等級上限、楓之島）也不擋", () => {
    const done = questBoard([q("p", { minLv: 30 }), q("x", { minLv: 32, pre: ["p"] })], profile, new Set(["p"]));
    expect(done.find(row => row.quest.id === "x")!.missingPre).toEqual([]);
    const gone = questBoard([q("p", { maxLv: 20 }), q("i", { island: 1 }), q("x", { minLv: 32, pre: ["p", "i"] })], profile, new Set());
    expect(gone.find(row => row.quest.id === "x")!.missingPre).toEqual([]);
  });

  it("前置是別的職業才接得到的不擋；是自己這條職業線（含前身）的照擋", () => {
    // 槍騎兵（130）的前身是劍士（100）；盜賊（400）的任務他接不到
    const other = questBoard([q("p", { jobs: [400] }), q("x", { minLv: 32, pre: ["p"] })], profile, new Set());
    expect(other.find(row => row.quest.id === "x")!.missingPre).toEqual([]);
    const mine = questBoard([q("p", { jobs: [100] }), q("x", { minLv: 32, pre: ["p"] })], profile, new Set());
    expect(mine.find(row => row.quest.id === "x")!.missingPre.map(pre => pre.id)).toEqual(["p"]);
  });

  it("開發測試任務不列", () => {
    expect(questBoard([q("9999", { n: "開發測試用" })], profile, new Set())).toEqual([]);
  });
});

describe("「接得到的」小字", () => {
  it("要先做：寫第一個前置的名字，兩個以上加「等 N 個」", () => {
    expect(boardNote({ quest: q("x"), bucket: "fresh", missingPre: [q("p", { n: "瑞恩的測驗1" })] })).toBe("要先做：瑞恩的測驗1");
    expect(boardNote({ quest: q("x"), bucket: "fresh", missingPre: [q("p", { n: "甲" }), q("r", { n: "乙" })] })).toBe("要先做：甲 等 2 個");
  });
  it("快過期：再 N 級接不到（上限 40、現在 35 → 升到 41 接不到 → 再 6 級）", () => {
    expect(boardNote({ quest: q("x", { maxLv: 40 }), bucket: "expiring", levelsLeft: 5, missingPre: [] })).toBe("再 6 級接不到");
  });
  it("其他回 null（畫面改寫等級）", () => {
    expect(boardNote({ quest: q("x"), bucket: "backlog", missingPre: [] })).toBeNull();
  });
});
