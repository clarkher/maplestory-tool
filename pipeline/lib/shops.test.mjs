import assert from "node:assert/strict";
import { test } from "node:test";
import { shopPrice, shopRows } from "./shops.mjs";

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

test("地區開了、但官方還沒開的圖（廢礦後半部，map-names.mjs 的 HELD_BACK_MAPS）的店也不列", () => {
  const shop = npcShop({ maps: [{ id: 211042200, name: "試煉的洞穴3", unnamed: false, regionName: "廢礦" }] });
  assert.equal(shopRows([shop], { ...context, openRegions: [...context.openRegions, "廢礦"] }), undefined);
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

/** 萬聖節活動的行商人（上游 sourceFile halloween2026）：收萬聖節硬幣、限時，同一家店開在 5 張分流圖 */
const eventShop = overrides => ({
  sourceType: "npcShop",
  sourceFile: "halloween2026",
  merchantName: "行商人",
  price: 1,
  count: 10,
  currency: "萬聖節硬幣",
  availabilityText: "2026/10/15 維護後～2026/11/11 23:59",
  maps: [876011151, 876011153].map(id => ({ id, name: "雪原的面具祭典現場", unnamed: false, regionName: "冰原雪域" })),
  ...overrides,
});

test("活動店收萬聖節硬幣：記幣別 u、結束時間 e（台灣時間），不是楓幣也不是樂豆點", () => {
  assert.deepEqual(shopRows([eventShop({ maps: eventShop().maps.slice(0, 1) })], context), [
    { p: "雪原的面具祭典現場", n: "行商人", m: 876011151, pr: 1, k: 10, u: "萬聖節硬幣", e: "2026-11-11T23:59+08:00" },
  ]);
});

test("限時的楓幣店只記結束時間，不記幣別", () => {
  const rows = shopRows([eventShop({ merchantName: "祭典管理員", price: 50000, count: 1, currency: "楓幣", maps: eventShop().maps.slice(0, 1) })], context);
  assert.deepEqual(rows, [{ p: "雪原的面具祭典現場", n: "祭典管理員", m: 876011151, pr: 50000, e: "2026-11-11T23:59+08:00" }]);
});

test("限時說明只寫日期沒寫幾點：算到那天 23:59", () => {
  const [row] = shopRows([eventShop({ availabilityText: "2026/12/1 維護後～2027/1/5", maps: eventShop().maps.slice(0, 1) })], context);
  assert.equal(row.e, "2027-01-05T23:59+08:00");
});

test("有限時說明、但讀不出哪天結束的不列——不知道現在還開不開", () => {
  assert.equal(shopRows([eventShop({ availabilityText: "活動期間限定" })], context), undefined);
});

test("shopPrice：最高單價只算楓幣跟樂豆點，活動硬幣不算（超級藥水 10 個 2 萬聖節硬幣不是 0.2）", () => {
  assert.equal(shopPrice([eventShop({ price: 2 })]), undefined);
  assert.equal(shopPrice([npcShop({ price: 1650 }), eventShop()]), 1650);
  assert.equal(shopPrice([npcShop({ price: 1400, count: 2000 })]), 0.7);
  assert.equal(shopPrice([npcShop({ price: 9999, hiddenByDefault: true })]), undefined);
  assert.equal(shopPrice(undefined), undefined);
});
