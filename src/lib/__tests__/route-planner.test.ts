import { describe, expect, it } from "vitest";
import {
  bandLabels, bandOf, bandsFor, fitLevel, groupQuests, isIslandMap, levelFraction, longRunQuests, mustDoForBand, onIsland, prepMaterials,
  questReachable, segmentsToShow, trainingForBand, withoutLongRun,
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

  it("段落名稱取重疊最多的玩家推薦地圖，去掉括號註記；相鄰兩段不重複", () => {
    const train = [
      { from: 30, to: 45, name: "黑肥肥領土（會掉高原之劍）", v: "tw" },
      { from: 30, to: 50, name: "沼澤地Ⅰ～Ⅲ（鱷魚）", v: "tw" },
    ] as GuideTrain[];
    const bands = [{ from: 30, to: 40 }, { from: 40, to: 50 }, { from: 50, to: 60 }];
    expect(bandLabels(bands, () => train)).toEqual(["黑肥肥領土", "沼澤地Ⅰ～Ⅲ", undefined]);
  });

  it("只剩同一張圖可以當標籤時寫「同上一段」", () => {
    const train = [{ from: 30, to: 50, name: "沼澤地", v: "tw" }] as GuideTrain[];
    expect(bandLabels([{ from: 30, to: 40 }, { from: 40, to: 50 }], () => train)).toEqual(["沼澤地", "同上一段"]);
  });

  it("跟這段重疊不到 3 級的攻略段落不算", () => {
    const train = [
      { from: 30, to: 42, name: "火焰之地Ⅱ", v: "community" },
      { from: 40, to: 52, name: "猴子沼澤地Ⅲ", v: "tw" },
    ] as GuideTrain[];
    expect(trainingForBand({ from: 40, to: 50 }, train).map(segment => segment.name)).toEqual(["猴子沼澤地Ⅲ", "火焰之地Ⅱ"]);
    expect(trainingForBand({ from: 41, to: 50 }, train).map(segment => segment.name)).toEqual(["猴子沼澤地Ⅲ"]);
    expect(trainingForBand({ from: 45, to: 46 }, train).map(segment => segment.name)).toEqual(["猴子沼澤地Ⅲ"]);
  });
});

describe("段落詳情列哪幾段攻略", () => {
  const seg = (name: string, from = 30): GuideTrain => ({ from, to: 40, kind: "solo", map: 1, name, mobs: [], why: "", v: "tw", s: [] });

  it("先看職業規則再挑：湊滿 3 段能用的才停，途中被擋的照列（不會把能用的第 4 段擠掉）", () => {
    const [b1, u1, b2, u2, u3, u4] = ["擋1", "可1", "擋2", "可2", "可3", "可4"].map(name => seg(name));
    const blocked = (segment: GuideTrain) => segment.name.startsWith("擋");
    expect(segmentsToShow([b1, u1, b2, u2, u3, u4], blocked).map(segment => segment.name)).toEqual(["擋1", "可1", "擋2", "可2", "可3"]);
  });

  it("一段能用的都沒有時列前 3 段被擋的（下面另外放遊戲資料替代）", () => {
    const all = ["擋1", "擋2", "擋3", "擋4"].map(name => seg(name));
    expect(segmentsToShow(all, () => true).map(segment => segment.name)).toEqual(["擋1", "擋2", "擋3"]);
  });

  it("職業規則的等級：你在的這段用現在等級，其他段用段落起點與攻略起點較高的", () => {
    expect(fitLevel({ from: 30, to: 40 }, seg("x", 31), 35)).toBe(35);
    expect(fitLevel({ from: 30, to: 40 }, seg("x", 31))).toBe(31);
    expect(fitLevel({ from: 30, to: 40 }, seg("x", 25))).toBe(30);
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

  it("同一個 NPC 給的同名任務（托德的打獵方法有兩個編號、沒有前置相連）算同一條線", () => {
    const todd = { id: 2101, n: "托德", map: 30000 };
    const groups = groupQuests([
      quest("1018", { n: "托德的打獵方法", exp: 10, sNpc: todd }),
      quest("1035", { n: "托德的打獵方法", exp: 30, sNpc: todd }),
      quest("6700", { n: "弓箭手之路", sNpc: { id: 1012100, n: "赫麗娜" } }),
      quest("2078", { n: "弓箭手之路", sNpc: { id: 1, n: "坤" } }),
    ]);
    expect(groups.map(group => [group.title, group.quests.map(item => item.id)])).toEqual([
      ["托德的打獵方法", ["1018", "1035"]],
      ["弓箭手之路", ["6700"]],
      ["弓箭手之路", ["2078"]],
    ]);
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

  it("給了 atLevel 就用那個等級換算約幾級（目前這段用玩家現在的等級）", () => {
    const toNext = Array.from({ length: 100 }, () => 1000);
    toNext[32] = 50000;
    toNext[35] = 100000;
    const withTable = { ...common, expTable: { ...common.expTable, toNext } };
    const quests = [quest("a", { minLv: 32, exp: 20000, sNpc: npc })];
    expect(mustDoForBand({ from: 30, to: 40 }, 110, quests, withTable, maps)[0].fraction).toBeCloseTo(0.4);
    expect(mustDoForBand({ from: 30, to: 40 }, 110, quests, withTable, maps, 5, 35)[0].fraction).toBeCloseTo(0.2);
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
