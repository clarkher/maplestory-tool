import { describe, expect, it } from "vitest";
import {
  bandLabel, bandOf, bandsFor, dropIndex, groupQuests, isIslandMap, levelFraction, longRunQuests, mergeTrips, mustDoForBand,
  onIsland,
  prepMaterials, questDoableAt, questReachable, withoutLongRun,
} from "@/lib/route-planner";
import { stepsBetween } from "@/lib/skill-plan";
import type { GuideBuild, GuideTrain, Monster, Quest } from "@/lib/types";

const monster = (id: number, drops: number[] = []): Monster =>
  ({ id, n: `怪${id}`, lv: 30, exp: 1, hp: 1, pad: 0, pdd: 0, mad: 0, mdd: 0, acc: 0, eva: 0, spd: 0, maps: [], drops }) as Monster;

const quest = (id: string, partial: Partial<Quest>): Quest => ({ id, n: `任務${id}`, cat: "維多利亞島", ...partial });

describe("等級段", () => {
  it("法師第二段從 8 等開始，其他從 10 等", () => {
    expect(bandsFor(200)[1]).toEqual({ from: 8, to: 21 });
    expect(bandsFor(110)[1]).toEqual({ from: 10, to: 21 });
  });

  it("共 8 段，最後一段到 100", () => {
    const bands = bandsFor(110);
    expect(bands).toHaveLength(8);
    expect(bands.at(-1)).toEqual({ from: 70, to: 100 });
  });

  it("找出等級所在的段", () => {
    const bands = bandsFor(110);
    expect(bandOf(bands, 35)).toEqual({ from: 30, to: 40 });
    expect(bandOf(bands, 30)).toEqual({ from: 30, to: 40 });
    expect(bandOf(bands, 100)).toEqual({ from: 70, to: 100 });
    expect(bandOf(bands, 1)).toEqual({ from: 1, to: 10 });
  });

  it("段落名稱取重疊最多的玩家推薦地圖，去掉括號註記", () => {
    const train = [
      { from: 30, to: 35, name: "黑肥肥領土（會掉高原之劍）", v: "tw" },
      { from: 30, to: 40, name: "沼澤地Ⅰ～Ⅲ（鱷魚）", v: "tw" },
    ] as GuideTrain[];
    expect(bandLabel({ from: 30, to: 40 }, train)).toBe("沼澤地Ⅰ～Ⅲ");
    expect(bandLabel({ from: 50, to: 60 }, train)).toBeUndefined();
  });
});

describe("一趟能完成的任務", () => {
  const drops = dropIndex([monster(1, [900]), monster(2, [901])]);

  it("要打的怪在圖上、要交的道具由圖上的怪掉，才算在這裡完成", () => {
    const q = quest("a", { needMobs: [{ id: 1, n: "怪1", c: 99 }], needItems: [{ id: 900, n: "尾巴", c: 50 }] });
    expect(questDoableAt(q, new Set([1]), drops)).toBe(true);
  });

  it("有一樣不在這張圖就不算", () => {
    const q = quest("b", { needItems: [{ id: 900, n: "尾巴", c: 50 }, { id: 901, n: "角", c: 10 }] });
    expect(questDoableAt(q, new Set([1]), drops)).toBe(false);
  });

  it("沒有任何收集或打怪需求的任務不算", () => {
    expect(questDoableAt(quest("c", { exp: 100 }), new Set([1]), drops)).toBe(false);
  });
});

describe("經驗換算成幾級", () => {
  it("用該等級升一級所需經驗換算", () => {
    const toNext = Array.from({ length: 100 }, () => 0);
    toNext[35] = 174216;
    expect(levelFraction(24000, 35, toNext)).toBeCloseTo(0.1378, 3);
  });

  it("超過一級時逐級累算，升級後需要的經驗會變多", () => {
    const toNext = [0, 100, 200, 400];
    expect(levelFraction(250, 1, toNext)).toBeCloseTo(1.75, 5);
    expect(levelFraction(700, 1, toNext)).toBeCloseTo(3, 5);
  });

  it("滿等之後不換算", () => {
    const toNext = Array.from({ length: 100 }, () => 1000);
    expect(levelFraction(5000, 100, toNext)).toBe(0);
  });
});

describe("合併同一張圖的推薦", () => {
  it("同一張圖兼具多個理由時合成一趟，最多三趟", () => {
    const trips = mergeTrips([
      { map: 1, tag: "fast" },
      { map: 1, tag: "quests" },
      { map: 2, tag: "players" },
      { map: 3, tag: "fast" },
      { map: 4, tag: "quests" },
    ]);
    expect(trips).toEqual([
      { map: 1, tags: ["fast", "quests"] },
      { map: 2, tags: ["players"] },
      { map: 3, tags: ["fast"] },
    ]);
  });
});

describe("先存材料", () => {
  it("同一道具多個任務要時數量加總，附上會掉的怪", () => {
    const monsters = [monster(1, [900]), monster(2, [900, 901])];
    const quests = [
      quest("a", { needItems: [{ id: 900, n: "尾巴", c: 50 }] }),
      quest("b", { needItems: [{ id: 900, n: "尾巴", c: 50 }, { id: 901, n: "角", c: 10 }] }),
    ];
    expect(prepMaterials(quests, monsters)).toEqual([
      { id: 900, n: "尾巴", c: 100, quests: ["a", "b"], droppers: [1, 2] },
      { id: 901, n: "角", c: 10, quests: ["b"], droppers: [2] },
    ]);
  });
});

describe("長線收集", () => {
  it("同一道具要收 200 個以上才算長線，任務數與經驗加總", () => {
    const quests = [
      quest("a", { minLv: 35, exp: 6000, needItems: [{ id: 900, n: "娃娃", c: 100 }] }),
      quest("b", { minLv: 35, exp: 10000, needItems: [{ id: 900, n: "娃娃", c: 200 }] }),
      quest("c", { minLv: 35, exp: 9000, needItems: [{ id: 901, n: "尾巴", c: 50 }] }),
    ];
    expect(longRunQuests(quests, [monster(7, [900])])).toEqual([
      { id: 900, n: "娃娃", c: 300, exp: 16000, quests: ["a", "b"], droppers: [7] },
    ]);
  });
});

describe("這一段要點的技能", () => {
  const build: GuideBuild = {
    label: "測試",
    main: true,
    v: "tw",
    s: [],
    steps: [
      { id: 1, name: "甲", to: 10 },
      { id: 2, name: "乙", to: 20 },
      { id: 3, name: "丙", to: 30 },
    ],
  };

  it("只列這段點數範圍會碰到的步驟", () => {
    expect(stepsBetween(build, 0, 5).map(step => step.name)).toEqual(["甲"]);
    expect(stepsBetween(build, 5, 15).map(step => step.name)).toEqual(["甲", "乙"]);
    expect(stepsBetween(build, 31, 46).map(step => step.name)).toEqual(["丙"]);
    expect(stepsBetween(build, 60, 70)).toEqual([]);
  });
});

describe("任務線合併", () => {
  it("名稱前有【任務線】標記的合成一組", () => {
    const groups = groupQuests([
      quest("1", { n: "[冒險家的戒指]湯寶寶的特餐①", exp: 50000 }),
      quest("2", { n: "[冒險家的戒指] 生命能量 ①", exp: 30000 }),
      quest("3", { n: "特殊料理2", exp: 24000 }),
    ]);
    expect(groups.map(group => [group.title, group.quests.length, group.exp])).toEqual([
      ["冒險家的戒指", 2, 80000],
      ["特殊料理2", 1, 24000],
    ]);
  });

  it("前置任務串在一起的合成一組，用經驗最高的那個當標題", () => {
    const groups = groupQuests([
      quest("a", { n: "收集100個詛咒娃娃", exp: 6000 }),
      quest("b", { n: "收集200個詛咒娃娃", exp: 10000, pre: ["a"] }),
      quest("c", { n: "收集400個詛咒娃娃", exp: 15000, pre: ["b"] }),
    ]);
    expect(groups.map(group => [group.title, group.quests.length, group.exp])).toEqual([["收集400個詛咒娃娃", 3, 31000]]);
  });
});

describe("接不接得到", () => {
  const maps = { 100: { zh: "弓箭手村", st: "" }, 200: { zh: "", st: "" } };

  it("起始 NPC 在未開放地圖、或位置不明的任務不推薦", () => {
    expect(questReachable(quest("a", { sNpc: { id: 1, n: "長老", map: 100 } }), maps)).toBe(true);
    expect(questReachable(quest("b", { sNpc: { id: 1, n: "茱麗葉", map: 200 } }), maps)).toBe(false);
    expect(questReachable(quest("c", { sNpc: { id: 1, n: "警衛隊長" } }), maps)).toBe(false);
    expect(questReachable(quest("d", {}), maps)).toBe(true);
  });

  it("初心者 10 等前只在楓之島，之後回不去", () => {
    expect(onIsland(0, 5)).toBe(true);
    expect(onIsland(0, 10)).toBe(false);
    expect(onIsland(100, 12)).toBe(false);
    expect(onIsland(100, 5)).toBe(true);
    expect(onIsland(200, 8)).toBe(false);
    expect(isIslandMap(40000)).toBe(true);
    expect(isIslandMap(100000000)).toBe(false);
  });
});

describe("必解任務的職業判斷", () => {
  const common = {
    researchedAt: "",
    builtAt: "",
    expTable: { toNext: Array.from({ length: 100 }, () => 1000), conflicts: [], v: "tw" as const, s: [] },
    mustDo: [],
    notWorth: [],
  };
  const maps = { 1: { zh: "魔法森林" } };
  const npc = { id: 1, n: "漢斯", map: 1 };

  it("法師 8 等轉職後的那一段用法師的任務，不是初心者的", () => {
    const quests = [
      quest("mage", { minLv: 10, exp: 500, jobs: [200], sNpc: npc }),
      quest("novice", { minLv: 9, exp: 500, jobs: [0], sNpc: npc }),
    ];
    const titles = mustDoForBand({ from: 8, to: 21 }, 230, quests, common, maps).map(group => group.title);
    expect(titles).toEqual(["任務mage"]);
  });

  it("楓之島那一段用初心者的任務", () => {
    const quests = [quest("novice", { minLv: 2, exp: 500, jobs: [0], island: 1, sNpc: npc })];
    expect(mustDoForBand({ from: 1, to: 8 }, 230, quests, common, maps).map(group => group.title)).toEqual(["任務novice"]);
  });
});

describe("一趟不算長線收集", () => {
  it("同一道具總共要收 200 個以上的任務群不算「順便完成」", () => {
    const monsters = [monster(1, [900, 901])];
    const quests = [
      quest("doll1", { exp: 6000, needItems: [{ id: 900, n: "娃娃", c: 100 }] }),
      quest("doll2", { exp: 10000, needItems: [{ id: 900, n: "娃娃", c: 200 }] }),
      quest("tail", { exp: 9000, needItems: [{ id: 901, n: "尾巴", c: 50 }] }),
    ];
    expect(withoutLongRun(quests, monsters).map(q => q.id)).toEqual(["tail"]);
  });
});
