import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_RESPAWN_SECONDS, equivalentRespawn, mergeSpawns, respawnSeconds, twSpawns } from "./spawns.mjs";

test("台服刷怪點依怪物合計點數，從怪物圖鑑推回來的不算", () => {
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

test("只收經典版客戶端自己的刷怪點：TMS v113 補的、怪物圖鑑推的都不算", () => {
  const upstream = {
    280030000: {
      id: 280030000,
      monsterSpawns: [
        { monsterId: 6130104, source: "tmsv113" },
        { monsterId: 6230101, source: "monsterBook" },
      ],
    },
  };
  assert.equal(twSpawns(upstream).has(280030000), false);
});

test("同一隻怪不同刷怪點的回生秒數：逐點換成每秒隻數再合起來，不是取最大", () => {
  // 三號線2號車庫：12 個點只有 1 個寫 1 秒，其餘預設——1 秒拉到預設 7 秒，全部等於預設就存 0
  const garage = [...Array(11).fill(0), 1];
  assert.equal(equivalentRespawn(garage), 0);
  // 第1軍營：20 個點一個 9 秒、一個 6 秒（拉到 7）、其餘預設 → 等效略高於 7 秒，不能整圖當 9 秒
  const camp = [9, ...Array(14).fill(0), 6, ...Array(4).fill(0)];
  const seconds = equivalentRespawn(camp);
  assert.ok(seconds > DEFAULT_RESPAWN_SECONDS && seconds < 9, String(seconds));
  assert.equal(seconds, 7.1);
  // 森林迷宮IV：三個 300 秒、三個 600 秒 → 400 秒
  assert.equal(equivalentRespawn([300, 300, 300, 600, 600, 600]), 400);

  const upstream = { 103000905: { id: 103000905, monsterSpawns: garage.map(mobTime => ({ monsterId: 3230101, mobTime })) } };
  assert.deepEqual(twSpawns(upstream).get(103000905), [[3230101, 12, 0]]);
});

test("每個刷怪點的回生秒數：沒指定用預設，比預設快的也拉到預設", () => {
  assert.equal(respawnSeconds(0), DEFAULT_RESPAWN_SECONDS);
  assert.equal(respawnSeconds(1), DEFAULT_RESPAWN_SECONDS);
  assert.equal(respawnSeconds(60), 60);
  assert.equal(respawnSeconds(undefined), DEFAULT_RESPAWN_SECONDS);
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
