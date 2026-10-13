import test from "node:test";
import assert from "node:assert/strict";
import { loadReviewPatch } from "../test-helpers.mjs";

const reviewPatch = loadReviewPatch();
const f = (k, value, orig) => ({ k, value, orig });

test("只送改過的欄位：沒動的不送（不然改了總價，舊的單價會跟著送出去而對不上）", () => {
  assert.deepEqual(reviewPatch([f("price", "90", "99"), f("unitPrice", "99", "99"), f("qty", "1", "1"), f("tradedAt", "2026-10-12", "2026-10-12")]), { price: 90 });
});

test("數字：逗號、前後空白、寫法不同但數字一樣都算沒改；真的不同才送，而且是數字", () => {
  assert.deepEqual(reviewPatch([f("price", "1,320,000", "1320000"), f("qty", " 1 ", "1")]), {});
  assert.deepEqual(reviewPatch([f("price", "1,300,000", "1320000"), f("unitPrice", "650000", "")]), { price: 1300000, unitPrice: 650000 });
});

test("日期當字串比；改了才送，前後空白拿掉", () => {
  assert.deepEqual(reviewPatch([f("tradedAt", "2026-10-11", "2026-10-12")]), { tradedAt: "2026-10-11" });
  assert.deepEqual(reviewPatch([f("tradedAt", " 2026-10-12 ", "2026-10-12")]), {});
});

test("清空的欄位不送；原本空著、現在填了的要送；亂填的照送（讓本機程式擋、頁面才有得說明）", () => {
  assert.deepEqual(reviewPatch([f("price", "", "99"), f("unitPrice", "", "")]), {});
  assert.deepEqual(reviewPatch([f("unitPrice", "70", "")]), { unitPrice: 70 });
  assert.equal(Number.isNaN(reviewPatch([f("price", "很貴", "99")]).price), true);
});

test("什麼都沒改就是空的", () => {
  assert.deepEqual(reviewPatch([]), {});
  assert.deepEqual(reviewPatch([f("price", "99", "99")]), {});
});
