import assert from "node:assert/strict";
import { test } from "node:test";
import { CLASSIC_JOB_IDS, isClassicJob } from "./classic-jobs.mjs";

test("初心者（0）算經典版職業", () => {
  assert.equal(isClassicJob(0), true);
});

test("十字軍（111，劍士三轉）算經典版職業", () => {
  assert.equal(isClassicJob(111), true);
});

test("影武者中忍指南（431）不是經典版職業", () => {
  assert.equal(isClassicJob(431), false);
});

test("皇家騎士團聖魂劍士嚮導（1100）不是經典版職業", () => {
  assert.equal(isClassicJob(1100), false);
});

test("狂狼勇士、龍魔導士的零轉代碼（2000、2001）不是經典版職業", () => {
  assert.equal(isClassicJob(2000), false);
  assert.equal(isClassicJob(2001), false);
});

test("剛好 30 筆：初心者 1 個 + 冒險家 29 個職業", () => {
  assert.equal(CLASSIC_JOB_IDS.size, 30);
});
