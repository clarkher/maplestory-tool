import { describe, expect, it } from "vitest";
import { shareLines, type ShareCard } from "../share-image";

const base: ShareCard = {
  title: "冰雷巫師 Lv.46・森林迷宮Ⅲ",
  exp10: 52800,
  second: { label: "淨賺楓幣", value: "34840" },
  eta: "1 小時 12 分",
  monsterSrc: null,
  date: "2026/10/29",
};

describe("shareLines", () => {
  it("標題接上日期、經驗加千分位", () => {
    const l = shareLines(base);
    expect(l.heading).toBe("冰雷巫師 Lv.46・森林迷宮Ⅲ・2026/10/29");
    expect(l.big).toBe("52,800");
  });
  it("淨賺楓幣加千分位與正號，下面第二格是升級還要", () => {
    expect(shareLines(base).bottom).toEqual([
      ["淨賺楓幣", "+34,840"],
      ["升級還要", "1 小時 12 分"],
    ]);
  });
  it("淨賺為負用減號", () => {
    const l = shareLines({ ...base, second: { label: "淨賺楓幣", value: "-1200" } });
    expect(l.bottom[0]).toEqual(["淨賺楓幣", "−1,200"]);
  });
  it("沒有淨賺時換成「這段拿到」，值照千分位但不加正號", () => {
    const l = shareLines({ ...base, second: { label: "這段拿到", value: "5280000" } });
    expect(l.bottom[0]).toEqual(["這段拿到", "5,280,000"]);
  });
  it("非純數字的值原樣放", () => {
    const l = shareLines({ ...base, second: { label: "這段拿到", value: "12,345 經驗" } });
    expect(l.bottom[0][1]).toBe("12,345 經驗");
  });
});
