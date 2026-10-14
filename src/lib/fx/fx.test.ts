/**
 * 楓幣匯率頁的純函式（src/lib/fx/fx.ts，v0.98）：手做小資料，期望值都是手算的。
 * 規格 docs/superpowers/specs/2026-10-13-meso-fx-design.md。
 */
import { describe, expect, it } from "vitest";
import {
  candleDir, dayChange, dayLabel, daysUntil, dirWord, fmtInt, fmtPct, fmtWan, fmtYuan, freshnessOf, ladderHead, ladderRows,
  ladderTotal, listingDays, movingAverage, niceTicks, pinIndex, perYi, prevWord, priceDomain, quoteOf, sourceText, taipeiDate,
  wanPerNtd, type Day, type FxData, type Latest,
} from "@/lib/fx/fx";

function day(date: string, open: number, close: number, extra: Partial<Day> = {}): Day {
  return { date, open, high: Math.max(open, close), low: Math.min(open, close), close, closeMesoPerNtd: 3, listings: null, samples: 1, source: "ref", ...extra };
}

function latestOf(t: string, ask100: number, ladder: [number, number][] = []): Latest {
  return { t, fetchedAt: t, ask100, listings: null, ladder };
}

function fxOf(days: Day[], latest: Latest): FxData {
  return { daily: { server: "scania", unit: "yi", source: "ref", updatedAt: latest.t, days }, latest };
}

const SEVEN = ["10", "11", "12", "13", "14", "15", "16"].map((d, i) => day(`2026-10-${d}`, 100 + i * 10, 100 + i * 10));

describe("換算", () => {
  it("每 100 元換 300 萬 → 1 億楓幣 3333.3 元；3333.3 元 → 1 元換 3 萬", () => {
    expect(perYi(300)).toBe(3333.3);
    expect(wanPerNtd(3333.3)).toBe(3);
  });
  it("1 元換萬數取兩位小數", () => {
    expect(wanPerNtd(4000)).toBe(2.5);
    expect(wanPerNtd(3000)).toBe(3.33);
  });
  it("格式化：千分位、兩位小數、百分比取絕對值", () => {
    expect(fmtYuan(3333.3)).toBe("3,333");
    expect(fmtWan(3)).toBe("3.00");
    expect(fmtPct(-0.2006)).toBe("0.20%");
    expect(fmtInt(1234567.4)).toBe("1,234,567");
  });
  it("dayLabel：2026-10-14 是週三、2026-01-05 是週一", () => {
    expect(dayLabel("2026-10-14")).toEqual({ md: "10/14", week: "三" });
    expect(dayLabel("2026-01-05")).toEqual({ md: "1/05", week: "一" });
  });
  it("taipeiDate：UTC 17:00 已經是台北隔天", () => {
    expect(taipeiDate("2026-10-13T17:00:00Z")).toBe("2026-10-14");
    expect(taipeiDate("2026-10-13T15:59:00Z")).toBe("2026-10-13");
  });
});

describe("均線", () => {
  it("7 天、span 5：前 4 天 null，第 5 天起是前 5 天 close 平均", () => {
    // closes 100,110,120,130,140,150,160
    expect(movingAverage(SEVEN, 5)).toEqual([null, null, null, null, 120, 130, 140]);
  });
  it("span 1 就是 close 本身", () => {
    expect(movingAverage(SEVEN.slice(0, 2), 1)).toEqual([100, 110]);
  });
  it("daysUntil：7 天離 20 日線還差 13 天，夠了回 0", () => {
    expect(daysUntil(SEVEN, 20)).toBe(13);
    expect(daysUntil(Array.from({ length: 25 }, () => SEVEN[0]), 20)).toBe(0);
  });
});

describe("漲跌", () => {
  it("candleDir：收比開高＝漲、低＝跌、一樣＝持平，差不到 0.1 也算持平", () => {
    expect(candleDir(day("2026-10-14", 100, 101))).toBe("up");
    expect(candleDir(day("2026-10-14", 101, 100))).toBe("down");
    expect(candleDir(day("2026-10-14", 100, 100))).toBe("flat");
    expect(candleDir(day("2026-10-14", 100, 100.04))).toBe("flat");
  });
  it("dayChange：跟前一天 close 比的差、百分比、方向；第一天回 null", () => {
    const days = [day("2026-10-12", 100, 100), day("2026-10-13", 100, 110), day("2026-10-14", 110, 99), day("2026-10-15", 99, 99.2)];
    expect(dayChange(days, 0)).toBeNull();
    expect(dayChange(days, 1)).toEqual({ diff: 10, pct: 10, dir: "up" });
    const down = dayChange(days, 2)!;
    expect(down.diff).toBe(-11);
    expect(down.pct).toBeCloseTo(-10, 9);
    expect(down.dir).toBe("down");
    // 差 0.2 元四捨五入成 0 → 持平
    expect(dayChange(days, 3)!.diff).toBe(0);
    expect(dayChange(days, 3)!.dir).toBe("flat");
  });
  it("dirWord", () => {
    expect([dirWord("up"), dirWord("down"), dirWord("flat")]).toEqual(["漲", "跌", "平"]);
  });
});

describe("quoteOf", () => {
  const latest = latestOf("2026-10-14T04:00:00Z", 300); // 台北 10/14 12:00
  it("報價取最新開價；跟「今天以前」最後一天的收盤比，今天自己那天不算前一天", () => {
    const days = [
      day("2026-10-12", 3300, 3300, { closeMesoPerNtd: 3.03 }),
      day("2026-10-13", 3340, 3340, { closeMesoPerNtd: 2.99 }),
      day("2026-10-14", 3340, 3330, { closeMesoPerNtd: 3 }),
    ];
    const quote = quoteOf(fxOf(days, latest));
    expect(quote.yuan).toBe(3333.3);
    expect(quote.wan).toBe(3);
    expect(quote.ask100).toBe(300);
    expect(quote.prev?.date).toBe("2026-10-13");
    expect(quote.diffYuan).toBe(-7); // round(3333.3 - 3340)
    expect(quote.pct).toBeCloseTo((-6.7 / 3340) * 100, 9);
    expect(quote.diffWan).toBe(0.01); // 3 - 2.99
    expect(quote.dir).toBe("down");
  });
  it("只有今天一天：沒有前一天，沒有漲跌", () => {
    const quote = quoteOf(fxOf([day("2026-10-14", 3340, 3330)], latest));
    expect(quote.prev).toBeNull();
    expect(quote.diffYuan).toBe(0);
    expect(quote.pct).toBe(0);
    expect(quote.diffWan).toBe(0);
    expect(quote.dir).toBe("flat");
  });
  it("楓幣漲價（100 元換得更少）→ dir up", () => {
    const quote = quoteOf(fxOf([day("2026-10-13", 3000, 3000)], latestOf("2026-10-14T04:00:00Z", 250)));
    expect(quote.yuan).toBe(4000);
    expect(quote.diffYuan).toBe(1000);
    expect(quote.dir).toBe("up");
  });
  it("prevWord：前一天是昨天就說「昨天」，不然寫日期；沒有前一天回 null", () => {
    const yesterday = quoteOf(fxOf([day("2026-10-13", 3000, 3000)], latest));
    expect(prevWord(yesterday, latest)).toBe("昨天");
    const older = quoteOf(fxOf([day("2026-10-11", 3000, 3000)], latest));
    expect(prevWord(older, latest)).toBe("10/11");
    const none = quoteOf(fxOf([day("2026-10-14", 3000, 3000)], latest));
    expect(prevWord(none, latest)).toBeNull();
  });
});

describe("freshnessOf", () => {
  const t = "2026-10-14T04:00:00Z";
  const latest = latestOf(t, 300);
  const at = (minutes: number) => Date.parse(t) + minutes * 60_000;
  it("剛剛、30 分鐘、5 小時：沒過期", () => {
    expect(freshnessOf(latest, at(0))).toMatchObject({ text: "最後更新 剛剛", stale: false });
    expect(freshnessOf(latest, at(30))).toMatchObject({ text: "最後更新 30 分鐘前", stale: false, hours: 0 });
    expect(freshnessOf(latest, at(5 * 60))).toMatchObject({ text: "最後更新 5 小時前", stale: false, hours: 5 });
  });
  it("11 小時 59 分還沒過期；12 小時起過期", () => {
    expect(freshnessOf(latest, at(11 * 60 + 59)).stale).toBe(false);
    expect(freshnessOf(latest, at(12 * 60)).stale).toBe(true);
  });
  it("13 小時：過期，寫最後一筆的台北時間", () => {
    expect(freshnessOf(latest, at(13 * 60))).toEqual({ text: "已經 13 小時沒更新（最後一筆 10/14 12:00）", stale: true, hours: 13, at: "10/14 12:00" });
  });
  it("50 小時改寫天數", () => {
    expect(freshnessOf(latest, at(50 * 60)).text).toBe("已經 2 天沒更新（最後一筆 10/14 12:00）");
  });
  it("時鐘比資料早（now < t）不出現負數", () => {
    expect(freshnessOf(latest, at(-10)).text).toBe("最後更新 剛剛");
  });
});

describe("掛單檔位", () => {
  // ask100 305 → 市價落在 300～309 這一桶
  const latest = latestOf("2026-10-14T04:00:00Z", 305, [[310, 2], [300, 3], [290, 5], [180, 7]]);
  it("ladderRows：由便宜（換得多）到貴排，市價那一桶標 market，換算的元數是桶的兩端與中間", () => {
    const rows = ladderRows(latest);
    expect(rows.map(r => r.lo)).toEqual([310, 300, 290, 180]);
    expect(rows.map(r => r.market)).toEqual([false, true, false, false]);
    const market = rows[1];
    expect(market.count).toBe(3);
    expect(market.yuanHi).toBeCloseTo(1_000_000 / 300, 9);
    expect(market.yuanLo).toBeCloseTo(1_000_000 / 310, 9);
    expect(market.yuanMid).toBeCloseTo(1_000_000 / 305, 9);
  });
  it("includeEmpty：中間沒掛單的價位也列出來，筆數 0", () => {
    const rows = ladderRows(latestOf("2026-10-14T04:00:00Z", 305, [[310, 1], [290, 2]]), true);
    expect(rows.map(r => [r.lo, r.count])).toEqual([[310, 1], [300, 0], [290, 2]]);
  });
  it("沒有掛單資料：空陣列", () => {
    expect(ladderRows(latestOf("2026-10-14T04:00:00Z", 305))).toEqual([]);
    expect(ladderRows(latestOf("2026-10-14T04:00:00Z", 305), true)).toEqual([]);
  });
  it("ladderTotal 加總", () => {
    expect(ladderTotal(latest)).toBe(17);
  });
  it("ladderHead：留前 keep 格，其餘（換不到那麼多的、更貴的）併成一列，筆數加總", () => {
    const { head, rest } = ladderHead(latest, 2);
    expect(head.map(r => r.lo)).toEqual([310, 300]);
    expect(rest).toEqual({ count: 12, loMin: 180, loMax: 299 }); // 5 + 7；loMax = 290 + 9
    expect(head.reduce((s, r) => s + r.count, 0) + rest!.count).toBe(ladderTotal(latest));
  });
  it("ladderHead：檔位不超過 keep 就沒有合併列", () => {
    expect(ladderHead(latest, 4).rest).toBeNull();
  });
});

describe("圖的座標", () => {
  it("niceTicks：1、2、2.5、5 的倍數", () => {
    expect(niceTicks(0, 100, 4)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(3300, 3400, 4)).toEqual([3300, 3325, 3350, 3375, 3400]);
    expect(niceTicks(0, 10, 4)).toEqual([0, 2.5, 5, 7.5, 10]);
  });
  it("niceTicks：刻度都落在範圍內，且至少兩個", () => {
    for (const [min, max] of [[3187.4, 3452.9], [0.3, 0.9], [100, 100.5]] as const) {
      const ticks = niceTicks(min, max);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(Math.min(...ticks)).toBeGreaterThanOrEqual(min);
      expect(Math.max(...ticks)).toBeLessThanOrEqual(max);
    }
  });
  it("priceDomain：包得住所有高低點與均線，上下各留 12% 的高度", () => {
    const days = [day("2026-10-13", 3300, 3400), day("2026-10-14", 3350, 3320)]; // high 3400, low 3300
    const [lo, hi] = priceDomain(days, [[3250, null], [null, 3420]]); // 範圍 3250～3420，寬 170，pad 20.4
    expect(lo).toBeCloseTo(3229.6, 9);
    expect(hi).toBeCloseTo(3440.4, 9);
    expect(lo).toBeLessThan(3250);
    expect(hi).toBeGreaterThan(3420);
  });
  it("priceDomain：只有一個價（高低一樣）也有高度", () => {
    const [lo, hi] = priceDomain([day("2026-10-14", 3000, 3000)], []);
    expect(lo).toBeLessThan(3000);
    expect(hi).toBeGreaterThan(3000);
  });
});

describe("其他小工具", () => {
  it("pinIndex：找得到回索引；沒給或沒這天回 null", () => {
    expect(pinIndex(SEVEN, "2026-10-12")).toBe(2);
    expect(pinIndex(SEVEN, null)).toBeNull();
    expect(pinIndex(SEVEN, "2026-09-01")).toBeNull();
  });
  it("listingDays：只留有記到掛單數的日子，並帶原本的索引", () => {
    const days = [day("2026-10-12", 1, 1, { listings: 40 }), day("2026-10-13", 1, 1), day("2026-10-14", 1, 1, { listings: 0 })];
    expect(listingDays(days).map(({ day: d, index }) => [d.date, index])).toEqual([["2026-10-12", 0], ["2026-10-14", 2]]);
  });
  it("sourceText", () => {
    expect(sourceText("ref")).toBe("8591 開價（參考站整理）");
    expect(sourceText("8591")).toBe("8591 開價");
  });
});
