import { test } from "node:test";
import assert from "node:assert/strict";
import { findOpening, isOpeningTitle, monthDay, released } from "./opening.mjs";

// 官方公告列表的真實標題（2026-07～10）
const rows = [
  { bullentinId: "83849", startDate: "2026/10/02", title: "新楓之谷：經典版－《V002覺醒的力量》10/15 強勢登場" },
  { bullentinId: "83836", startDate: "2026/10/01", title: "新楓之谷：經典版 《1001(四)V001初心啟航 例行維護開機公告》" },
  { bullentinId: "83831", startDate: "2026/09/30", title: "新楓之谷：經典版《0930(三)初心啟航例行維護關機公告》" },
  { bullentinId: "82337", startDate: "2026/08/06", title: "新楓之谷：經典版 《0806(四)V001 初心啟航 例行維護開機公告》(18:41 更新)" },
  { bullentinId: "82332", startDate: "2026/08/06", title: "新楓之谷：經典版 《0806(四)延後開機公告》" },
  { bullentinId: "82235", startDate: "2026/07/29", title: "新楓之谷：經典版 《0729(三)V001 初心啟航 開機公告》" },
];

test("開機公告才算：關機、延後開機、改版預告都不算", () => {
  assert.equal(isOpeningTitle(rows[1].title), true);
  assert.equal(isOpeningTitle(rows[5].title), true);
  assert.equal(isOpeningTitle(rows[2].title), false);
  assert.equal(isOpeningTitle(rows[4].title), false);
  assert.equal(isOpeningTitle(rows[0].title), false);
});

test("找那一天的開機公告：標題寫著那天、那天以後發的", () => {
  assert.equal(monthDay("2026/10/15"), "1015");
  assert.equal(findOpening(rows, "2026/10/01")?.bullentinId, "83836");
  assert.equal(findOpening(rows, "2026/08/06")?.bullentinId, "82337");
  assert.equal(findOpening(rows, "2026/10/15"), null);
});

test("正式機已經是這一版就不用再上", () => {
  assert.equal(released({ release: { levelCap: 120 } }, 120), true);
  assert.equal(released({ release: { levelCap: 100 } }, 120), false);
  assert.equal(released(null, 120), false);
});
