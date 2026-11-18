import assert from "node:assert/strict";
import { test } from "node:test";
import { monsterReleasedMaps } from "./monster-maps.mjs";

const released = new Set([200082300, 211041500, 999999998]);

test("潛水企鵝王：女神塔那張留著，水世界（230）的圖跟刷怪點拿掉", () => {
  const out = monsterReleasedMaps([200082300, 230010000, 230010001], [[200082300, 18, 0], [230010000, 8, 0]], released);
  assert.deepEqual(out.maps, [200082300]);
  assert.deepEqual(out.sp, [[200082300, 18, 0]]);
  assert.equal(out.listed, true);
});

test("只在「楓葉世界全地區」的活動怪（聖誕小雪人）不收", () => {
  const out = monsterReleasedMaps([999999998], [], released);
  assert.equal(out.listed, false);
});

test("沒有一張已開放的圖：不收", () => {
  assert.equal(monsterReleasedMaps([230040410], [[230040410, 7, 0]], released).listed, false);
});

test("潛水企鵝王（水世界的怪）整隻不收：女神塔有刷也一樣（使用者 11/18）", () => {
  assert.equal(monsterReleasedMaps([200082300], [[200082300, 18, 0]], released, 3210450).listed, false);
  assert.equal(monsterReleasedMaps([211041500], [], released, 4230107).listed, true);
});
