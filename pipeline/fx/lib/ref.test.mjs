import test from "node:test";
import assert from "node:assert/strict";
import { USER_AGENT, newRows, refHistory, refSnapshot } from "./ref.mjs";

// 參考站 price.json 的格式（10/13 實測），只留用得到的欄位
const json = {
  t: "2026-10-13T14:40:59+08:00",
  servers: {
    雪吉拉: { ask: 300, median: 177, n: 82, dist: [[10, 3], [250, 6], [257.5, 1], [300, 10], [357, 1]] },
    菇菇寶貝: { ask: 310, n: 54, dist: [] },
  },
  history: [
    { t: "2026-10-13T12:40:00+08:00", m: 3, 雪吉拉_ask: 300, 菇菇寶貝_ask: 320 },
    { t: "2026-10-08T12:41:16+08:00", m: 3, 雪吉拉_ask: 330 },
    { t: "2026-08-20T10:00:00+08:00", m: 2, 雪吉拉: 150 },
    { t: "2026-10-09T08:00:00+08:00", m: 3, 雪吉拉_ask: null },
    { t: "壞掉的時間", m: 3, 雪吉拉_ask: 300 },
  ],
};

test("User-Agent 老實寫是誰、附 repo 網址，全是 ASCII（header 不能放中文）", () => {
  assert.equal(USER_AGENT, "MapleBook-fx/1.0 (+https://github.com/clarkher/maplestory-tool; meso rate)");
  assert.match(USER_AGENT, /^[\x20-\x7e]+$/);
});

test("當下市價、筆數、價位分布（每 10 萬一桶）", () => {
  assert.deepEqual(refSnapshot(json), {
    t: "2026-10-13T14:40:59+08:00",
    ask100: 300,
    listings: 82,
    ladder: [[10, 3], [250, 7], [300, 10], [350, 1]],
  });
});

test("格式不對（沒有這個伺服器、市價不是正數、沒有時間）回 null", () => {
  assert.equal(refSnapshot({ ...json, servers: {} }), null);
  assert.equal(refSnapshot({ ...json, servers: { 雪吉拉: { ask: 0 } } }), null);
  assert.equal(refSnapshot({ ...json, t: undefined }), null);
  assert.equal(refSnapshot(null), null);
});

test("歷史：只收市價口徑（m=3）、數字正常、時間正常的，由舊到新", () => {
  assert.deepEqual(refHistory(json), [
    { t: "2026-10-08T12:41:16+08:00", ask100: 330 },
    { t: "2026-10-13T12:40:00+08:00", ask100: 300 },
  ]);
  assert.deepEqual(refHistory({}), []);
});

// 10/14 實測：當下的 t 跟 history 最後一筆的 t 是同一個字串
const live = {
  t: "2026-10-14T06:41:16+08:00",
  servers: { 雪吉拉: { ask: 300, n: 90, dist: [] } },
  history: [
    { t: "2026-10-14T02:41:00+08:00", m: 3, 雪吉拉_ask: 310 },
    { t: "2026-10-14T04:41:00+08:00", m: 3, 雪吉拉_ask: 305 },
    { t: "2026-10-14T06:41:16+08:00", m: 3, 雪吉拉_ask: 300 },
  ],
};

test("newRows：只接比檔案最後一筆新的；跟當下市價同一刻的那筆補上掛單數", () => {
  assert.deepEqual(newRows(live, Date.parse("2026-10-14T02:41:00+08:00")), [
    { t: "2026-10-14T04:41:00+08:00", ask100: 305 },
    { t: "2026-10-14T06:41:16+08:00", ask100: 300, listings: 90 },
  ]);
  assert.equal(newRows(live, -Infinity).length, 3);
  assert.deepEqual(newRows(live, Date.parse("2026-10-14T06:41:16+08:00")), []);
  assert.deepEqual(newRows({}, -Infinity), []);
});