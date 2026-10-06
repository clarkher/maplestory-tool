import assert from "node:assert/strict";
import { test } from "node:test";
import { officialName, OFFICIAL_MAP_NAMES } from "./map-names.mjs";

test("客戶端沒有中文名時，查得到的地圖用官方公告的地名", () => {
  assert.equal(officialName(200000000, ""), "天空之城");
  assert.equal(officialName(211000000, undefined), "冰原雪域");
});

test("客戶端已經有中文名時用客戶端的，不被補缺表蓋掉（改版後有名字就自動換掉）", () => {
  assert.equal(officialName(200000000, "維多利亞港"), "維多利亞港");
  assert.equal(officialName(211000000, "奇幻村"), "奇幻村");
});

test("不在補缺表裡的地圖，客戶端也沒有名字就照舊不編（誠實留空，不是沒給值）", () => {
  assert.equal(officialName(103000890, ""), "");
  assert.equal(officialName(120010000, undefined), "");
});

test("補缺表只收這兩筆，每筆都附官方出處（不要之後有人用別的來源偷塞地名進來沒人發現）", () => {
  assert.deepEqual(Object.keys(OFFICIAL_MAP_NAMES).map(Number).sort(), [200000000, 211000000]);
  for (const entry of Object.values(OFFICIAL_MAP_NAMES)) {
    assert.match(entry.source, /^https:\/\//);
  }
});
