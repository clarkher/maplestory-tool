import { describe, expect, it } from "vitest";
import { buyQuestRows, cheapestShop, shopLine } from "@/lib/buy-quests";
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
  const data: BuyQuestData = { quests: ["1", "2", "4", "5", "6", "404"], shops: { 2010000: [apple] } };

  it("經驗高的在前，一樣多的需求等級低的在前；沒經驗的排最後；開發測試用、查不到的不列", () => {
    expect(buyQuestRows(data, quests).map(row => row.quest.id)).toEqual(["2", "5", "1", "6"]);
  });
  it("前置任務帶出來；商店有賣的道具帶最便宜那家", () => {
    const rows = buyQuestRows(data, quests);
    expect(rows.find(row => row.quest.id === "2")!.pre.map(pre => pre.id)).toEqual(["3"]);
    expect(rows.find(row => row.quest.id === "1")!.shops.get(2010000)).toBe(apple);
    expect(rows.find(row => row.quest.id === "2")!.shops.size).toBe(0);
  });
  it("只看接得到的：等級不到、別的職業、按過做完了的都不列", () => {
    const rows = buyQuestRows(data, quests, { profile: { level: 25, job: 100 }, done: new Set(["6"]) });
    expect(rows.map(row => row.quest.id)).toEqual(["1"]);
  });
});
