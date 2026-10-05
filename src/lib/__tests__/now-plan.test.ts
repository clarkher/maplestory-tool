import { describe, expect, it } from "vitest";
import { bandQuests, effectiveLevels, longRunNow, longRunTasks, npcGoTarget, nowQuests, partsText, recUpperLevel, rewardFitsJob } from "@/lib/now-plan";
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

  it("整條線只有一段不寫；一段寫第 N 段；連在一起的好幾段寫第 a–b 段", () => {
    expect(partsText({ positions: range(1, 52), totalParts: 52 })).toBe("第 1–52 段／共 52 段");
    expect(partsText({ positions: [3], totalParts: 5 })).toBe("第 3 段／共 5 段");
    expect(partsText({ positions: [1], totalParts: 1 })).toBeNull();
  });

  it("中間有段沒列、4 段以內：一段一段列出來（湯寶寶第 3 段放在長線，寫第 1、2、4、5 段）", () => {
    expect(partsText({ positions: [1, 2, 4, 5], totalParts: 5 })).toBe("第 1、2、4、5 段／共 5 段");
    expect(partsText({ positions: [1, 3], totalParts: 3 })).toBe("第 1、3 段／共 3 段");
  });

  it("中間有段沒列、超過 4 段：寫第 a–b 段中的 k 段", () => {
    expect(partsText({ positions: range(1, 52).filter(part => part !== 30), totalParts: 52 })).toBe("第 1–52 段中的 51 段／共 52 段");
    expect(partsText({ positions: [1, 2, 3, 5, 6], totalParts: 6 })).toBe("第 1–6 段中的 5 段／共 6 段");
  });

  it("先解跟必解都照實寫：中間那段要打 999 隻（放在長線）時寫第 1、3 段", () => {
    const monsters = [monster(1, 20)];
    const quests = [
      quest("p1", { minLv: 20, exp: 30000 }),
      quest("p2", { minLv: 20, exp: 30000, pre: ["p1"], needMobs: [{ id: 1, n: "刺菇菇", c: 999 }] }),
      quest("p3", { minLv: 20, exp: 30000, pre: ["p2"] }),
    ];
    const common = commonWith([]);
    const effective = effectiveLevels(quests, monsters, common);
    const [todo] = nowQuests({ level: 25, job: 110, quests, monsters, common, maps: {}, effective });
    const [band] = bandQuests({ band: { from: 10, to: 21 }, level: 25, job: 110, quests, monsters, common, maps: {}, effective });
    expect(partsText(todo)).toBe("第 1、3 段／共 3 段");
    expect(partsText(band)).toBe("第 1、3 段／共 3 段");
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

  it("第幾段／共幾段算整條線：這一段只列在這段解鎖的", () => {
    const quests = [
      quest("q1", { minLv: 20, exp: 20000 }),
      quest("q2", { minLv: 20, exp: 20000, pre: ["q1"] }),
      quest("q3", { minLv: 40, exp: 30000, pre: ["q2"] }),
    ];
    expect(run(25, { from: 21, to: 30 }, quests)).toEqual([]);
    expect(run(25, { from: 10, to: 21 }, quests)[0]).toMatchObject({ firstPart: 1, lastPart: 2, totalParts: 3, exp: 40000 });
    expect(run(25, { from: 40, to: 50 }, quests)[0]).toMatchObject({ firstPart: 3, lastPart: 3, totalParts: 3, exp: 30000 });
  });

  it("要打 200 隻以上、或同一道具累計 200 個以上的不列（那些在長線）", () => {
    const quests = [
      quest("k", { minLv: 30, exp: 90000, needMobs: [{ id: 9, n: "刺菇菇", c: 999 }] }),
      quest("d1", { minLv: 35, exp: 60000, needItems: [{ id: 500, n: "詛咒娃娃", c: 100 }] }),
      quest("d2", { minLv: 35, exp: 60000, needItems: [{ id: 500, n: "詛咒娃娃", c: 200 }], pre: ["d1"] }),
      quest("ok", { minLv: 31, exp: 60000 }),
    ];
    expect(run(35, { from: 30, to: 40 }, quests).map(item => item.key)).toEqual(["chain:ok"]);
  });

  it("同一條線在先解跟必解拿掉的段一樣，經驗是同一個數字（另一段等級的任務也要交同一道具時）", () => {
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
    expect(ringNow?.exp).toBe(100000);
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

  it("法師 8 看到 20 等才接得到的線，約幾級用 20 等算（不會寫約 4.1 級）", () => {
    const toNext = Array.from({ length: 121 }, (_, level) => (level < 20 ? 1000 : 20000));
    const quests = [quest("runaway", { minLv: 20, exp: 6600, jobs: [200] })];
    const shared = { ...commonWith([]), expTable: { ...commonWith([]).expTable, toNext } };
    const [item] = bandQuests({ band: { from: 8, to: 21 }, level: 8, job: 200, quests, monsters, common: shared, maps: {}, effective: effectiveLevels(quests, monsters, shared) });
    expect(item.fraction).toBeCloseTo(0.33);
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
