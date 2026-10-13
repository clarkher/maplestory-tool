import test from "node:test";
import assert from "node:assert/strict";
import { median, attrKey, summarize, series } from "./stats.mjs";

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
  assert.deepEqual(s.groups, [{ key: "魔法攻擊力+48", median: 110, count: 2 }, { key: "魔法攻擊力+50", median: 300, count: 1 }]);
});

test("series：照交易日期一天一點；可以只看某個屬性", () => {
  const recs = [r({ u: 100, t: "2026-10-10", rec: "2026-10-13" }), r({ u: 200, t: "2026-10-10", rec: "2026-10-13" }), r({ u: 300, t: "2026-10-12", rec: "2026-10-13" })];
  assert.deepEqual(series(recs, "日之鏢"), [{ date: "2026-10-10", median: 150, count: 2 }, { date: "2026-10-12", median: 300, count: 1 }]);
  assert.deepEqual(series(recs, "日之鏢", "魔法攻擊力+48"), []);
});
