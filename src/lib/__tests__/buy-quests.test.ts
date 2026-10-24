import { describe, expect, it } from "vitest";
import {
  BIG_AMOUNT,
  buyQuestRegions,
  buyQuestRows,
  chainSteps,
  cheapestShop,
  displayItemName,
  npcShopTotal,
  pickShop,
  rewardFitsJob,
  shopLine,
} from "@/lib/buy-quests";
import type { BuyQuestData, Quest, ShopRow } from "@/lib/types";

const q = (id: string, extra: Partial<Quest> = {}): Quest => ({ id, n: `任務${id}`, cat: "維多利亞島", ...extra });

describe("最便宜的店", () => {
  it("整組賣的除以組數比；一樣便宜取先列的；沒有店回 undefined", () => {
    const a: ShopRow = { p: "弓箭手村", pr: 30 };
    const b: ShopRow = { p: "通行證遠端商店", pr: 1400, k: 100 };
    const c: ShopRow = { p: "勇士之村", pr: 30 };
    expect(cheapestShop([a, b])).toBe(b);
    expect(cheapestShop([a, c])).toBe(a);
    expect(cheapestShop(undefined)).toBeUndefined();
    expect(cheapestShop([])).toBeUndefined();
  });
  it("一行字：每個 N 楓幣（NPC · 地點）；整組寫 N 個 N 楓幣；沒有 NPC 只寫地點", () => {
    expect(shopLine({ p: "弓箭手村雜貨店", n: "雜貨商人", pr: 1200 })).toBe("每個 1,200 楓幣（雜貨商人 · 弓箭手村雜貨店）");
    expect(shopLine({ p: "楓之谷通行證遠端商店", pr: 1400, k: 2000 })).toBe("2,000 個 1,400 楓幣（楓之谷通行證遠端商店）");
  });
});

describe("卡片資料", () => {
  const quests = [
    q("1", { exp: 3000, minLv: 20, needItems: [{ id: 2010000, n: "蘋果", c: 20 }] }),
    q("2", { exp: 36000, minLv: 40, pre: ["3"], needItems: [{ id: 4000023, n: "冰獨眼獸之尾巴", c: 50 }] }),
    q("3", { exp: 3000, minLv: 10 }),
    q("4", { n: "開發測試用", exp: 99999 }),
    q("5", { exp: 5000, minLv: 30, jobs: [400] }),
    q("6", { minLv: 10 }),
  ];
  const apple: ShopRow = { p: "弓箭手村", n: "雜貨商人", pr: 30, o: 1 };
  const data: BuyQuestData = { quests: ["1", "2", "4", "5", "6", "404"], shops: { 2010000: [apple] }, skills: {} };

  it("經驗高的在前，一樣多的需求等級低的在前；沒經驗的排最後；開發測試用、查不到的不列", () => {
    expect(buyQuestRows(data, quests).map(row => row.quest.id)).toEqual(["2", "5", "1", "6"]);
  });
  it("經驗一樣：需求等級低的在前（資料裡倒著排也一樣）", () => {
    const sameExp = [
      q("11", { exp: 1000, minLv: 40 }),
      q("12", { exp: 1000, minLv: 30 }),
      q("13", { exp: 1000, minLv: 20 }),
    ];
    const rows = buyQuestRows({ quests: ["11", "12", "13"], shops: {}, skills: {} }, sameExp);
    expect(rows.map(row => row.quest.id)).toEqual(["13", "12", "11"]);
  });
  it("經驗、需求等級都一樣：照任務編號，同一條任務線會照順序", () => {
    const chain = [q("69089", { exp: 50000, minLv: 30 }), q("69088", { exp: 50000, minLv: 30 })];
    const rows = buyQuestRows({ quests: ["69089", "69088"], shops: {}, skills: {} }, chain);
    expect(rows.map(row => row.quest.id)).toEqual(["69088", "69089"]);
  });
  it("完成後學會的技能：站上查得到的帶出名字，查不到的略過、同名不重複", () => {
    const skillQuests = [q("6000", { money: -1000000, rewardSkills: [1003, 10001003, 20001003] }), q("7", { exp: 10 }), q("8", { exp: 5, rewardSkills: [1003, 1003] })];
    const rows = buyQuestRows({ quests: ["6000", "7", "8"], shops: {}, skills: { 1003: "神匠之魂" } }, skillQuests);
    expect(rows.find(row => row.quest.id === "6000")!.skills).toEqual(["神匠之魂"]);
    expect(rows.find(row => row.quest.id === "7")!.skills).toEqual([]);
    expect(rows.find(row => row.quest.id === "8")!.skills).toEqual(["神匠之魂"]);
  });
  it("舊版資料沒有 skills 欄位：不會丟錯，技能是空的", () => {
    const old = { quests: ["6000"], shops: {} } as unknown as BuyQuestData;
    const rows = buyQuestRows(old, [q("6000", { rewardSkills: [1003] })]);
    expect(rows.map(row => row.skills)).toEqual([[]]);
  });
  it("前置任務帶出來；商店有賣的道具帶最便宜那家", () => {
    const rows = buyQuestRows(data, quests);
    expect(rows.find(row => row.quest.id === "2")!.pre.map(pre => pre.id)).toEqual(["3"]);
    expect(rows.find(row => row.quest.id === "1")!.shops.get(2010000)).toBe(apple);
    expect(rows.find(row => row.quest.id === "2")!.shops.size).toBe(0);
  });
  it("只看接得到的：等級不到、別的職業、按過做完了的都不列", () => {
    const rows = buyQuestRows(data, quests, { eligible: { level: 25, job: 100 }, done: new Set(["6"]) });
    expect(rows.map(row => row.quest.id)).toEqual(["1"]);
  });
  it("按過做完了的不列，沒開「只看接得到的」也一樣", () => {
    const rows = buyQuestRows(data, quests, { done: new Set(["1"]) });
    expect(rows.map(row => row.quest.id)).not.toContain("1");
    expect(rows.map(row => row.quest.id)).toContain("2");
  });
  it("要先做只列還沒做完的前置；全做完了就是空的", () => {
    const two = q("p2", { exp: 100, pre: ["p1", "p0"] });
    const ones = [q("p0"), q("p1"), two];
    const list: BuyQuestData = { quests: ["p2"], shops: {}, skills: {} };
    expect(buyQuestRows(list, ones)[0].pre.map(pre => pre.id)).toEqual(["p1", "p0"]);
    expect(buyQuestRows(list, ones, { done: new Set(["p1"]) })[0].pre.map(pre => pre.id)).toEqual(["p0"]);
    expect(buyQuestRows(list, ones, { done: new Set(["p0", "p1"]) })[0].pre).toEqual([]);
  });
});

describe("連前面一起做（整串前置）", () => {
  const byIdOf = (list: Quest[]) => new Map(list.map(quest => [quest.id, quest]));
  const talk = q("t", {});
  const buyPre = q("b", { exp: 1000, needItems: [{ id: 4000000, n: "藍寶殼", c: 10 }] });
  const fight = q("f", { needMobs: [{ id: 100100, n: "嫩寶", c: 10 }] });
  const hidden = q("h", { needItems: [{ id: 4031041, n: "休咪的錢包", c: 1 }] });
  const buySet = new Set(["b", "x", "y", "z"]);

  it("前置是只找人對話、或交拍賣買得到的：整串照要做的順序列出（前面的在前，最後是自己）", () => {
    const x = q("x", { pre: ["b"], needItems: [{ id: 4000001, n: "嫩寶殼", c: 5 }] });
    const b = { ...buyPre, pre: ["t"] };
    expect(chainSteps(x, byIdOf([x, b, talk]), buySet, new Set())!.map(quest => quest.id)).toEqual(["t", "b", "x"]);
  });
  it("前置要打怪、或要交拍賣買不到的（任務道具）、或站上查不到：回 undefined", () => {
    const y = q("y", { pre: ["f"] });
    const z = q("z", { pre: ["h"] });
    const w = q("x", { pre: ["404"] });
    expect(chainSteps(y, byIdOf([y, fight]), buySet, new Set())).toBeUndefined();
    expect(chainSteps(z, byIdOf([z, hidden]), buySet, new Set())).toBeUndefined();
    expect(chainSteps(w, byIdOf([w]), buySet, new Set())).toBeUndefined();
  });
  it("按過「我做完了」的前置不算、也不往前找（打怪的那段做完了就沒關係）", () => {
    const y = q("y", { pre: ["f"] });
    expect(chainSteps(y, byIdOf([y, fight]), buySet, new Set(["f"]))!.map(quest => quest.id)).toEqual(["y"]);
  });
  it("卡片：有前置才有 chain，段數、合計經驗、合計要交（同一個道具相加）", () => {
    const first = q("y", { exp: 2000, needItems: [{ id: 4000000, n: "藍寶殼", c: 10 }, { id: 4000001, n: "嫩寶殼", c: 3 }] });
    const second = q("z", { exp: 5000, pre: ["y"], needItems: [{ id: 4000000, n: "藍寶殼", c: 5 }] });
    const rows = buyQuestRows({ quests: ["y", "z"], shops: {}, skills: {} }, [first, second]);
    const z = rows.find(row => row.quest.id === "z")!;
    expect(z.noFight).toBe(true);
    expect(z.chain).toEqual({ steps: 2, exp: 7000, items: [{ id: 4000000, n: "藍寶殼", c: 15 }, { id: 4000001, n: "嫩寶殼", c: 3 }] });
    expect(rows.find(row => row.quest.id === "y")!.chain).toBeUndefined();
  });
  it("篩「前面也不用打怪」：前置要打怪的不列", () => {
    const ok = q("y", { exp: 10 });
    const bad = q("z", { exp: 20, pre: ["f"] });
    const rows = buyQuestRows({ quests: ["y", "z"], shops: {}, skills: {} }, [ok, bad, fight], { noFightChain: true });
    expect(rows.map(row => row.quest.id)).toEqual(["y"]);
  });
});

describe("職業限定獎勵", () => {
  it("上游 job 碼：第 1 位劍士、2 法師、3 弓箭手、4 盜賊、5 海盜、第 0 位初心者；沒有碼、沒選職業都算拿得到", () => {
    expect(rewardFitsJob(2099202, 110)).toBe(true);
    expect(rewardFitsJob(2099202, 210)).toBe(false);
    expect(rewardFitsJob(4100, 230)).toBe(true);
    expect(rewardFitsJob(8200, 320)).toBe(true);
    expect(rewardFitsJob(16400, 420)).toBe(true);
    expect(rewardFitsJob(32800, 510)).toBe(true);
    expect(rewardFitsJob(1049601, 0)).toBe(true);
    expect(rewardFitsJob(1049601, 110)).toBe(false);
    expect(rewardFitsJob(undefined, 110)).toBe(true);
    expect(rewardFitsJob(2099202, -1)).toBe(true);
  });
  it("卡片：給了職業就只留拿得到的；沒給照舊全列", () => {
    const quest = q("2034", {
      exp: 2200,
      rewardItems: [{ id: 1072001, n: "綠鬥士鞋", c: 1, job: 2099202 }, { id: 1072075, n: "白魔法鞋", c: 1, job: 4100 }, { id: 2000000, n: "紅色藥水", c: 5 }],
    });
    const data = { quests: ["2034"], shops: {}, skills: {} };
    expect(buyQuestRows(data, [quest], { job: 210 })[0].rewards.map(item => item.n)).toEqual(["白魔法鞋", "紅色藥水"]);
    expect(buyQuestRows(data, [quest])[0].rewards).toHaveLength(3);
  });
});

describe("名字、量、錢、店", () => {
  it("上游沒名字的：卷軸寫「名字不明的卷軸」，其他寫「名字不明的道具」，有名字的照舊", () => {
    expect(displayItemName({ id: 2040516, n: "未命名道具 2040516" })).toBe("名字不明的卷軸");
    expect(displayItemName({ id: 1302999, n: "未命名道具 1302999" })).toBe("名字不明的道具");
    expect(displayItemName({ id: 2040001, n: "頭盔防禦卷軸60%" })).toBe("頭盔防禦卷軸60%");
  });
  it("卡片的獎勵、要交的東西沒名字時也換掉", () => {
    const quest = q("3052", { exp: 1, needItems: [{ id: 4000000, n: "藍寶殼", c: 1 }], rewardItems: [{ id: 2040516, n: "未命名道具 2040516", c: 1, rand: 1 }] });
    const rows = buyQuestRows({ quests: ["3052"], shops: {}, skills: {} }, [quest]);
    expect(rows[0].rewards[0]).toEqual({ id: 2040516, n: "名字不明的卷軸", c: 1, rand: 1 });
  });
  it(`量多：單一道具要 ${200} 個以上才算`, () => {
    expect(BIG_AMOUNT).toBe(200);
    const rows = buyQuestRows(
      { quests: ["a", "b"], shops: {}, skills: {} },
      [q("a", { exp: 2, needItems: [{ id: 1, n: "詛咒娃娃", c: 200 }] }), q("b", { exp: 1, needItems: [{ id: 1, n: "詛咒娃娃", c: 199 }] })],
    );
    expect(rows.map(row => row.big)).toEqual([true, false]);
  });
  it("NPC 商店買齊的錢：全部都有賣才算（整組賣的除組數再乘數量）；有一樣沒賣就沒有", () => {
    const shops = new Map<number, ShopRow>([[1, { p: "弓箭手村", pr: 30 }], [2, { p: "遠端商店", pr: 1400, k: 100 }]]);
    expect(npcShopTotal([{ id: 1, n: "蘋果", c: 20 }, { id: 2, n: "箭", c: 50 }], shops)).toBe(1300);
    expect(npcShopTotal([{ id: 1, n: "蘋果", c: 20 }, { id: 3, n: "冰獨眼獸之尾巴", c: 50 }], shops)).toBeUndefined();
    expect(npcShopTotal([], shops)).toBeUndefined();
  });
  it("挑店：起點城鎮有賣就挑那家（多家取便宜的），沒有才挑最便宜的", () => {
    const far: ShopRow = { p: "弓箭手村雜貨店", m: 100000102, pr: 30 };
    const home: ShopRow = { p: "冰原雪域雜貨店", m: 211000102, pr: 40 };
    const townOf = (mapId: number) => ({ 100000102: 100000000, 211000102: 211000000 })[mapId];
    expect(pickShop([far, home], 211000000, townOf)).toBe(home);
    expect(pickShop([far, home], 104000000, townOf)).toBe(far);
    expect(pickShop([far, home])).toBe(far);
  });
  it("卡片：起點有賣的道具記在 shopNear", () => {
    const home: ShopRow = { p: "冰原雪域雜貨店", m: 211000102, pr: 40 };
    const quest = q("3100", { exp: 1, needItems: [{ id: 2010000, n: "蘋果", c: 20 }] });
    const rows = buyQuestRows({ quests: ["3100"], shops: { 2010000: [home] }, skills: {} }, [quest], {
      startTown: 211000000,
      townOf: mapId => (mapId === 211000102 ? 211000000 : undefined),
    });
    expect([...rows[0].shopNear]).toEqual([2010000]);
    expect(rows[0].shopTotal).toBe(800);
  });
});

describe("地區", () => {
  const quests = [q("1", { exp: 3, cat: "維多利亞島" }), q("2", { exp: 2, cat: "冰原雪域" }), q("3", { exp: 1, cat: "維多利亞島" })];
  const data = { quests: ["1", "2", "3"], shops: {}, skills: {} };
  it("下拉選單的選項：清單裡有的地區，照名字排", () => {
    expect(buyQuestRegions(data, quests)).toEqual(["冰原雪域", "維多利亞島"].sort());
  });
  it("選了地區只列那個地區，空字串＝全部", () => {
    expect(buyQuestRows(data, quests, { region: "維多利亞島" }).map(row => row.quest.id)).toEqual(["1", "3"]);
    expect(buyQuestRows(data, quests, { region: "" })).toHaveLength(3);
  });
});
