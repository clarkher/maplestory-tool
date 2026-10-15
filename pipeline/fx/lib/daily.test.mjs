import test from "node:test";
import assert from "node:assert/strict";
import { dailyBars, perYi, taipeiDate, taipeiIso } from "./daily.mjs";

const row = (t, ask100, listings) => (listings === undefined ? { t, ask100 } : { t, ask100, listings });

test("台灣時間：ISO 字串帶 +08:00；跨午夜算隔天", () => {
  assert.equal(taipeiIso(new Date("2026-10-13T08:17:05.123Z")), "2026-10-13T16:17:05+08:00");
  assert.equal(taipeiDate("2026-10-13T16:30:00Z"), "2026-10-14");
  assert.equal(taipeiDate("2026-10-13T23:59:00+08:00"), "2026-10-13");
});

test("1 億楓幣幾元＝1,000,000 ÷ 每 100 元換幾萬", () => {
  assert.equal(perYi(300), 3333.3);
  assert.equal(perYi(357.14), 2800);
});

test("每日：單位換成元／億後才取開高低收（匯率越高楓幣越便宜，最高最低要倒過來）", () => {
  const [day] = dailyBars([row("2026-10-13T08:00:00+08:00", 300), row("2026-10-13T12:00:00+08:00", 250), row("2026-10-13T20:00:00+08:00", 320)]);
  assert.deepEqual(day, { date: "2026-10-13", open: 3333.3, high: 4000, low: 3125, close: 3125, closeMesoPerNtd: 3.2, listings: null, samples: 3, source: "ref" });
});

test("每日：輸入沒照時間排也行；跨午夜分兩天；掛單數取當天最後一筆有記的", () => {
  const days = dailyBars([
    row("2026-10-14T00:41:00+08:00", 300, 88),
    row("2026-10-13T22:41:00+08:00", 310, 90),
    row("2026-10-13T20:41:00+08:00", 320, 95),
    row("2026-10-14T02:41:00+08:00", 300),
  ]);
  assert.deepEqual(days.map(d => [d.date, d.open, d.close, d.listings, d.samples]), [
    ["2026-10-13", 3125, 3225.8, 90, 2],
    ["2026-10-14", 3333.3, 3333.3, 88, 2],
  ]);
});

test("每日：市價壞掉（0、字串）或時間壞掉的列跳過，不讓整天變成 NaN", () => {
  const [day] = dailyBars([row("2026-10-13T08:00:00+08:00", 0), row("2026-10-13T10:00:00+08:00", "300"), row("壞掉", 300), row("2026-10-13T12:00:00+08:00", 300)]);
  assert.equal(day.samples, 1);
  assert.equal(day.close, 3333.3);
});

test("每日：沒有資料就是空陣列", () => {
  assert.deepEqual(dailyBars([]), []);
});

test("每日 source：沒有手動的天是 ref、全是手動的天是 manual、混著的天是 mixed；手動的列照樣算進開高低收", () => {
  const manual = (t, ask100) => ({ t, ask100, src: "manual" });
  const days = dailyBars([
    row("2026-10-12T08:00:00+08:00", 300),
    row("2026-10-12T10:00:00+08:00", 310),
    manual("2026-10-13T08:00:00+08:00", 280),
    manual("2026-10-13T10:00:00+08:00", 290),
    row("2026-10-14T08:00:00+08:00", 300, 80),
    manual("2026-10-14T10:00:00+08:00", 250),
  ]);
  assert.deepEqual(days.map(d => [d.date, d.source, d.samples]), [["2026-10-12", "ref", 2], ["2026-10-13", "manual", 2], ["2026-10-14", "mixed", 2]]);
  assert.equal(days[2].close, 4000);
  assert.equal(days[2].listings, 80);
});
