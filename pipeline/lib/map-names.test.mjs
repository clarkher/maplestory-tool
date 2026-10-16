import assert from "node:assert/strict";
import { test } from "node:test";
import { HELD_BACK_MAPS, officialName, OFFICIAL_MAP_NAMES } from "./map-names.mjs";

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

test("補缺表只收這三筆，每筆都附官方出處（不要之後有人用別的來源偷塞地名進來沒人發現）", () => {
  assert.deepEqual(Object.keys(OFFICIAL_MAP_NAMES).map(Number).sort(), [101000300, 200000000, 211000000]);
  for (const entry of Object.values(OFFICIAL_MAP_NAMES)) {
    assert.match(entry.source, /^https:\/\//);
  }
});

test("魔法森林碼頭（去天空之城的飛船）：客戶端沒名字，用官方 10/15【內容擴充】寫的地名", () => {
  assert.equal(officialName(101000300, ""), "魔法森林碼頭");
  assert.match(OFFICIAL_MAP_NAMES[101000300].source, /eventAdId=20209/);
});

test("廢礦官方只開前半部：試煉的洞穴 1～3（含洞穴裡的小洞穴）、火山那段先擋（2026-10-16 使用者拍板 2B），其他廢礦的圖不在裡面", () => {
  assert.deepEqual(
    [...HELD_BACK_MAPS.keys()].sort(),
    [211041900, 211042000, 211042100, 211042101, 211042200, 280020000, 280030000],
  );
  assert.equal(HELD_BACK_MAPS.get(280030000), "殘暴炎魔祭壇");
  for (const open of [211040300 /* 尖銳的絕壁Ⅰ */, 211041500 /* 廢棄礦坑Ⅰ */, 211041100 /* 亡者之林Ⅰ */]) {
    assert.equal(HELD_BACK_MAPS.has(open), false);
  }
});
