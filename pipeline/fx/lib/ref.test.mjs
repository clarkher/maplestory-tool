import test from "node:test";
import assert from "node:assert/strict";
import { refHistory, refSnapshot } from "./ref.mjs";

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
