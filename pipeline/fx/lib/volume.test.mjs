import test from "node:test";
import assert from "node:assert/strict";
import { soldSince, stateMap } from "./volume.mjs";

const item = (id, sold, priceNtd, rate) => ({ id, title: "", priceNtd, stock: 999, sold, rate });

test("stateMap 只記 id 與數字；沒有累計賣出的不記", () => {
  assert.deepEqual(stateMap([item("a", 10, 100, 300), item("b", null, 100, 300)]), { a: [10, 100, 300] });
});

test("同一筆累計賣出變多：賣出件數 × 台幣價＝成交額，再乘匯率換成楓幣（萬）", () => {
  const prev = { a: [10, 100, 300], b: [5, 1000, 270] };
  const result = soldSince(prev, [item("a", 13, 100, 300), item("b", 6, 1000, 270)]);
  assert.deepEqual(result, { volNtd: 1300, volMeso: 3600, units: 4 });
});

test("第一次看到的、沒變、變少（重新上架）、一次跳超過 1000 件的都不算", () => {
  const prev = { a: [10, 100, 300], b: [10, 100, 300], c: [10, 100, 300] };
  const result = soldSince(prev, [item("a", 10, 100, 300), item("b", 3, 100, 300), item("c", 2000, 100, 300), item("new", 50, 100, 300)]);
  assert.deepEqual(result, { volNtd: 0, volMeso: 0, units: 0 });
});

test("沒有上一次狀態（第一次跑）就全部是 0", () => {
  assert.deepEqual(soldSince(undefined, [item("a", 10, 100, 300)]), { volNtd: 0, volMeso: 0, units: 0 });
});
