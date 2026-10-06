import assert from "node:assert/strict";
import { test } from "node:test";
import { shopRows } from "./shops.mjs";

const context = {
  openRegions: ["維多利亞島", "冰原雪域"],
  mapRecords: {
    100000101: { zh: "", ret: 100000000 },
    100000000: { zh: "弓箭手村" },
    200000001: { zh: "", ret: 200000000 },
    200000000: { zh: "天空之城" },
    230000002: { zh: "", ret: 230000000 },
    230000000: { zh: "" },
  },
};

const npcShop = overrides => ({
  sourceType: "npcShop",
  sourceFile: "heavenms_db_database.sql",
  merchantName: "克爾",
  price: 24000,
  count: 1,
  currency: "楓幣",
  maps: [{ id: 100000101, name: "弓箭手村武器店", unnamed: false, regionName: "維多利亞島" }],
  ...overrides,
});

test("有名字、地區已開放的店寫那張圖的名字跟 NPC，標出取自舊版資料", () => {
  assert.deepEqual(shopRows([npcShop()], context), [{ p: "弓箭手村武器店", n: "克爾", m: 100000101, pr: 24000, o: 1 }]);
});

test("店那張圖沒名字、但回城的城鎮有名字：寫城鎮名（天空之城），地圖 id 用城鎮的", () => {
  const shop = npcShop({ merchantName: "妖精 諾麗", maps: [{ id: 200000001, name: "未命名地圖 200000001", unnamed: true, regionName: "" }] });
  assert.deepEqual(shopRows([shop], context), [{ p: "天空之城", n: "妖精 諾麗", m: 200000000, pr: 24000, o: 1 }]);
});

test("還沒開放的城鎮（水世界）的店不列，玩家去不了", () => {
  const shop = npcShop({ merchantName: "卡利", maps: [{ id: 230000002, name: "未命名地圖 230000002", unnamed: true, regionName: "" }] });
  assert.equal(shopRows([shop], context), undefined);
});

test("有名字但地區還沒開放的店也不列", () => {
  const shop = npcShop({ maps: [{ id: 220000001, name: "玩具城武器店", unnamed: false, regionName: "玩具城" }] });
  assert.equal(shopRows([shop], context), undefined);
});

test("商城寫「商城」、記樂豆點、整組賣的記件數；下架的限時售價不列", () => {
  const cash = (price, count, hidden) => ({ sourceType: "cashShop", merchantName: "商城", price, count, currency: "點數", maps: [], hiddenByDefault: hidden });
  assert.deepEqual(shopRows([cash(40, 1, true), cash(220, 1, false), cash(1980, 10, false)], context), [
    { p: "商城", pr: 220, c: 1 },
    { p: "商城", pr: 1980, k: 10, c: 1 },
  ]);
});

test("通行證遠端商店沒有地圖也列（經典版的功能，上游手動補的，不標舊版）；其他沒地圖的不列", () => {
  const remote = {
    sourceType: "npcShop", sourceFile: "manual", sourceLabel: "楓之谷通行證遠端商店", merchantName: "遠端商店",
    price: 500, count: 1, currency: "楓幣", maps: [],
  };
  const nowhere = npcShop({ merchantName: "唐唐", maps: [] });
  assert.deepEqual(shopRows([remote, nowhere], context), [{ p: "楓之谷通行證遠端商店", pr: 500 }]);
});

test("同一家店同一個價錢重複只留一筆；沒有店、沒有標價的回 undefined", () => {
  assert.deepEqual(shopRows([npcShop(), npcShop()], context), [{ p: "弓箭手村武器店", n: "克爾", m: 100000101, pr: 24000, o: 1 }]);
  assert.equal(shopRows([npcShop({ price: 0 })], context), undefined);
  assert.equal(shopRows([], context), undefined);
  assert.equal(shopRows(undefined, context), undefined);
});

test("一家店在好幾張圖：每張已開放的圖各列一筆；沒開放的那張跳過", () => {
  const shop = npcShop({ merchantName: "科爾", maps: [
    { id: 230000002, name: "未命名地圖 230000002", unnamed: true, regionName: "" },
    { id: 100000202, name: "寵物公園", unnamed: false, regionName: "維多利亞島" },
    { id: 100000100, name: "弓箭手村市集", unnamed: false, regionName: "維多利亞島" },
  ] });
  assert.deepEqual(shopRows([shop], context), [
    { p: "寵物公園", n: "科爾", m: 100000202, pr: 24000, o: 1 },
    { p: "弓箭手村市集", n: "科爾", m: 100000100, pr: 24000, o: 1 },
  ]);
});
