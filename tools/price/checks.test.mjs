import test from "node:test";
import assert from "node:assert/strict";
import { checkTrade } from "./checks.mjs";

const TODAY = "2026-10-13";
const base = { tradedAt: "2026-10-12", price: 1000, unitPrice: 1000, qty: 1, attrs: null, flags: [] };

test("正常的一筆沒有旗子", () => {
  assert.deepEqual(checkTrade(base, { today: TODAY, prevUnitMedian: 900 }), []);
});

test("單價×數量對不上", () => {
  assert.deepEqual(checkTrade({ ...base, price: 5000, unitPrice: 1000, qty: 4 }, { today: TODAY }), ["單價×數量跟總價對不上"]);
});

test("總價不是單價的整數倍（數量算不出來）", () => {
  assert.deepEqual(checkTrade({ ...base, price: 2500, unitPrice: 1000, qty: null }, { today: TODAY }), ["總價不是單價的整數倍"]);
});

test("日期在未來、比開服早", () => {
  assert.deepEqual(checkTrade({ ...base, tradedAt: "2026-10-14" }, { today: TODAY }), ["交易日期在未來"]);
  assert.deepEqual(checkTrade({ ...base, tradedAt: "2026-07-28" }, { today: TODAY }), ["交易日期比開服還早"]);
});

test("跟上次中間價差 5 倍以上（高或低都算）", () => {
  assert.deepEqual(checkTrade({ ...base, unitPrice: 6000, price: 6000 }, { today: TODAY, prevUnitMedian: 1000 }), ["跟上次中間價差 5 倍以上"]);
  assert.deepEqual(checkTrade({ ...base, unitPrice: 150, price: 150 }, { today: TODAY, prevUnitMedian: 1000 }), ["跟上次中間價差 5 倍以上"]);
  assert.deepEqual(checkTrade(base, { today: TODAY, prevUnitMedian: null }), []);
});

test("5 倍邊界條件（含等號）", () => {
  assert.deepEqual(checkTrade({ ...base, unitPrice: 5000, price: 5000 }, { today: TODAY, prevUnitMedian: 1000 }), ["跟上次中間價差 5 倍以上"]);
  assert.deepEqual(checkTrade({ ...base, unitPrice: 200, price: 200 }, { today: TODAY, prevUnitMedian: 1000 }), ["跟上次中間價差 5 倍以上"]);
  assert.deepEqual(checkTrade({ ...base, unitPrice: 4999, price: 4999 }, { today: TODAY, prevUnitMedian: 1000 }), []);
});

test("保留解析時就有的旗子", () => {
  assert.deepEqual(checkTrade({ ...base, price: null, unitPrice: null, flags: ["這行讀到 3 個數字，分不出價格"] }, { today: TODAY }),
    ["這行讀到 3 個數字，分不出價格"]);
});
