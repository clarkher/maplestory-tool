import test from "node:test";
import assert from "node:assert/strict";
import { median, attrKey, summarize, series, prevMedianFor } from "./stats.mjs";

const r = (o) => ({ item: "日之鏢", price: o.u * (o.qty ?? 1), unitPrice: o.u, qty: o.qty ?? 1, tradedAt: o.t, attrs: o.attrs ?? null,
  flags: [], status: o.status ?? "ok", recordedAt: `${o.rec}T21:00:00+08:00`, ...o.extra });

test("median 奇偶數", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});

test("attrKey 照名稱排序", () => {
  assert.equal(attrKey({ "敏捷": 1, "魔法攻擊力": 48 }), "敏捷+1、魔法攻擊力+48");
  assert.equal(attrKey(null), "");
});

test("summarize：用最近一天記的算中間價，跟前一次記的比漲跌；黃色（review）不算", () => {
  const recs = [
    r({ u: 100, t: "2026-10-11", rec: "2026-10-12" }), r({ u: 120, t: "2026-10-11", rec: "2026-10-12" }),
    r({ u: 130, t: "2026-10-12", rec: "2026-10-13" }), r({ u: 140, t: "2026-10-13", rec: "2026-10-13" }),
    r({ u: 999999, t: "2026-10-13", rec: "2026-10-13", status: "review" }),
  ];
  const s = summarize(recs, "日之鏢", [{ date: "2026-10-13", close: 3333 }]);
  assert.equal(s.count, 2);
  assert.equal(s.median, 135);
  assert.equal(s.changePct, 22.7); // (135-110)/110
  assert.equal(s.lastTradedAt, "2026-10-13");
  assert.equal(s.few, true);
  assert.equal(s.fxDate, "2026-10-13");
  assert.equal(s.ntd, 0); // 135 楓幣 × 3333 ÷ 1 億 ≈ 0.0045 → 四捨五入到小數 1 位
});

test("summarize：沒資料、沒匯率", () => {
  assert.deepEqual(summarize([], "日之鏢", null), { item: "日之鏢", count: 0 });
  assert.equal(summarize([r({ u: 100, t: "2026-10-12", rec: "2026-10-13" })], "日之鏢", null).ntd, null);
});

test("summarize：黃色雨傘照屬性分組", () => {
  const umb = (u, m) => ({ ...r({ u, t: "2026-10-12", rec: "2026-10-13", attrs: { "魔法攻擊力": m } }), item: "黃色雨傘" });
  const s = summarize([umb(100, 48), umb(300, 50), umb(120, 48)], "黃色雨傘", null);
  assert.deepEqual(s.groups, [{ key: "魔法攻擊力+48", median: 110, count: 2, changePct: null }, { key: "魔法攻擊力+50", median: 300, count: 1, changePct: null }]);
});

test("series：照交易日期一天一點；可以只看某個屬性", () => {
  const recs = [r({ u: 100, t: "2026-10-10", rec: "2026-10-13" }), r({ u: 200, t: "2026-10-10", rec: "2026-10-13" }), r({ u: 300, t: "2026-10-12", rec: "2026-10-13" })];
  assert.deepEqual(series(recs, "日之鏢"), [{ date: "2026-10-10", median: 150, count: 2 }, { date: "2026-10-12", median: 300, count: 1 }]);
  assert.deepEqual(series(recs, "日之鏢", "魔法攻擊力+48"), []);
});

test("summarize：真實價位下的台幣換算、fxExact、缺日往前", () => {
  const recs = [
    r({ u: 134_000_000, t: "2026-10-13", rec: "2026-10-13" }),
    r({ u: 136_000_000, t: "2026-10-13", rec: "2026-10-13" }),
  ];
  const s = summarize(recs, "日之鏢", [{ date: "2026-10-13", close: 3333 }]);
  assert.equal(s.count, 2);
  assert.equal(s.median, 135_000_000);
  assert.equal(s.ntd, 4499.6); // 135_000_000 * 3333 / 1e8 = 4499.55 → 4499.6
  assert.equal(s.fxExact, true);
  assert.equal(s.fxDate, "2026-10-13");
});

test("summarize：lastTradedAt 往前找匯率，fxExact false", () => {
  const recs = [
    r({ u: 134_000_000, t: "2026-10-14", rec: "2026-10-13" }),
    r({ u: 136_000_000, t: "2026-10-14", rec: "2026-10-13" }),
  ];
  const s = summarize(recs, "日之鏢", [{ date: "2026-10-12", close: 3333 }]);
  assert.equal(s.median, 135_000_000);
  assert.equal(s.lastTradedAt, "2026-10-14");
  assert.equal(s.ntd, 4499.6); // 135_000_000 * 3333 / 1e8 with 10-12 close
  assert.equal(s.fxExact, false);
  assert.equal(s.fxDate, "2026-10-12");
});

// ---- 黃色雨傘：漲跌跟「上次中間價」都要在同一個屬性裡比 ----
const umb = (u, m, t, rec, extra = {}) => ({ ...r({ u, t, rec, attrs: m == null ? null : { "魔法攻擊力": m }, extra }), item: "黃色雨傘" });

test("summarize：黃色雨傘每個屬性自己比上次（用那個屬性自己的前一次記錄），頂層 changePct 是 null", () => {
  const recs = [
    umb(100, 1, "2026-10-09", "2026-10-09"), umb(5, 5, "2026-10-11", "2026-10-11"),
    umb(150, 1, "2026-10-12", "2026-10-13"), umb(40, 5, "2026-10-12", "2026-10-13"),
    umb(9000, 9, "2026-10-12", "2026-10-13"),
  ];
  const s = summarize(recs, "黃色雨傘", null);
  assert.equal(s.changePct, null, "裝備頂層不給漲跌：不同屬性混在一起比沒意義（+1 的 5 變 +5 的 40 會算成漲 700%）");
  assert.deepEqual(s.groups, [
    { key: "魔法攻擊力+1", median: 150, count: 1, changePct: 50 },    // 10/09 的 100 → 10/13 的 150
    { key: "魔法攻擊力+5", median: 40, count: 1, changePct: 700 },    // 10/11 的 5 → 10/13 的 40（它自己的前一次）
    { key: "魔法攻擊力+9", median: 9000, count: 1, changePct: null }, // 只有這一次
  ]);
});

test("summarize：非裝備的 changePct 照舊（最近一天跟前一次比）", () => {
  const recs = [r({ u: 100, t: "2026-10-11", rec: "2026-10-12" }), r({ u: 150, t: "2026-10-12", rec: "2026-10-13" })];
  assert.equal(summarize(recs, "日之鏢", null).changePct, 50);
  assert.equal(summarize(recs, "日之鏢", null).groups, null);
});

test("prevMedianFor：裝備只拿同屬性、最近一天記的中間價；沒有同屬性就是 null；黃色的不算", () => {
  const recs = [
    umb(100, 1, "2026-10-09", "2026-10-09"),
    umb(200, 1, "2026-10-12", "2026-10-13"), umb(400, 1, "2026-10-12", "2026-10-13"),
    umb(900, 5, "2026-10-12", "2026-10-13"),
    { ...umb(777777, 1, "2026-10-12", "2026-10-13"), status: "review" },
    umb(50, null, "2026-10-12", "2026-10-13"),
  ];
  assert.equal(prevMedianFor(recs, "黃色雨傘", { "魔法攻擊力": 1 }), 300, "只有 +1 最近一天的 200、400");
  assert.equal(prevMedianFor(recs, "黃色雨傘", { "魔法攻擊力": 5 }), 900);
  assert.equal(prevMedianFor(recs, "黃色雨傘", { "魔法攻擊力": 7 }), null, "沒有這個屬性的紀錄");
  assert.equal(prevMedianFor(recs, "黃色雨傘", null), 50, "沒屬性的自己一組");
  assert.equal(prevMedianFor([], "黃色雨傘", { "魔法攻擊力": 1 }), null);
});

test("prevMedianFor：非裝備就是 summarize 的中間價，屬性不影響", () => {
  const recs = [r({ u: 100, t: "2026-10-11", rec: "2026-10-12" }), r({ u: 300, t: "2026-10-12", rec: "2026-10-13" }), r({ u: 500, t: "2026-10-12", rec: "2026-10-13" })];
  assert.equal(prevMedianFor(recs, "日之鏢", null), summarize(recs, "日之鏢", null).median);
  assert.equal(prevMedianFor(recs, "日之鏢", null), 400);
  assert.equal(prevMedianFor(recs, "日之鏢", { "魔法攻擊力": 3 }), 400);
  assert.equal(prevMedianFor(recs, "雷之鏢", null), null, "這件沒資料");
});
