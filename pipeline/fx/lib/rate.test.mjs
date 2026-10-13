import test from "node:test";
import assert from "node:assert/strict";
import { parseRate } from "./rate.mjs";

test("賣家寫的報價比括號精確，差不到 1 就用賣家的", () => {
  assert.equal(parseRate("【100元=300萬楓幣】3000萬楓幣=1000元⚡️極速"), 300);
  assert.equal(parseRate("【100元=350萬楓幣】35萬楓幣=10元🍁"), 350);
  assert.equal(parseRate("【100元=357萬楓幣】1000萬楓幣=280元雪吉拉"), 357.14);
  assert.equal(parseRate("【100元=61萬楓幣】65萬楓幣=106元本尊交易"), 61.32);
  assert.equal(parseRate("【100元=3萬楓幣】2.5萬楓幣=100元純手工"), 2.5);
  assert.equal(parseRate("【100元=2萬楓幣】1萬楓幣=55元"), 1.82);
});

test("億也算、台幣有逗號也算", () => {
  assert.equal(parseRate("【100元=300萬楓幣】1億楓幣=3,333元"), 300.03);
});

test("賣家報價跟括號差 1 以上（讀錯或寫錯）就用括號", () => {
  assert.equal(parseRate("【100元=270萬楓幣】300萬楓幣=100元 下單前詢問"), 270);
});

test("沒寫報價就用括號；沒有括號就不是幣價掛單", () => {
  assert.equal(parseRate("【100元=250萬楓幣】楓之谷雪吉拉現貨"), 250);
  assert.equal(parseRate("雪吉拉代練 長期單 1小時90"), null);
});
