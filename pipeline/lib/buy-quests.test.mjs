import assert from "node:assert/strict";
import { test } from "node:test";
import { buyQuestIds, buyQuestShops, isTradeable, tradeTable } from "./buy-quests.mjs";

const free = { status: "unlimited", label: "無限交易", note: "", flags: {} };
const rawItems = [
  { id: 4000023, name: "冰獨眼獸之尾巴", trade: free },
  { id: 4031041, name: "休咪的錢包", trade: { status: "unlimited", flags: { quest: 1 } } },
  {
    id: 2000000, name: "紅色藥水", trade: free,
    tradeVariants: [{ id: 2000000, ...free }, { id: 2001500, status: "blocked", flags: { tradeBlock: 1 } }],
  },
  { id: 4000099, name: "不能交易的", trade: { status: "blocked", flags: { tradeBlock: 1 } } },
];
const tradeOf = tradeTable(rawItems);
const quest = (id, items, monsters = []) => ({
  id, completeRequirements: { items: items.map(itemId => ({ id: itemId, count: 1 })), monsters: monsters.map(mobId => ({ id: mobId })) },
});
const listedAll = ids => new Set(ids);

test("無限交易、沒有任務道具標記才算能交易", () => {
  assert.equal(isTradeable(free), true);
  assert.equal(isTradeable({ status: "unlimited", flags: { quest: 1 } }), false);
  assert.equal(isTradeable({ status: "blocked", flags: {} }), false);
  assert.equal(isTradeable(undefined), false);
});

test("只交能交易的道具、不用打怪的任務收進來", () => {
  assert.deepEqual(buyQuestIds([quest(2206, [4000023])], tradeOf, listedAll(["2206"])), ["2206"]);
});

test("要打怪的不收，就算要交的道具能交易", () => {
  assert.deepEqual(buyQuestIds([quest(1, [4000023], [100100])], tradeOf, listedAll(["1"])), []);
});

test("要交任務道具（上游標無限交易、但有 quest 標記）的不收", () => {
  assert.deepEqual(buyQuestIds([quest(2057, [4031041]), quest(2, [4000023, 4031041])], tradeOf, listedAll(["2057", "2"])), []);
});

test("合併的道具看任務原本要的編號：要活動版 2001500 的不收、要 2000000 的收", () => {
  const quests = [quest(10, [2001500]), quest(11, [2000000])];
  assert.deepEqual(buyQuestIds(quests, tradeOf, listedAll(["10", "11"])), ["11"]);
});

test("查不到交易資料、不能交易、沒有要交道具（對話任務）的都不收", () => {
  const quests = [quest(20, [9999999]), quest(21, [4000099]), quest(22, [])];
  assert.deepEqual(buyQuestIds(quests, tradeOf, listedAll(["20", "21", "22"])), []);
});

test("站上沒有的任務（還沒開放）不收", () => {
  assert.deepEqual(buyQuestIds([quest(30, [4000023])], tradeOf, listedAll([])), []);
});

test("商店：只看符合的任務要交的道具，去掉商城樂豆點，沒有店的不寫", () => {
  const apple = { p: "弓箭手村", n: "雜貨商人", m: 100000102, pr: 30, o: 1 };
  const itemsById = new Map([
    [2010000, { id: 2010000, sp: [apple, { p: "商城", pr: 100, c: 1 }] }],
    [4000023, { id: 4000023 }],
    [2000000, { id: 2000000, sp: [{ p: "商城", pr: 50, c: 1 }] }],
    [2000001, { id: 2000001, sp: [{ p: "勇士之村", pr: 160 }] }],
  ]);
  const quests = [
    { id: "3100", needItems: [{ id: 2010000, n: "蘋果", c: 20 }, { id: 4000023, n: "冰獨眼獸之尾巴", c: 50 }, { id: 2000000, n: "紅色藥水", c: 1 }] },
    { id: "9", needItems: [{ id: 2000001, n: "橘色藥水", c: 1 }] },
  ];
  assert.deepEqual(buyQuestShops(["3100"], quests, itemsById), { 2010000: [apple] });
});
