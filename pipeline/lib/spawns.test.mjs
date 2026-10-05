import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeSpawns, twSpawns } from "./spawns.mjs";

test("台服刷怪點依怪物合計、回生秒數取最大，從怪物圖鑑推回來的不算", () => {
  const upstream = {
    105090100: {
      id: 105090100,
      monsterSpawns: [
        { monsterId: 4230100, mobTime: 0 },
        { monsterId: 4230100, mobTime: 0 },
        { monsterId: 5130100, mobTime: 0 },
        { monsterId: 6130100, source: "monsterBook" },
      ],
    },
    100: { id: 100, monsterSpawns: [{ monsterId: 8130100, mobTime: 2700 }] },
    200: { id: 200, monsterSpawns: [] },
  };
  const tw = twSpawns(upstream);
  assert.deepEqual(tw.get(105090100), [[4230100, 2, 0], [5130100, 1, 0]]);
  assert.deepEqual(tw.get(100), [[8130100, 1, 2700]]);
  assert.equal(tw.has(200), false);
});

test("上游地圖是陣列也讀得懂", () => {
  assert.deepEqual(twSpawns([{ id: 7, monsterSpawns: [{ monsterId: 1, mobTime: 0 }] }]).get(7), [[1, 1, 0]]);
  assert.equal(twSpawns(undefined).size, 0);
});

test("台服有刷怪資料就用台服，沒有才用 v83", () => {
  const tw = new Map([[105090100, [[4230100, 25, 0]]]]);
  const v83 = { 105090100: { m: [[6130100, 25, 0]] }, 105090000: { m: [[5130100, 20, 0]] }, 1: { m: [] } };
  const { spawns, fromTw, fromV83 } = mergeSpawns(tw, v83);
  assert.deepEqual(spawns["105090100"], [[4230100, 25, 0]]);
  assert.deepEqual(spawns["105090000"], [[5130100, 20, 0]]);
  assert.equal(spawns["1"], undefined);
  assert.equal(fromTw, 1);
  assert.equal(fromV83, 1);
});
