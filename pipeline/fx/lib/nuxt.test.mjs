import test from "node:test";
import assert from "node:assert/strict";
import { listingsFromHtml } from "./nuxt.mjs";

/** 照 8591 真的頁面組 devalue 陣列：外層包兩層 ShallowReactive，每筆掛單是一個物件、值放在後面的格子裡 */
function page(items) {
  const data = [["ShallowReactive", 1], { data: 2 }, ["ShallowReactive", 3], { list: 4 }, []];
  for (const item of items) {
    const at = data.length;
    const obj = {};
    data.push(obj);
    for (const [key, value] of Object.entries(item)) {
      obj[key] = data.length;
      data.push(value);
    }
    data[4].push(at);
  }
  return `<html><head></head><body><script type="application/json" data-nuxt-data="nuxt-app" data-ssr="true" id="__NUXT_DATA__">${JSON.stringify(data)}</script></body></html>`;
}

test("還原每筆掛單的 id、標題、台幣價（去逗號）、庫存、累計賣出", () => {
  const html = page([
    { id: "2419239866", ware_title: "【100元=300萬楓幣】3000萬楓幣=1000元", ware_price: "1,000", ware_number: 937, sell_count: 2310, page_view: "9697" },
    { id: "2419241104", ware_title: "【100元=300萬楓幣】300萬楓幣=100元", ware_price: "100", ware_number: 1000, sell_count: 2927 },
  ]);
  assert.deepEqual(listingsFromHtml(html), [
    { id: "2419239866", title: "【100元=300萬楓幣】3000萬楓幣=1000元", priceNtd: 1000, stock: 937, sold: 2310 },
    { id: "2419241104", title: "【100元=300萬楓幣】300萬楓幣=100元", priceNtd: 100, stock: 1000, sold: 2927 },
  ]);
});

test("沒有累計賣出、庫存的掛單照收，欄位是 null（不當成 0，免得之後算成交時誤算）", () => {
  const [listing] = listingsFromHtml(page([{ id: "1", ware_title: "【100元=300萬楓幣】", ware_price: "100" }]));
  assert.equal(listing.sold, null);
  assert.equal(listing.stock, null);
});

test("價格讀不出數字的不收", () => {
  assert.deepEqual(listingsFromHtml(page([{ id: "1", ware_title: "【100元=300萬楓幣】", ware_price: "面議", sell_count: 1 }])), []);
});

test("頁面沒有 __NUXT_DATA__（被擋、驗證頁、改版）就丟錯，不要當成 0 筆", () => {
  assert.throws(() => listingsFromHtml("<html><body>請完成驗證</body></html>"), /__NUXT_DATA__/);
});
