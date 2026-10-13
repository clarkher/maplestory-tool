import test from "node:test";
import assert from "node:assert/strict";
import { ladder, marketAsk, median, summarize, trimOutliers } from "./market.mjs";

const listing = (id, title, priceNtd = 100) => ({ id: String(id), title, priceNtd, stock: 999, sold: 0 });
const rated = rates => rates.map((rate, i) => ({ ...listing(i, ""), rate }));

test("中位數：奇數取中間、偶數取中間兩個平均", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test("跟參考站同一套：10/13 14:40 雪吉拉 82 筆的分布算出來是 300（參考站寫 300）、一筆都不剔", () => {
  // 參考站 price.json 的 servers.雪吉拉.dist：[匯率, 筆數]
  const dist = [[10,3],[20,1],[22,1],[23,1],[24,1],[26.5,2],[35,2],[40,1],[50,1],[60,1],[61.5,1],[65,1],[67,1],[70,1],[74,1],[77,1],[78,1],[94,1],[95,1],[100,5],[102.5,1],[104,1],[110,1],[115,2],[120,3],[140,1],[150.5,1],[160,1],[170,1],[177,2],[190,1],[200,2],[235,1],[244,1],[250,6],[260,2],[270,5],[280,1],[290,3],[300,10],[300.5,1],[320,2],[350,3],[351,1],[357,1]];
  const rates = dist.flatMap(([rate, count]) => Array(count).fill(rate));
  assert.equal(rates.length, 82);
  assert.equal(trimOutliers(rated(rates)).length, 82);
  assert.equal(marketAsk(rates), 300);
});

test("離譜的報價（100元=280萬萬）被 MAD 剔掉", () => {
  const kept = trimOutliers(rated([250, 260, 270, 280, 300, 300, 320, 2800000]));
  assert.deepEqual(kept.map(r => r.rate), [250, 260, 270, 280, 300, 300, 320]);
});

test("剔完剩不到 3 筆就整批還原", () => {
  assert.equal(trimOutliers(rated([1, 1000, 100000])).length, 3);
});

test("市價＝匯率由高到低前四分之一（無條件進位）的中位數；不到 4 筆不給值", () => {
  assert.equal(marketAsk([357, 350, 300, 300, 270, 270, 270, 250, 250, 250, 200, 100]), 350);
  assert.equal(marketAsk([300, 300, 300]), null);
});

test("價位分布：每 10 萬一桶，由低到高", () => {
  assert.deepEqual(ladder([250, 255, 300, 300.5, 357.14, 10]), [[10, 1], [250, 2], [300, 2], [350, 1]]);
});

test("summarize：排除代練、代肝、讀不到匯率、低於 10 的；算市價、市價區上下界", () => {
  const listings = [
    listing(1, "【100元=300萬楓幣】300萬楓幣=100元"),
    listing(2, "【100元=300萬楓幣】300萬楓幣=100元"),
    listing(3, "【100元=350萬楓幣】35萬楓幣=10元", 10),
    listing(4, "【100元=270萬楓幣】270萬楓幣=100元"),
    listing(5, "【100元=250萬楓幣】250萬楓幣=100元"),
    listing(6, "【100元=1萬楓幣】1萬楓幣=100元"),
    listing(7, "【100元=300萬楓幣】雪吉拉代練 1小時90"),
    listing(8, "【100元=300萬楓幣】代肝"),
    listing(9, "雪吉拉楓幣 私訊"),
  ];
  const result = summarize(listings);
  assert.deepEqual(result.kept.map(l => l.id), ["1", "2", "3", "4", "5"]);
  assert.equal(result.ask100, 325); // 5 筆取前 2 筆（350、300）的中位數
  assert.deepEqual(result.band, [300, 350]);
  assert.deepEqual(result.ladder, [[250, 1], [270, 1], [300, 2], [350, 1]]);
});

test("summarize：一筆都沒有時不爆、市價 null", () => {
  assert.deepEqual(summarize([]), { ask100: null, kept: [], ladder: [], band: null });
});
