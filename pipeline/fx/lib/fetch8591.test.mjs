import test from "node:test";
import assert from "node:assert/strict";
import { USER_AGENT, fetchAllListings, pageUrl } from "./fetch8591.mjs";

/** 假的 8591：每頁 10 筆，給 id 清單組出跟真的一樣格式的頁面 */
function fakePage(ids) {
  const data = [[]];
  for (const id of ids) {
    const at = data.length;
    data.push({ id: at + 1, ware_title: at + 2, ware_price: at + 3, ware_number: at + 4, sell_count: at + 5 });
    data.push(String(id), "【100元=300萬楓幣】300萬楓幣=100元", "100", 999, 1);
    data[0].push(at);
  }
  return `<script type="application/json" id="__NUXT_DATA__">${JSON.stringify(data)}</script>`;
}

test("網址：雪吉拉、楓幣分頁、firstRow 每頁加 10", () => {
  assert.equal(pageUrl("70854", 20), "https://www.8591.com.tw/v3/mall/list/70657?searchGame=70657&searchServer=70854&searchType=0&firstRow=20");
});

test("User-Agent 老實寫是誰、附 repo 網址，而且全是 ASCII（header 不能放中文）", () => {
  assert.match(USER_AGENT, /^MapleBook-fx\/1\.0 \(\+https:\/\/github\.com\/clarkher\/maplestory-tool; /);
  assert.match(USER_AGENT, /^[\x20-\x7e]+$/);
});

test("一頁一頁抓到空頁為止、頁與頁之間停一下、依 id 去重", async () => {
  const pages = { 0: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 10: [10, 11, 12], 20: [] };
  const asked = [];
  const pauses = [];
  const listings = await fetchAllListings({
    fetchText: async url => {
      const firstRow = Number(new URL(url).searchParams.get("firstRow"));
      asked.push(firstRow);
      return fakePage(pages[firstRow]);
    },
    pauseMs: 3000,
    sleep: async ms => pauses.push(ms),
  });
  assert.deepEqual(asked, [0, 10, 20]);
  assert.deepEqual(pauses, [3000, 3000]);
  assert.deepEqual(listings.map(l => l.id), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
});

test("翻到後面一直回同一頁（沒有新 id）就停，不會抓滿 40 頁", async () => {
  let calls = 0;
  await fetchAllListings({ fetchText: async () => { calls += 1; return fakePage([1, 2, 3]); }, sleep: async () => {} });
  assert.equal(calls, 2);
});

test("其中一頁被擋（沒有 __NUXT_DATA__）整次失敗，不拿半套資料算", async () => {
  await assert.rejects(
    fetchAllListings({ fetchText: async url => (url.endsWith("firstRow=0") ? fakePage([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) : "請完成驗證"), sleep: async () => {} }),
    /__NUXT_DATA__/,
  );
});
