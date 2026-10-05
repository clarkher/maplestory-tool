import { describe, expect, it } from "vitest";
import {
  bandQuests, effectiveLevels, laterMaterials, longRunNow, longRunTasks, npcGoTarget, nowQuests, partsText, recUpperLevel, rewardFitsJob,
} from "@/lib/now-plan";
import type { GuideCommon, GuideMustDo, Monster, Quest } from "@/lib/types";

const monster = (id: number, lv: number, drops: number[] = []): Monster =>
  ({ id, n: `怪${id}`, lv, exp: 1, hp: 1, pad: 0, pdd: 0, mad: 0, mdd: 0, acc: 0, eva: 0, spd: 0, maps: [], drops }) as Monster;
const quest = (id: string, partial: Partial<Quest>): Quest => ({ id, n: `任務${id}`, cat: "維多利亞島", ...partial });
const rec = (q: string, lv: string, partial: Partial<GuideMustDo> = {}): GuideMustDo =>
  ({ q, chain: [], name: `推薦${q}`, lv, why: "", v: "tw", s: [], ...partial });
const commonWith = (mustDo: GuideMustDo[]): GuideCommon => ({
  researchedAt: "",
  builtAt: "",
  expTable: { toNext: Array.from({ length: 121 }, () => 100000), conflicts: [], v: "tw", s: [] },
  mustDo,
  notWorth: [],
});

describe("實際等級", () => {
  const monsters = [monster(9, 65), monster(1, 24, [500])];

  it("有門檻用門檻；沒攻略時用要打的怪 −5、要交道具的最低等掉落怪 −5；前置任務的等級往後帶", () => {
    const quests = [
      quest("a", { minLv: 30 }),
      quest("b", { needMobs: [{ id: 9, n: "沼澤巨鱷", c: 1 }] }),
      quest("c", { needItems: [{ id: 500, n: "傘", c: 10 }] }),
      quest("d", { minLv: 10, pre: ["b"] }),
    ];
    const levels = effectiveLevels(quests, monsters, commonWith([]));
    expect(levels.get("a")).toBe(30);
    expect(levels.get("b")).toBe(60);
    expect(levels.get("c")).toBe(19);
    expect(levels.get("d")).toBe(60);
  });

  it("攻略有寫建議等級就信攻略", () => {
    const levels = effectiveLevels([quest("e", { needMobs: [{ id: 9, n: "沼澤巨鱷", c: 1 }] })], monsters, commonWith([rec("e", "50–55")]));
    expect(levels.get("e")).toBe(50);
  });
});

describe("攻略建議等級的上限", () => {
  it("範圍取上限；寫「+」或「起」的取最大數字 +40；其他取最大數字 +15", () => {
    expect(recUpperLevel(rec("x", "15–25"))).toBe(25);
    expect(recUpperLevel(rec("x", "30+（需名聲 10）"))).toBe(70);
    expect(recUpperLevel(rec("x", "40+"))).toBe(80);
    expect(recUpperLevel(rec("x", "10 起，32／37／42 各解一段"))).toBe(82);
    expect(recUpperLevel(rec("x", "15 接前段、30 接後段"))).toBe(45);
    expect(recUpperLevel(rec("x", "15"))).toBe(30);
    expect(recUpperLevel(undefined)).toBeUndefined();
  });
});

describe("獎勵的職業旗標", () => {
  it("job 欄位是旗標：劍士 2、法師 4、弓箭手 8、盜賊 16、海盜 32", () => {
    expect(rewardFitsJob({ job: 4100 }, 230)).toBe(true);
    expect(rewardFitsJob({ job: 4100 }, 110)).toBe(false);
    expect(rewardFitsJob({}, 110)).toBe(true);
  });
});

describe("先解", () => {
  const monsters = [monster(9, 65), monster(1, 22)];
  const args = (level: number, job: number, quests: Quest[], mustDo: GuideMustDo[] = []) => {
    const common = commonWith(mustDo);
    return { level, job, quests, monsters, common, maps: {}, effective: effectiveLevels(quests, monsters, common) };
  };

  it("沒有門檻、但攻略寫 65 等的王任務，不推給 20 等", () => {
    const quests = [quest("boss", { exp: 180000, needMobs: [{ id: 9, n: "沼澤巨鱷", c: 1 }] })];
    expect(nowQuests(args(20, 110, quests, [rec("boss", "65–70")]))).toEqual([]);
  });

  it("要打 200 隻以上的不算先解", () => {
    const quests = [quest("k", { minLv: 20, exp: 90000, needMobs: [{ id: 1, n: "刺菇菇", c: 999 }] })];
    expect(nowQuests(args(25, 110, quests))).toEqual([]);
  });

  it("組隊任務分類不算先解", () => {
    const quests = [quest("pq", { minLv: 20, exp: 90000, cat: "組隊任務" })];
    expect(nowQuests(args(25, 110, quests))).toEqual([]);
  });

  it("有關鍵獎勵的排前面，標題拿掉研究檔名稱最後的括號", () => {
    const quests = [
      quest("sauna", { minLv: 30, exp: 1000, rewardItems: [{ id: 1050018, n: "藍色桑那服" }] }),
      quest("big", { minLv: 30, exp: 50000 }),
    ];
    const mustDo = [rec("sauna", "30–35", { name: "泰實夫的秘密之書（桑那服）", reward: { label: "桑那服", items: [1050018] } })];
    const result = nowQuests(args(32, 110, quests, mustDo));
    expect(result.map(item => item.title)).toEqual(["泰實夫的秘密之書", "任務big"]);
    expect(result[0]).toMatchObject({ reward: "桑那服", rewardItem: 1050018 });
    expect(result[1].fraction).toBeCloseTo(0.5);
  });

  it("開放式的建議等級（40+）也會過期：Lv.95 不再推 40 等的錢袋；標了永久的戒指一直推", () => {
    const quests = [
      quest("bag", { minLv: 40, exp: 0 }),
      quest("ring", { minLv: 30, exp: 0 }),
    ];
    const mustDo = [
      rec("bag", "40+", { reward: { label: "鞋子速度卷軸（隨機）", items: [] } }),
      rec("ring", "30+（需二轉）", { reward: { label: "永久戒指三選一", items: [], permanent: true } }),
    ];
    expect(nowQuests(args(85, 110, quests, mustDo)).map(item => item.key)).toEqual(["rec:bag", "rec:ring"]);
    expect(nowQuests(args(95, 110, quests, mustDo)).map(item => item.key)).toEqual(["rec:ring"]);
  });

  it("過了攻略建議等級上限 +5 就不推", () => {
    const quests = [quest("hat", { minLv: 15, exp: 2000 })];
    const mustDo = [rec("hat", "15–25", { reward: { label: "褐色斗笠", items: [] } })];
    expect(nowQuests(args(30, 110, quests, mustDo))).toHaveLength(1);
    expect(nowQuests(args(31, 110, quests, mustDo))).toEqual([]);
  });

  it("同一條任務線收成一筆，標出做得到的是第幾段、共幾段", () => {
    const quests = [
      quest("q1", { minLv: 20, exp: 20000 }),
      quest("q2", { minLv: 20, exp: 20000, pre: ["q1"] }),
      quest("q3", { minLv: 40, exp: 20000, pre: ["q2"] }),
    ];
    const [item] = nowQuests(args(25, 110, quests));
    expect(item).toMatchObject({ totalParts: 3, firstPart: 1, lastPart: 2, exp: 40000 });
    expect(item.fraction).toBeCloseTo(0.4);
  });

  it("獎勵圖只放這個職業拿得到的那件", () => {
    const quests = [quest("glove", {
      minLv: 20,
      exp: 1000,
      rewardItems: [{ id: 1082002, n: "工地手套", job: 1 }, { id: 1082020, n: "藍色梅林手套", job: 4100 }],
    })];
    const mustDo = [rec("glove", "15–25", { reward: { label: "Lv20 職業手套", items: [1082002, 1082020] } })];
    expect(nowQuests(args(22, 200, quests, mustDo))[0].rewardItem).toBe(1082020);
    expect(nowQuests(args(22, 100, quests, mustDo))[0].rewardItem).toBeUndefined();
  });

  it("關鍵獎勵任務超過 5 個也全部列出，而且都排在沒有獎勵的前面", () => {
    const rewardQuests = Array.from({ length: 6 }, (_, index) => quest(`r${index}`, { minLv: 30, exp: 100 }));
    const big = quest("big", { minLv: 30, exp: 150000 });
    const mustDo = rewardQuests.map(entry => rec(entry.id, "30–40", { reward: { label: `獎勵${entry.id}`, items: [] } }));
    const result = nowQuests(args(32, 110, [...rewardQuests, big], mustDo));
    expect(result).toHaveLength(7);
    expect(result.slice(0, 6).every(item => item.reward)).toBe(true);
    expect(result[6].key).toBe("chain:big");
  });

  it("同一個 NPC 的同名任務（托德的打獵方法 ×2）只列一行", () => {
    const todd = { id: 2101, n: "托德", map: 30000 };
    const quests = [
      quest("1018", { n: "托德的打獵方法", exp: 50000, jobs: [0], sNpc: todd }),
      quest("1035", { n: "托德的打獵方法", exp: 50000, jobs: [0], maxLv: 10, sNpc: todd }),
    ];
    const result = nowQuests({ ...args(1, 0, quests), maps: { 30000: { zh: "楓之島" } } });
    expect(result.map(item => item.title)).toEqual(["托德的打獵方法"]);
    expect(result[0]).toMatchObject({ totalParts: 2, firstPart: 1, lastPart: 2 });
  });

  it("同一筆攻略推薦涵蓋的幾條任務線收成一行", () => {
    const quests = [
      quest("a1", { minLv: 10, exp: 20000 }),
      quest("a2", { minLv: 10, exp: 20000, pre: ["a1"] }),
      quest("b1", { minLv: 10, exp: 20000 }),
    ];
    const mustDo = [rec("a1", "10 起", { chain: ["a1", "a2", "b1"], name: "伊卡路斯任務鏈（好無聊 → 滑翔翼）" })];
    const result = nowQuests(args(12, 110, quests, mustDo));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ title: "伊卡路斯任務鏈", totalParts: 3, firstPart: 1, lastPart: 3, exp: 60000 });
  });
});

describe("離開楓之島之後", () => {
  const island = { id: 1, n: "白瑞德", map: 40000 };
  const victoria = { id: 2, n: "長老", map: 100000000 };
  const maps = { 40000: { zh: "嫩寶狩獵場Ⅰ" }, 100000000: { zh: "弓箭手村" } };
  const quests = [
    quest("test", { n: "白瑞德的測試", minLv: 7, exp: 60000, jobs: [0], sNpc: island }),
    quest("elder", { n: "長老的請託", minLv: 7, exp: 60000, sNpc: victoria }),
  ];
  const common = commonWith([]);
  const args = (level: number, job: number) => ({ level, job, quests, monsters: [], common, maps, effective: effectiveLevels(quests, [], common) });

  it("先解：還在島上（初心者 9 等）照列島上任務；10 等離島後 NPC 站在楓之島的任務不再列", () => {
    expect(nowQuests(args(9, 0)).map(item => item.title)).toContain("白瑞德的測試");
    expect(nowQuests(args(10, 0)).map(item => item.title)).toEqual(["長老的請託"]);
  });

  it("升級路線的必解也一樣：離島後楓之島那段不列島上的任務", () => {
    const band = { from: 1, to: 10 };
    expect(bandQuests({ ...args(9, 0), band }).map(item => item.title)).toContain("白瑞德的測試");
    expect(bandQuests({ ...args(12, 100), band }).map(item => item.title)).not.toContain("白瑞德的測試");
  });
});

describe("還在楓之島、還不能轉職的初心者（8 等前）", () => {
  const island = { id: 1, n: "白瑞德", map: 40000 };
  const victoria = { id: 2, n: "魔法森林的居民", map: 101000000 };
  const maps = { 40000: { zh: "嫩寶狩獵場Ⅰ" }, 101000000: { zh: "魔法森林" } };
  const quests = [
    quest("test", { n: "白瑞德的測試", minLv: 2, exp: 60000, jobs: [0], sNpc: island }),
    quest("forest", { n: "魔法森林的請託", minLv: 3, exp: 60000, sNpc: victoria }),
  ];
  const common = commonWith([]);
  const args = (level: number, job: number) => ({ level, job, quests, monsters: [], common, maps, effective: effectiveLevels(quests, [], common) });
  const band = { from: 1, to: 10 };

  it("先解不列維多利亞島的任務（離島前去不了）；8 等起法師可以離島轉職，就照列", () => {
    expect(nowQuests(args(5, 0)).map(item => item.title)).toEqual(["白瑞德的測試"]);
    expect(nowQuests(args(8, 0)).map(item => item.title)).toEqual(expect.arrayContaining(["白瑞德的測試", "魔法森林的請託"]));
  });

  it("必解也一樣", () => {
    expect(bandQuests({ ...args(5, 0), band }).map(item => item.title)).toEqual(["白瑞德的測試"]);
    expect(bandQuests({ ...args(8, 0), band }).map(item => item.title)).toEqual(expect.arrayContaining(["白瑞德的測試", "魔法森林的請託"]));
  });
});

describe("第幾段／共幾段的寫法（先解跟必解同一個）", () => {
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

  it("整條線只有一段不寫；一段寫第 N 段；連在一起的好幾段寫第 a–b 段（列出的段一定連在一起，見下面「任務線不跳段」）", () => {
    expect(partsText({ positions: range(1, 52), totalParts: 52 })).toBe("第 1–52 段／共 52 段");
    expect(partsText({ positions: [3], totalParts: 5 })).toBe("第 3 段／共 5 段");
    expect(partsText({ positions: [4, 5], totalParts: 5 })).toBe("第 4–5 段／共 5 段");
    expect(partsText({ positions: [1], totalParts: 1 })).toBeNull();
  });
});

describe("任務線不跳段（先解跟必解同一套，round 4）", () => {
  const ids = (item: { quests: Quest[] }) => item.quests.map(entry => entry.id);

  it("中間那段要打 200 隻以上（放在長線）：只列到它前面，後面的段也不列——不叫你跳過一段", () => {
    const monsters = [monster(1, 20)];
    const elder = { id: 11, n: "長老斯坦", map: 100000000 };
    const quests = [
      quest("p1", { minLv: 20, exp: 30000, sNpc: elder }),
      quest("p2", { minLv: 20, exp: 30000, pre: ["p1"], sNpc: elder, needMobs: [{ id: 1, n: "刺菇菇", c: 200 }] }),
      quest("p3", { minLv: 20, exp: 90000, pre: ["p2"], sNpc: elder }),
    ];
    const common = commonWith([]);
    const shared = { quests, monsters, common, maps: { 100000000: { zh: "弓箭手村" } }, effective: effectiveLevels(quests, monsters, common) };
    const [todo] = nowQuests({ ...shared, level: 25, job: 110 });
    const [band] = bandQuests({ ...shared, band: { from: 10, to: 21 }, level: 25, job: 110 });
    for (const item of [todo, band]) {
      expect(ids(item)).toEqual(["p1"]);
      expect(item).toMatchObject({ positions: [1], firstPart: 1, lastPart: 1, totalParts: 3, exp: 30000 });
      expect(partsText(item)).toBe("第 1 段／共 3 段");
    }
  });

  it("同一條線自己累計同一道具 200 個以上的那段（含）就停：只列到它前面", () => {
    const monsters = [monster(9, 22, [500])];
    const quests = [
      quest("s1", { minLv: 20, exp: 30000 }),
      quest("s2", { minLv: 20, exp: 30000, pre: ["s1"], needItems: [{ id: 500, n: "火獨眼獸之尾巴", c: 100 }] }),
      quest("s3", { minLv: 20, exp: 30000, pre: ["s2"], needItems: [{ id: 500, n: "火獨眼獸之尾巴", c: 100 }] }),
      quest("s4", { minLv: 20, exp: 30000, pre: ["s3"] }),
    ];
    const common = commonWith([]);
    const shared = { quests, monsters, common, maps: {}, effective: effectiveLevels(quests, monsters, common) };
    const [todo] = nowQuests({ ...shared, level: 25, job: 110 });
    expect(ids(todo)).toEqual(["s1", "s2"]);
    expect(partsText(todo)).toBe("第 1–2 段／共 4 段");
    const [band] = bandQuests({ ...shared, band: { from: 10, to: 21 }, level: 25, job: 110 });
    expect(ids(band)).toEqual(["s1", "s2"]);
  });

  it("別條線也要交同一道具，不會把這條線切斷（冒險家的戒指第 17 段的樹枝）；兩個要交樹枝的都列在先解，長線不再算它們", () => {
    const monsters = [monster(9, 22, [500])];
    const quests = [
      quest("s1", { minLv: 20, exp: 30000 }),
      quest("s2", { minLv: 20, exp: 30000, pre: ["s1"] }),
      quest("s3", { minLv: 20, exp: 30000, pre: ["s2"], needItems: [{ id: 500, n: "樹枝", c: 50 }] }),
      quest("s4", { minLv: 20, exp: 30000, pre: ["s3"] }),
      quest("other", { minLv: 20, exp: 50000, needItems: [{ id: 500, n: "樹枝", c: 160 }] }),
    ];
    const common = commonWith([]);
    const shared = { quests, monsters, common, maps: {}, effective: effectiveLevels(quests, monsters, common) };
    const todo = nowQuests({ ...shared, level: 25, job: 110 });
    const line = todo.find(item => item.key === "chain:s1");
    expect(line && ids(line)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(line?.exp).toBe(120000);
    const [band] = bandQuests({ ...shared, band: { from: 10, to: 21 }, level: 25, job: 110 }).filter(item => item.key === "chain:s1");
    expect(ids(band)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(longRunNow({ ...shared, level: 25, job: 110 })).toEqual([]);
  });

  it("長線不算先解列過的任務：拿掉之後不到 200 個就不列；還有 200 個以上就重算數量跟經驗（round 4 後續 2）", () => {
    const monsters = [monster(9, 22, [500])];
    const line = [
      quest("s1", { minLv: 20, exp: 30000 }),
      quest("s2", { minLv: 20, exp: 30000, pre: ["s1"] }),
      quest("s3", { minLv: 20, exp: 30000, pre: ["s2"], needItems: [{ id: 500, n: "樹枝", c: 50 }] }),
    ];
    const common = commonWith([]);
    const args = (quests: Quest[]) => ({ level: 25, job: 110, quests, monsters, common, maps: {}, effective: effectiveLevels(quests, monsters, common) });
    // 別的任務只要 160 個、經驗太少不列在先解：全部加總 210，拿掉先解列的 s3 剩 160，不到 200
    const few = [...line, quest("other", { minLv: 20, exp: 100, needItems: [{ id: 500, n: "樹枝", c: 160 }] })];
    expect(nowQuests(args(few)).map(item => item.key)).toEqual(["chain:s1"]);
    expect(longRunNow(args(few))).toEqual([]);
    // 別的任務自己就要 200 個（長線那種，不在先解）：加總 250 → 拿掉 s3 剩 200，經驗只算它的
    const many = [...line, quest("other", { minLv: 20, exp: 30000, needItems: [{ id: 500, n: "樹枝", c: 200 }] })];
    expect(longRunNow(args(many)).map(entry => [entry.n, entry.c, entry.exp, entry.quests])).toEqual([["樹枝", 200, 30000, ["other"]]]);
  });

  it("值不值得用列出的那幾段算：隔著長線那段的後段經驗再多也不算進來", () => {
    const monsters = [monster(1, 20)];
    const quests = [
      quest("p1", { minLv: 20, exp: 5000 }),
      quest("p2", { minLv: 20, exp: 30000, pre: ["p1"], needMobs: [{ id: 1, n: "刺菇菇", c: 200 }] }),
      quest("p3", { minLv: 20, exp: 90000, pre: ["p2"] }),
    ];
    const common = commonWith([]);
    expect(nowQuests({ level: 25, job: 110, quests, monsters, common, maps: {}, effective: effectiveLevels(quests, monsters, common) })).toEqual([]);
  });

  it("第一段沒有經驗（內拉的夢 → 潘喜的紅色毛球）也算一段：從它開始列，NPC 跟帶我去用它的（內拉、墮落城市）", () => {
    const nella = { id: 1052103, n: "內拉", map: 103000000, mapName: "墮落城市" };
    const panxi = { id: 1061005, n: "潘喜", map: 101020000, mapName: "魔法森林北部" };
    const maps = { 103000000: { zh: "墮落城市" }, 101020000: { zh: "魔法森林北部" } };
    const toNext = Array.from({ length: 121 }, (_, level) => (level < 15 ? 1000 : 100000));
    const common = { ...commonWith([]), expTable: { ...commonWith([]).expTable, toNext } };
    // 跟遊戲資料一樣：潘喜那段沒有等級門檻，前置是內拉的夢
    const quests = [
      quest("2103", { n: "內拉的夢", minLv: 10, sNpc: nella }),
      quest("2104", { n: "潘喜的紅色毛球", exp: 500, pre: ["2103"], sNpc: panxi }),
    ];
    const [todo] = nowQuests({ level: 10, job: 100, quests, monsters: [], common, maps, effective: effectiveLevels(quests, [], common) });
    expect(ids(todo)).toEqual(["2103", "2104"]);
    expect(todo).toMatchObject({ npc: nella, exp: 500, positions: [1, 2] });
    expect(partsText(todo)).toBe("第 1–2 段／共 2 段");
    // 必解同一套：兩段都在這段解鎖時，也從內拉那段開始
    const gated = quests.map(entry => ({ ...entry, minLv: 10 }));
    const [band] = bandQuests({ band: { from: 10, to: 21 }, level: 10, job: 100, quests: gated, monsters: [], common, maps, effective: effectiveLevels(gated, [], common) });
    expect(ids(band)).toEqual(["2103", "2104"]);
    expect(band.npc).toEqual(nella);
  });

  it("先解一定從第一段開始：第一段過了等級上限（新手劍士的第一次修煉 15 等就不能接）就不列，不從第 2 段開始", () => {
    const quests = [
      quest("t1", { minLv: 10, maxLv: 15, exp: 30000 }),
      quest("t2", { minLv: 10, exp: 30000, pre: ["t1"] }),
      quest("t3", { minLv: 10, exp: 30000, pre: ["t2"] }),
    ];
    const common = commonWith([]);
    const args = (level: number) => ({ level, job: 100, quests, monsters: [], common, maps: {}, effective: effectiveLevels(quests, [], common) });
    expect(nowQuests(args(15)).map(partsText)).toEqual(["第 1–3 段／共 3 段"]);
    expect(nowQuests(args(16))).toEqual([]);
  });

  it("先解一定從第一段開始：第一段是長線那種（要打 200 隻以上）就不列（不寫「第 2 段」），那段照舊在長線", () => {
    const monsters = [monster(1, 20)];
    const quests = [
      quest("c1", { minLv: 20, exp: 30000, needMobs: [{ id: 1, n: "刺菇菇", c: 250 }] }),
      quest("c2", { minLv: 20, exp: 90000, pre: ["c1"] }),
    ];
    const common = commonWith([]);
    const args = { level: 25, job: 110, quests, monsters, common, maps: {}, effective: effectiveLevels(quests, monsters, common) };
    expect(nowQuests(args)).toEqual([]);
    expect(longRunNow(args).map(entry => entry.n)).toEqual(["刺菇菇"]);
  });
});

describe("關鍵獎勵要列到給它的那一段（round 4 後續 C）", () => {
  const monsters = [monster(1, 20)];
  const ids = (item: { quests: Quest[] }) => item.quests.map(entry => entry.id);
  const args = (quests: Quest[], mustDo: GuideMustDo[], level = 25) => {
    const common = commonWith(mustDo);
    return { level, job: 110, quests, monsters, common, maps: {}, effective: effectiveLevels(quests, monsters, common) };
  };

  it("列出的段裡沒有給獎勵的那一段：不寫獎勵、不排到有獎勵的前面，只看經驗（夠多照列）", () => {
    const quests = [
      quest("g1", { minLv: 20, exp: 30000 }),
      quest("g2", { minLv: 20, exp: 30000, pre: ["g1"], needMobs: [{ id: 1, n: "鱷魚", c: 250 }] }),
      quest("g3", { minLv: 20, exp: 25000, pre: ["g2"], rewardItems: [{ id: 2044002, n: "10% 武器攻擊卷軸" }] }),
      quest("small", { minLv: 20, exp: 100, rewardItems: [{ id: 1002026, n: "褐色斗笠" }] }),
    ];
    const mustDo = [
      rec("g3", "20+", { chain: ["g1", "g2", "g3"], name: "布魯斯與義安", reward: { label: "10% 武器攻擊卷軸", items: [2044002] } }),
      rec("small", "20+", { name: "瑪亞", reward: { label: "褐色斗笠", items: [1002026] } }),
    ];
    const result = nowQuests(args(quests, mustDo));
    expect(result.map(item => [item.title, item.reward, ids(item)])).toEqual([
      ["瑪亞", "褐色斗笠", ["small"]],
      ["布魯斯與義安", undefined, ["g1"]],
    ]);
    expect(result[1].rewardItem).toBeUndefined();
  });

  it("沒有經驗、也沒列到給獎勵的那一段：不列（阿勒斯第 1 段不再掛隨機耳環）", () => {
    const quests = [
      quest("a1", { minLv: 20 }),
      quest("a2", { minLv: 20, exp: 1600, pre: ["a1"], needMobs: [{ id: 1, n: "火獨眼獸", c: 200 }] }),
      quest("a3", { minLv: 20, exp: 5000, pre: ["a2"], rewardItems: [{ id: 1032004, n: "耳環" }] }),
    ];
    const mustDo = [rec("a3", "20–25", { chain: ["a1", "a2", "a3"], name: "離家少年阿勒斯", reward: { label: "隨機耳環", items: [1032004] } })];
    expect(nowQuests(args(quests, mustDo))).toEqual([]);
  });

  it("研究檔寫了獎勵道具、這個職業的線卻沒有給它的那一段：不算有獎勵（麥吉的舊戰劍，給劍的那段不收初心者）", () => {
    const quests = [
      quest("2047", { minLv: 20, exp: 7500, jobs: [100], rewardItems: [{ id: 1302015, n: "英雄戰劍" }] }),
      quest("2048", { minLv: 20, exp: 8000, pre: ["2047"] }),
    ];
    const mustDo = [rec("2048", "20+", { chain: ["2048", "2047"], name: "麥吉的舊戰劍", reward: { label: "英雄戰劍", items: [1302015] } })];
    const common = commonWith(mustDo);
    const effective = effectiveLevels(quests, monsters, common);
    const novice = nowQuests({ level: 25, job: 0, quests, monsters, common, maps: {}, effective });
    expect(novice.map(item => [ids(item), item.reward])).toEqual([[["2048"], undefined]]);
    const warrior = nowQuests({ level: 25, job: 100, quests, monsters, common, maps: {}, effective });
    expect(warrior.map(item => [ids(item), item.reward])).toEqual([[["2047", "2048"], "英雄戰劍"]]);
  });

  it("研究檔沒寫獎勵道具：看推薦的那個任務有沒有列到（伊卡路斯任務鏈的披風在最後一段）", () => {
    const quests = [
      quest("i1", { minLv: 20, exp: 30000 }),
      quest("i2", { minLv: 20, exp: 30000, pre: ["i1"] }),
      quest("i3", { minLv: 40, exp: 30000, pre: ["i2"] }),
    ];
    const mustDo = [rec("i3", "20 起", { chain: ["i1", "i2", "i3"], name: "伊卡路斯任務鏈", reward: { label: "隨機能力披風", items: [] } })];
    expect(nowQuests(args(quests, mustDo, 25)).map(item => [ids(item), item.reward])).toEqual([[["i1", "i2"], undefined]]);
    expect(nowQuests(args(quests, mustDo, 40)).map(item => [ids(item), item.reward])).toEqual([[["i1", "i2", "i3"], "隨機能力披風"]]);
  });
});

describe("升級路線的必解：職業與楓之島", () => {
  const common = commonWith([]);
  const maps = { 101000003: { zh: "魔法森林圖書館" }, 40000: { zh: "嫩寶狩獵場Ⅰ" } };
  const npc = { id: 1, n: "漢斯", map: 101000003 };
  const run = (band: { from: number; to: number }, level: number, job: number, quests: Quest[]) =>
    bandQuests({ band, level, job, quests, monsters: [], common, maps, effective: effectiveLevels(quests, [], common) });

  it("法師 8 等轉職後的那一段用法師的任務，不是初心者的", () => {
    const quests = [
      quest("mage", { minLv: 10, exp: 50000, jobs: [200], sNpc: npc }),
      quest("novice", { minLv: 9, exp: 50000, jobs: [0], sNpc: npc }),
    ];
    expect(run({ from: 8, to: 21 }, 12, 230, quests).map(item => item.title)).toEqual(["任務mage"]);
  });

  it("還在楓之島時，楓之島那一段用初心者的任務", () => {
    const quests = [quest("novice", { minLv: 2, exp: 50000, jobs: [0], island: 1, sNpc: { id: 2, n: "白瑞德", map: 40000 } })];
    expect(run({ from: 1, to: 10 }, 3, 0, quests).map(item => item.title)).toEqual(["任務novice"]);
  });
});

describe("升級路線的必解跟先解同一套（任務線、標題、長線、值不值得）", () => {
  const monsters = [monster(9, 22, [500])];
  const common = (mustDo: GuideMustDo[] = []) => commonWith(mustDo);
  const run = (level: number, band: { from: number; to: number }, quests: Quest[], mustDo: GuideMustDo[] = [], job = 110) => {
    const shared = common(mustDo);
    return bandQuests({ band, level, job, quests, monsters, common: shared, maps: {}, effective: effectiveLevels(quests, monsters, shared) });
  };

  it("一筆攻略推薦是一條線、標題用推薦的名字；前置有推薦的後段自己一條、沒有「為什麼」", () => {
    const quests = [
      quest("t1", { n: "泰實夫的秘密之書", minLv: 32, exp: 30000 }),
      quest("d1", { n: "收集詛咒娃娃", minLv: 33, exp: 30000, pre: ["t1"] }),
    ];
    const mustDo = [rec("t1", "30–35", { name: "泰實夫的秘密之書（桑那服）", why: "送桑那服" })];
    const result = run(35, { from: 30, to: 40 }, quests, mustDo);
    expect(result.map(item => [item.title, item.rec?.why])).toEqual([
      ["泰實夫的秘密之書", "送桑那服"],
      ["收集詛咒娃娃", undefined],
    ]);
  });

  it("一筆推薦涵蓋好幾條前置串不起來的任務也收成一行", () => {
    const quests = [quest("a1", { minLv: 10, exp: 20000 }), quest("a2", { minLv: 10, exp: 20000, pre: ["a1"] }), quest("b1", { minLv: 10, exp: 20000 })];
    const mustDo = [rec("a1", "10 起", { chain: ["a1", "a2", "b1"], name: "伊卡路斯任務鏈（好無聊 → 滑翔翼）" })];
    const result = run(12, { from: 10, to: 21 }, quests, mustDo);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ title: "伊卡路斯任務鏈", firstPart: 1, lastPart: 3, totalParts: 3 });
  });

  it("一條線後面的段不會比前面的段早解鎖（惡靈森林 50 等才接得到，後面幾段攻略寫 45 也要到 50 那段才列，不會 45 那段從第 2 段開始）", () => {
    const quests = [
      quest("e1", { n: "惡靈森林", minLv: 50, exp: 0 }),
      quest("e2", { n: "他呼喚的名稱", exp: 0, pre: ["e1"] }),
      quest("e3", { n: "消滅殭屍猴王", exp: 112800, pre: ["e2"] }),
    ];
    const mustDo = [rec("e3", "45–55", { chain: ["e1", "e2", "e3"], name: "惡靈森林 → 消滅殭屍猴王" })];
    expect(run(45, { from: 40, to: 50 }, quests, mustDo)).toEqual([]);
    const shared = common(mustDo);
    expect(bandQuests({ band: { from: 40, to: 50 }, active: true, level: 45, job: 110, quests, monsters, common: shared, maps: {}, effective: effectiveLevels(quests, monsters, shared) })).toEqual([]);
    const [row] = run(45, { from: 50, to: 60 }, quests, mustDo);
    expect(row.quests.map(entry => entry.id)).toEqual(["e1", "e2", "e3"]);
    expect(row).toMatchObject({ level: 50, exp: 112800 });
    expect(partsText(row)).toBe("第 1–3 段／共 3 段");
  });

  it("每一段的必解也從那條線的第一段開始，列到這段為止解鎖的段；這段沒有解鎖任何一段的線不列（round 4 後續 2）", () => {
    const quests = [
      quest("q1", { minLv: 20, exp: 20000 }),
      quest("q2", { minLv: 20, exp: 20000, pre: ["q1"] }),
      quest("q3", { minLv: 40, exp: 30000, pre: ["q2"] }),
    ];
    expect(run(25, { from: 21, to: 30 }, quests)).toEqual([]);
    expect(run(25, { from: 10, to: 21 }, quests)[0]).toMatchObject({ firstPart: 1, lastPart: 2, totalParts: 3, exp: 40000 });
    expect(run(25, { from: 40, to: 50 }, quests)[0]).toMatchObject({ firstPart: 1, lastPart: 3, totalParts: 3, exp: 70000 });
  });

  it("從第一段開始的那串到不了這段（前面有長線那種）就不列，不從後面的段開始", () => {
    const quests = [
      quest("j1", { minLv: 10, exp: 30000 }),
      quest("j2", { minLv: 10, exp: 20000, pre: ["j1"], needMobs: [{ id: 9, n: "刺菇菇", c: 200 }] }),
      quest("j3", { minLv: 35, exp: 50000, pre: ["j2"] }),
    ];
    expect(run(25, { from: 30, to: 40 }, quests)).toEqual([]);
    expect(run(25, { from: 10, to: 21 }, quests).map(partsText)).toEqual(["第 1 段／共 3 段"]);
  });

  it("你在這：先解沒列的線從第一段開始列（伊卡路斯第 1–3 段不值得列在先解：你在這列第 1–4 段，不寫「第 3–4 段」）；之後的段也從第一段開始", () => {
    const quests = [
      quest("i1", { minLv: 10, exp: 100 }),
      quest("i2", { minLv: 10, exp: 100, pre: ["i1"] }),
      quest("i3", { minLv: 32, exp: 3000, pre: ["i2"] }),
      quest("i4", { minLv: 37, exp: 30000, pre: ["i3"] }),
      quest("i5", { minLv: 42, exp: 20000, pre: ["i4"] }),
    ];
    const shared = common();
    const args = { level: 33, job: 110, quests, monsters, common: shared, maps: {}, effective: effectiveLevels(quests, monsters, shared) };
    expect(nowQuests(args)).toEqual([]);
    const [here] = bandQuests({ ...args, band: { from: 30, to: 40 }, active: true });
    expect(here.quests.map(entry => entry.id)).toEqual(["i1", "i2", "i3", "i4"]);
    expect(partsText(here)).toBe("第 1–4 段／共 5 段");
    expect(bandQuests({ ...args, band: { from: 40, to: 50 } }).map(partsText)).toEqual(["第 1–5 段／共 5 段"]);
  });

  it("要打 200 隻以上的段、同一條線自己累計同一道具 200 個以上的那段（含）開始不列；前面不到 200 的段照列（詛咒娃娃第 1 段 100 個）", () => {
    const quests = [
      quest("k", { minLv: 30, exp: 90000, needMobs: [{ id: 9, n: "刺菇菇", c: 999 }] }),
      quest("d1", { minLv: 35, exp: 60000, needItems: [{ id: 500, n: "詛咒娃娃", c: 100 }] }),
      quest("d2", { minLv: 35, exp: 60000, needItems: [{ id: 500, n: "詛咒娃娃", c: 200 }], pre: ["d1"] }),
      quest("ok", { minLv: 31, exp: 60000 }),
    ];
    expect(run(35, { from: 30, to: 40 }, quests).map(item => [item.key, partsText(item)])).toEqual([["chain:d1", "第 1 段／共 2 段"], ["chain:ok", null]]);
  });

  it("同一條線在先解跟必解列的段一樣，經驗是同一個數字；別條線也要交同一道具不算長線（戒指整條）", () => {
    const quests = [
      quest("r1", { minLv: 30, exp: 100000, needItems: [{ id: 777, n: "葉子", c: 100 }] }),
      quest("r2", { minLv: 30, exp: 100000, pre: ["r1"] }),
      quest("o1", { minLv: 25, exp: 50000, needItems: [{ id: 777, n: "葉子", c: 100 }] }),
    ];
    const mustDo = [rec("r1", "30+", { chain: ["r1", "r2"], name: "冒險家的戒指" })];
    const shared = common(mustDo);
    const effective = effectiveLevels(quests, monsters, shared);
    const todo = nowQuests({ level: 35, job: 110, quests, monsters, common: shared, maps: {}, effective });
    const band = bandQuests({ band: { from: 30, to: 40 }, level: 35, job: 110, quests, monsters, common: shared, maps: {}, effective });
    const ringNow = todo.find(item => item.title === "冒險家的戒指");
    const ringBand = band.find(item => item.title === "冒險家的戒指");
    expect(ringNow?.exp).toBe(200000);
    expect(ringBand?.exp).toBe(ringNow?.exp);
  });

  it("值不值得跟先解同一條：+7 經驗、沒推薦也沒獎勵的不列", () => {
    const quests = [quest("tiny", { minLv: 32, exp: 7 }), quest("big", { minLv: 32, exp: 50000 })];
    expect(run(35, { from: 30, to: 40 }, quests).map(item => item.key)).toEqual(["chain:big"]);
  });

  it("約幾級用接得到那條線的等級算：你在的這段跟之前的段取現在等級與那條線的等級較高的，之後的段取段落起點與那條線的等級較高的", () => {
    const toNext = Array.from({ length: 121 }, () => 100000);
    toNext[30] = 50000;
    toNext[40] = 200000;
    toNext[42] = 120000;
    const quests = [quest("a", { minLv: 32, exp: 60000 }), quest("b", { minLv: 42, exp: 60000 }), quest("c", { minLv: 30, exp: 60000 }), quest("d", { minLv: 41, exp: 60000 })];
    const shared = { ...commonWith([]), expTable: { ...commonWith([]).expTable, toNext } };
    const at = (level: number, band: { from: number; to: number }, id: string) =>
      bandQuests({ band, level, job: 110, quests, monsters, common: shared, maps: {}, effective: effectiveLevels(quests, monsters, shared) })
        .find(item => item.key === `chain:${id}`)?.fraction;
    // 之前的段（30–40，玩家 Lv.40）：用 Lv.40 算，60,000 ÷ 200,000
    expect(at(40, { from: 30, to: 40 }, "a")).toBeCloseTo(0.3);
    // 之後的段（40–50，玩家 Lv.30）：那條線 42 等才接得到，用 Lv.42 算；41 等的用 Lv.41 算
    expect(at(30, { from: 40, to: 50 }, "b")).toBeCloseTo(0.5);
    expect(at(30, { from: 40, to: 50 }, "d")).toBeCloseTo(0.6);
    // 你在的這段（30–40，玩家 Lv.30）：現在就接得到的用 Lv.30 算（升一級 50,000 再多 10,000），32 等的那條用 Lv.32 算
    expect(at(30, { from: 30, to: 40 }, "c")).toBeCloseTo(1.1);
    expect(at(30, { from: 30, to: 40 }, "a")).toBeCloseTo(0.6);
  });

  it("你在的這一段不再列先解已經列的段（伊卡路斯先解第 1–3 段、這段解鎖第 3–4 段 → 必解只剩第 4 段）；不是你在的那段從第一段開始列", () => {
    const quests = [
      quest("a1", { minLv: 10, exp: 20000 }),
      quest("a2", { minLv: 10, exp: 20000 }),
      quest("a3", { minLv: 30, exp: 20000 }),
      quest("a4", { minLv: 35, exp: 20000 }),
    ];
    const mustDo = [rec("a1", "10 起", { chain: ["a1", "a2", "a3", "a4"], name: "伊卡路斯任務鏈（好無聊 → 滑翔翼）" })];
    const shared = common(mustDo);
    const args = { level: 33, job: 110, quests, monsters, common: shared, maps: {}, effective: effectiveLevels(quests, monsters, shared) };
    const band = { from: 30, to: 40 };
    expect(nowQuests(args).map(partsText)).toEqual(["第 1–3 段／共 4 段"]);
    expect(bandQuests({ ...args, band }).map(partsText)).toEqual(["第 1–4 段／共 4 段"]);
    const [row] = bandQuests({ ...args, band, active: true });
    expect(row.quests.map(entry => entry.id)).toEqual(["a4"]);
    expect(row).toMatchObject({ exp: 20000, level: 35 });
    expect(partsText(row)).toBe("第 4 段／共 4 段");
  });

  it("你在的這一段：先解列過的線只接在先解那串的下一段；下一段是長線那種就不列（不會先解第 1–3 段、必解跳到第 5 段）", () => {
    const quests = [
      quest("n1", { minLv: 15, exp: 40000 }),
      quest("n2", { minLv: 15, exp: 40000, pre: ["n1"] }),
      quest("n3", { minLv: 15, exp: 40000, pre: ["n2"] }),
      quest("n4", { minLv: 21, exp: 40000, pre: ["n3"], needMobs: [{ id: 9, n: "刺菇菇", c: 200 }] }),
      quest("n5", { minLv: 25, exp: 40000, pre: ["n4"] }),
      quest("n6", { minLv: 30, exp: 40000, pre: ["n5"] }),
    ];
    const shared = common();
    const args = { level: 25, job: 500, quests, monsters, common: shared, maps: {}, effective: effectiveLevels(quests, monsters, shared) };
    expect(nowQuests(args).map(partsText)).toEqual(["第 1–3 段／共 6 段"]);
    // 不是你在的那段也從第一段開始：第 1–3 段在 15 等、第 4 段長線，到不了 21–30 這段，不列
    expect(bandQuests({ ...args, band: { from: 21, to: 30 } })).toEqual([]);
    expect(bandQuests({ ...args, band: { from: 21, to: 30 }, active: true })).toEqual([]);
  });

  it("你在的這一段：先解沒列（不值得）的線，這段那串要跟現在做得到的段接得上，中間隔著長線那種就不列（湯寶寶第 3 段在長線，不列第 4 段）", () => {
    const quests = [
      quest("t1", { minLv: 15, exp: 100 }),
      quest("t2", { minLv: 15, exp: 100, pre: ["t1"] }),
      quest("t3", { minLv: 25, exp: 30000, pre: ["t2"], needMobs: [{ id: 9, n: "火獨眼獸", c: 200 }] }),
      quest("t4", { minLv: 35, exp: 30000, pre: ["t3"] }),
      quest("u1", { minLv: 32, exp: 100 }),
      quest("u2", { minLv: 36, exp: 30000, pre: ["u1"] }),
    ];
    const shared = common();
    const args = { level: 33, job: 110, quests, monsters, common: shared, maps: {}, effective: effectiveLevels(quests, monsters, shared) };
    expect(nowQuests(args)).toEqual([]);
    // 從第一段開始：t 那條第 1–2 段之後是長線的 t3，到不了這段的 t4，不列；u 那條第 1–2 段照列
    expect(bandQuests({ ...args, band: { from: 30, to: 40 } }).map(item => item.key)).toEqual(["chain:u1"]);
    const rows = bandQuests({ ...args, band: { from: 30, to: 40 }, active: true });
    expect(rows.map(item => [item.key, partsText(item)])).toEqual([["chain:u1", "第 1–2 段／共 2 段"]]);
  });

  it("你在的這一段：先解已經列完這條線在這段的段，這條線就不列", () => {
    const quests = [quest("b1", { minLv: 30, exp: 40000 }), quest("b2", { minLv: 31, exp: 40000, pre: ["b1"] }), quest("solo", { minLv: 32, exp: 40000 })];
    const shared = common();
    const args = { level: 35, job: 110, quests, monsters, common: shared, maps: {}, effective: effectiveLevels(quests, monsters, shared) };
    expect(nowQuests(args).map(item => item.key)).toEqual(["chain:b1", "chain:solo"]);
    expect(bandQuests({ ...args, band: { from: 30, to: 40 }, active: true })).toEqual([]);
  });

  it("法師 8 看到 20 等才接得到的線，約幾級用 20 等算（不會寫約 4.1 級）", () => {
    const toNext = Array.from({ length: 121 }, (_, level) => (level < 20 ? 1000 : 20000));
    const quests = [quest("runaway", { minLv: 20, exp: 6600, jobs: [200] })];
    const shared = { ...commonWith([]), expTable: { ...commonWith([]).expTable, toNext } };
    const [item] = bandQuests({ band: { from: 8, to: 21 }, level: 8, job: 200, quests, monsters, common: shared, maps: {}, effective: effectiveLevels(quests, monsters, shared) });
    expect(item.fraction).toBeCloseTo(0.33);
  });
});

describe("先存著，Lv.N 以後要交（round 4 後續 3）", () => {
  it("只算下一段必解裡、這頁還沒列的任務要交的材料：先解或這段已經列的任務不算（伊卡路斯第 1–2 段的樹枝現在就要交）", () => {
    const monsters = [monster(1, 20, [500]), monster(2, 30, [600]), monster(3, 40, [700])];
    const early = quest("e", { needItems: [{ id: 500, n: "樹枝", c: 70 }, { id: 600, n: "綠液球", c: 70 }] });
    const here = quest("h", { needItems: [{ id: 600, n: "綠液球", c: 30 }] });
    const later = quest("l", { needItems: [{ id: 700, n: "蝙蝠翅膀", c: 50 }, { id: 600, n: "綠液球", c: 20 }] });
    const result = laterMaterials({ next: [{ quests: [early, here, later] }], listed: [{ quests: [early] }, { quests: [here] }], monsters });
    // 樹枝只有先解列過的 e 要，不列；綠液球只算 l 的 20 個；蝙蝠翅膀照列
    expect(result.map(material => [material.n, material.c, material.quests])).toEqual([["蝙蝠翅膀", 50, ["l"]], ["綠液球", 20, ["l"]]]);
  });
});

describe("長線", () => {
  it("同一隻怪單一任務要打 200 隻以上才算；很多小任務加起來不算", () => {
    const quests = [
      quest("k999", { exp: 3000, needMobs: [{ id: 1, n: "刺菇菇", c: 999 }] }),
      quest("s1", { exp: 100, needMobs: [{ id: 2, n: "綠水靈", c: 100 }] }),
      quest("s2", { exp: 100, needMobs: [{ id: 2, n: "綠水靈", c: 150 }] }),
    ];
    expect(longRunTasks(quests, [])).toEqual([
      { kind: "kill", id: 1, n: "刺菇菇", c: 999, quests: ["k999"], exp: 3000, droppers: [1] },
    ]);
  });
});

describe("長線跟先解用同一批候選", () => {
  const monsters = [monster(9, 25), monster(3, 40, [500])];
  const args = (level: number, job: number, quests: Quest[], mustDo: GuideMustDo[] = []) => {
    const common = commonWith(mustDo);
    return { level, job, quests, monsters, common, maps: {}, effective: effectiveLevels(quests, monsters, common) };
  };

  it("實際等級比玩家高的 999 隻任務不列（刺菇菇 Lv.25，實際等級 20，Lv.12 不列、Lv.20 才列）", () => {
    const quests = [quest("k999", { minLv: 10, exp: 30000, needMobs: [{ id: 9, n: "刺菇菇", c: 999 }] })];
    expect(longRunNow(args(12, 110, quests))).toEqual([]);
    expect(longRunNow(args(20, 110, quests)).map(entry => entry.n)).toEqual(["刺菇菇"]);
  });

  it("攻略建議等級過期的不列（詛咒娃娃 35–45，Lv.82 不列）", () => {
    const quests = [quest("dolls", { minLv: 35, exp: 50000, needItems: [{ id: 500, n: "詛咒娃娃", c: 2300 }] })];
    const mustDo = [rec("dolls", "35–45")];
    expect(longRunNow(args(40, 230, quests, mustDo)).map(entry => entry.n)).toEqual(["詛咒娃娃"]);
    expect(longRunNow(args(82, 230, quests, mustDo))).toEqual([]);
  });

  it("跟先解同一條值不值得的門檻：經驗不到 0.25 級、沒有攻略推薦也沒有關鍵獎勵的不列（石面怪人 ×300）", () => {
    const quests = [
      quest("stone", { minLv: 20, exp: 1000, needMobs: [{ id: 9, n: "石面怪人", c: 300 }] }),
      quest("big", { minLv: 20, exp: 30000, needMobs: [{ id: 3, n: "木面怪人", c: 200 }] }),
    ];
    expect(longRunNow(args(82, 230, quests)).map(entry => entry.n)).toEqual(["木面怪人"]);
  });

  it("有關鍵獎勵的不管經驗多少都列；有攻略推薦的到 0.08 級就列", () => {
    const quests = [
      quest("dolls", { minLv: 35, exp: 1000, needItems: [{ id: 500, n: "詛咒娃娃", c: 2300 }] }),
      quest("rec", { minLv: 35, exp: 9000, needMobs: [{ id: 9, n: "風獨眼獸", c: 999 }] }),
      quest("low", { minLv: 35, exp: 5000, needMobs: [{ id: 3, n: "木面怪人", c: 300 }] }),
    ];
    const mustDo = [
      rec("dolls", "35+", { reward: { label: "隨機寶石", items: [] } }),
      rec("rec", "35+"),
      rec("low", "35+"),
    ];
    expect(longRunNow(args(40, 230, quests, mustDo)).map(entry => entry.n)).toEqual(["詛咒娃娃", "風獨眼獸"]);
  });

  it("還在楓之島（初心者 10 等前）不列", () => {
    const quests = [quest("k999", { exp: 3000, needMobs: [{ id: 9, n: "刺菇菇", c: 999 }] })];
    expect(longRunNow(args(9, 0, quests))).toEqual([]);
  });
});

describe("先解的帶我去", () => {
  const maps = {
    120000101: { zh: "航海室", ret: 120000000 },
    912010200: { zh: "卡伊琳的訓練場", ret: 120000101 },
    876009611: { zh: "隱藏研究室" },
  };
  const routable = new Set([120000000, 120000101, 104000000]);

  it("NPC 站的圖走得到就去那裡", () => {
    expect(npcGoTarget(120000101, maps, routable)).toEqual({ map: 120000101, viaReturn: false });
  });

  it("NPC 站在隱藏地圖（卡伊琳的訓練場）就帶去它的回城點", () => {
    expect(npcGoTarget(912010200, maps, routable)).toEqual({ map: 120000101, viaReturn: true });
  });

  it("隱藏地圖又沒有走得到的回城點就不給", () => {
    expect(npcGoTarget(876009611, maps, routable)).toBeUndefined();
    expect(npcGoTarget(undefined, maps, routable)).toBeUndefined();
  });
});
