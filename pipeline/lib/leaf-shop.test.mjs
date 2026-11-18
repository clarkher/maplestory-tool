import assert from "node:assert/strict";
import { test } from "node:test";
import { LEAF_SHOP_WEAPONS, buildLeafGear, withLeafShop } from "./leaf-shop.mjs";

test("19 把楓葉武器：35 級 100 枚、43 級 200 枚", () => {
  assert.equal(LEAF_SHOP_WEAPONS.length, 19);
  assert.equal(LEAF_SHOP_WEAPONS.find(([id]) => id === 1472030)[1], 100);
  assert.equal(LEAF_SHOP_WEAPONS.find(([id]) => id === 1382012)[1], 200);
});

test("楓葉法杖：三個村子的招牌各一筆，收商會硬幣、標結束時間", () => {
  const rows = withLeafShop(1382012, undefined);
  assert.deepEqual(rows.map(row => row.p), ["弓箭手村", "天空之城", "冰原雪域"]);
  for (const row of rows) {
    assert.equal(row.n, "楓葉商會招牌");
    assert.equal(row.pr, 200);
    assert.equal(row.u, "楓葉商會硬幣");
    assert.equal(row.e, "2026-12-16T23:59+08:00");
  }
});

test("原本有店家的照留，接在後面；不是楓葉武器原樣回", () => {
  const old = [{ p: "商城", pr: 10, c: 1 }];
  assert.equal(withLeafShop(1472030, old).length, 4);
  assert.equal(withLeafShop(1472030, old)[0], old[0]);
  assert.equal(withLeafShop(1302017, old), old);
  assert.equal(withLeafShop(1302017, undefined), undefined);
});

test("buildLeafGear：照 items.json 的數值做成計算機的武器，來源寫楓葉商會", () => {
  const items = [
    { id: 1382012, n: "楓葉法杖", c: "裝備", s: "長杖", eq: { reqLevel: 43, reqJob: 2, incPAD: 39, incMAD: 58, tuc: 7, attackSpeed: 6 } },
    { id: 1302017, n: "藍色雨傘", c: "裝備", s: "單手劍", eq: { incPAD: 15, incMAD: 15 } },
  ];
  const out = buildLeafGear(items);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], {
    id: 1382012, n: "楓葉法杖", s: "長杖", lv: 43, atk: 39, mag: 58, spd: 6, job: 2, tuc: 7,
    src: { shops: [{ p: "楓葉商會", n: "楓葉商會招牌", m: 100000000, pr: 200 }] },
  });
});
