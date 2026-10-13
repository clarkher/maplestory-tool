import test from "node:test";
import assert from "node:assert/strict";
import { fxFor, shiftDate, toNtd, fetchFx, FX_URL } from "./fx.mjs";

const days = [{ date: "2026-10-10", close: 3300 }, { date: "2026-10-12", close: 3333 }];

test("shiftDate 跨月", () => {
  assert.equal(shiftDate("2026-10-01", -1), "2026-09-30");
});

test("那天有就用那天", () => {
  assert.deepEqual(fxFor("2026-10-12", days), { close: 3333, date: "2026-10-12", exact: true });
});

test("那天沒抓到就往前找，最多 3 天，標出用的是哪天", () => {
  assert.deepEqual(fxFor("2026-10-13", days), { close: 3333, date: "2026-10-12", exact: false });
  assert.deepEqual(fxFor("2026-10-11", days), { close: 3300, date: "2026-10-10", exact: false });
  assert.equal(fxFor("2026-10-16", days), null);
  assert.equal(fxFor("2026-10-12", null), null);
});

test("3 天邊界（2026-10-15 往前 3 天到 2026-10-12）", () => {
  assert.deepEqual(fxFor("2026-10-15", [{date: "2026-10-12", close: 3333}]), { close: 3333, date: "2026-10-12", exact: false });
});

test("匯率 0 或非數字當沒抓到，繼續往前", () => {
  const daysWithZero = [{date: "2026-10-13", close: 0}, {date: "2026-10-12", close: 3333}];
  assert.deepEqual(fxFor("2026-10-13", daysWithZero), { close: 3333, date: "2026-10-12", exact: false });
});

test("楓幣 × close ÷ 1 億＝台幣", () => {
  assert.equal(toNtd(300_000_000, 3333), 9999);
});

test("fetchFx：檔案還沒有（404）或網路壞掉回 null，正常回 JSON", async () => {
  assert.equal(await fetchFx(async () => ({ ok: false })), null);
  assert.equal(await fetchFx(async () => { throw new Error("offline"); }), null);
  const j = await fetchFx(async url => ({ ok: true, json: async () => ({ updatedAt: "x", days, url }) }));
  assert.equal(j.days.length, 2);
  assert.equal(j.url, FX_URL);
});
