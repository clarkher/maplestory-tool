import test from "node:test";
import assert from "node:assert/strict";
import { dailyBars, mergeStreams, perYi, taipeiDate, taipeiIso } from "./daily.mjs";

const own = (t, ask100, extra = {}) => ({ t, src: "8591", ask100, listings: 100, volNtd: 0, volMeso: 0, ...extra });

test("台灣時間：ISO 字串帶 +08:00；跨午夜算隔天", () => {
  assert.equal(taipeiIso(new Date("2026-10-13T08:17:05.123Z")), "2026-10-13T16:17:05+08:00");
  assert.equal(taipeiDate("2026-10-13T16:30:00Z"), "2026-10-14");
  assert.equal(taipeiDate("2026-10-13T23:59:00+08:00"), "2026-10-13");
});

test("1 億楓幣幾元＝1,000,000 ÷ 每 100 元換幾萬", () => {
  assert.equal(perYi(300), 3333.3);
  assert.equal(perYi(357.14), 2800);
});

test("合併：自己抓的全收；參考站只補前後 3 小時內沒有自己資料的空檔", () => {
  const merged = mergeStreams(
    [own("2026-10-13T08:17:00+08:00", 300), own("2026-10-13T12:17:00+08:00", 310)],
    [
      { t: "2026-10-13T02:40:00+08:00", ask100: 290 },
      { t: "2026-10-13T10:40:00+08:00", ask100: 305 },
      { t: "2026-10-13T16:40:00+08:00", ask100: 320 },
    ],
  );
  assert.deepEqual(merged.map(s => [s.t.slice(11, 16), s.src]), [["02:40", "ref"], ["08:17", "8591"], ["12:17", "8591"], ["16:40", "ref"]]);
});

test("每日：單位換成元／億後才取開高低收（匯率越高楓幣越便宜，最高最低要倒過來）", () => {
  const [day] = dailyBars(mergeStreams([own("2026-10-13T08:00:00+08:00", 300), own("2026-10-13T12:00:00+08:00", 250), own("2026-10-13T20:00:00+08:00", 320)], []));
  assert.equal(day.date, "2026-10-13");
  assert.equal(day.open, 3333.3);
  assert.equal(day.high, 4000);
  assert.equal(day.low, 3125);
  assert.equal(day.close, 3125);
  assert.equal(day.closeMesoPerNtd, 3.2);
  assert.equal(day.samples, 3);
  assert.equal(day.source, "8591");
});

test("每日：掛單數取當天最後一次自己抓的；成交加總、成交均價＝成交額 ÷ 成交楓幣（億）", () => {
  const [day] = dailyBars(mergeStreams([
    own("2026-10-13T08:00:00+08:00", 300, { listings: 110, volNtd: 0, volMeso: 0 }),
    own("2026-10-13T12:00:00+08:00", 300, { listings: 105, volNtd: 1000, volMeso: 3000 }),
    own("2026-10-13T16:00:00+08:00", 300, { listings: 98, volNtd: 500, volMeso: 1500 }),
  ], []));
  assert.equal(day.listings, 98);
  assert.equal(day.volNtd, 1500);
  assert.equal(day.volMeso, 4500);
  assert.equal(day.vwap, 3333.3);
});

test("每日：整天都是參考站 → 沒有掛單數、成交（null，不是 0），來源 ref；混著是 mixed；沒成交時成交均價 null", () => {
  const days = dailyBars(mergeStreams(
    [own("2026-10-13T20:00:00+08:00", 300)],
    [{ t: "2026-10-12T20:40:00+08:00", ask100: 330 }, { t: "2026-10-13T08:40:00+08:00", ask100: 320 }],
  ));
  assert.deepEqual(days.map(d => [d.date, d.source, d.listings, d.volNtd, d.vwap]), [
    ["2026-10-12", "ref", null, null, null],
    ["2026-10-13", "mixed", 100, 0, null],
  ]);
});
