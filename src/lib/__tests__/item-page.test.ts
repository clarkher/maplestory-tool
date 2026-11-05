import { describe, expect, it } from "vitest";
import { hasItemPage, itemPageTitle, itemSummary } from "@/lib/item-page";
import type { Item } from "@/lib/types";

const monsters = new Map([[1, "綠水靈"], [2, "菇菇"], [3, "木妖"], [4, "猴子"]]);
const quests = new Map([["q1", "波達的請求"], ["q2", "愛情象徵"]]);
const lookup = { monster: (id: number) => monsters.get(id), quest: (id: string) => quests.get(id) };
const base: Item = { id: 9, n: "堅韌的筋腱", c: "其他", s: "任務道具" };
const shop = (extra: object) => ({ ...base, sp: [{ p: "雜貨店", pr: 100, c: 1, ...extra }] }) as Item;

describe("hasItemPage：只出查得到來源的一般道具", () => {
  it("有怪物掉、任務、常駐店才出", () => {
    expect(hasItemPage({ ...base, dm: [1] }, lookup)).toBe(true);
    expect(hasItemPage({ ...base, qq: ["q1"] }, lookup)).toBe(true);
    expect(hasItemPage({ ...base, qr: ["q1"] }, lookup)).toBe(true);
    expect(hasItemPage(shop({}), lookup)).toBe(true);
  });
  it("查不到來源不出（只有舊版店家數也不算）", () => {
    expect(hasItemPage(base, lookup)).toBe(false);
    expect(hasItemPage({ ...base, sh: 3 }, lookup)).toBe(false);
  });
  it("怪物、任務不存在不算來源", () => {
    expect(hasItemPage({ ...base, dm: [999] }, lookup)).toBe(false);
    expect(hasItemPage({ ...base, qq: ["nope"] }, lookup)).toBe(false);
  });
  it("只有活動店不算", () => {
    expect(hasItemPage(shop({ e: "2026-11-11T00:00:00+08:00" }), lookup)).toBe(false);
    expect(hasItemPage(shop({ u: "硬幣" }), lookup)).toBe(false);
  });
  it("時裝、現金、沒名字的不出", () => {
    expect(hasItemPage({ ...shop({}), c: "時裝" }, lookup)).toBe(false);
    expect(hasItemPage({ ...base, c: "現金", dm: [1] }, lookup)).toBe(false);
    expect(hasItemPage({ ...base, un: 1, dm: [1] }, lookup)).toBe(false);
  });
});

describe("itemPageTitle：標題只寫頁面答得出來的", () => {
  it("裝備寫能力值", () => {
    expect(itemPageTitle({ ...base, n: "丈八蛇矛", c: "裝備", eq: { incPAD: 72 } })).toBe("丈八蛇矛｜哪裡拿、能力值");
  });
  it("有任務要用寫任務用途", () => {
    expect(itemPageTitle({ ...base, qq: ["q1"] })).toBe("堅韌的筋腱｜哪裡拿、任務用途");
  });
  it("其他只寫哪裡拿", () => {
    expect(itemPageTitle({ ...base, dm: [1] })).toBe("堅韌的筋腱｜哪裡拿");
  });
});

describe("itemSummary", () => {
  it("分類、怪、任務都寫", () => {
    expect(itemSummary({ ...base, dm: [1, 2], qr: ["q1"], qq: ["q2"] }, lookup)).toBe(
      "堅韌的筋腱是任務道具。綠水靈、菇菇會掉。任務「波達的請求」會給。任務「愛情象徵」要用到。",
    );
  });
  it("怪太多只列三隻寫總數", () => {
    expect(itemSummary({ ...base, dm: [1, 2, 3, 4] }, lookup)).toContain("綠水靈、菇菇、木妖等 4 種怪會掉。");
  });
  it("舊版資料的店要講", () => {
    expect(itemSummary(shop({ o: 1 }), lookup)).toContain("可以在雜貨店買（參考舊版資料）。");
  });
  it("裝備寫等級；0 等不寫", () => {
    expect(itemSummary({ ...base, s: "槍", c: "裝備", eq: { reqLevel: 50 } }, lookup)).toContain("是槍，Lv.50 可以用。");
    expect(itemSummary({ ...base, s: "槍", c: "裝備", eq: { reqLevel: 0 } }, lookup)).toContain("是槍。");
  });
  it("活動店不寫進摘要；不存在的怪不寫", () => {
    expect(itemSummary({ ...shop({ e: "2026-11-11T00:00:00+08:00" }), dm: [999] }, lookup)).toBe("堅韌的筋腱是任務道具。");
  });
});
