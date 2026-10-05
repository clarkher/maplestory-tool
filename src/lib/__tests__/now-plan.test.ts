import { describe, expect, it } from "vitest";
import { effectiveLevels, longRunNow, longRunTasks, npcGoTarget, nowQuests, recUpperLevel, rewardFitsJob } from "@/lib/now-plan";
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
