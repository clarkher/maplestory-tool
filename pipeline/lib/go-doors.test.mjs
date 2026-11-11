import assert from "node:assert/strict";
import test from "node:test";
import { goDoors } from "./go-doors.mjs";

const atlasMaps = [
  {
    id: 1020000, n: "楓葉村東郊平原", b: [-422, -694, 2240, 1216], mobs: [{ id: 1, p: [[1, 2]] }], npcs: [{ id: 2, x: 3, y: 4 }],
    doors: [{ to: 1010000, n: "楓葉村", p: [[-216, 93]] }, { to: 1020001, n: "番茄園", p: [] }, { to: 1000005, n: "草叢狩獵場Ⅰ", p: [[713, -571], [800, -571]] }],
  },
  { id: 5, n: "沒有範圍的圖", mobs: [], npcs: [], doors: [{ to: 1020000, n: "楓葉村東郊平原", p: [[1, 1]] }] },
];

test("每張有範圍的圖：範圍＋每個目的地的門座標，沒座標的門不收", () => {
  assert.deepEqual(goDoors(atlasMaps), {
    1020000: { b: [-422, -694, 2240, 1216], d: { 1010000: [[-216, 93]], 1000005: [[713, -571], [800, -571]] } },
  });
});

test("沒有範圍的圖畫不出來，整張不收", () => {
  assert.equal(goDoors(atlasMaps)[5], undefined);
});

test("只帶導航要的欄位（不帶怪、NPC、圖名）", () => {
  assert.deepEqual(Object.keys(goDoors(atlasMaps)[1020000]), ["b", "d"]);
});
