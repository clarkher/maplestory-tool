import assert from "node:assert/strict";
import { test } from "node:test";
import { buyQuestIds, buyQuestShops, buyQuestSkills, isMesoShop, isTradeable, tradeTable } from "./buy-quests.mjs";

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

// 上游 item.sources.shops 的樣子（只留 shopRows 會看的欄位）
const place = { id: 100000102, name: "弓箭手村雜貨店", unnamed: false, regionName: "維多利亞島" };
const meso = (overrides = {}) => ({
  sourceType: "npcShop", sourceFile: "heavenms_db_database.sql", merchantName: "露娜",
  price: 30, count: 1, currency: "楓幣", maps: [place], ...overrides,
});
// 2026-10 萬聖節活動店：收萬聖節硬幣、有限時說明，sp 沒有幣別，不擋會被當成「1 楓幣」
const halloween = (overrides = {}) => meso({
  sourceFile: "halloween2026", merchantName: "行商人", price: 1, count: 10, currency: "萬聖節硬幣",
  availabilityText: "2026/10/15 維護後～2026/11/11 23:59", ...overrides,
});
const cashShop = () => ({ sourceType: "cashShop", merchantName: "商城", price: 100, count: 1, currency: "點數", maps: [] });
const context = { openRegions: ["維多利亞島"], mapRecords: { 100000102: { zh: "弓箭手村雜貨店" } } };
const rawItem = (id, shops) => ({ id, sources: shops ? { shops } : {} });
const itemsOf = (...items) => new Map(items.map(item => [Number(item.id), item]));
const need = (id, n = "道具") => ({ id, n, c: 1 });
const apple = { p: "弓箭手村雜貨店", n: "露娜", m: 100000102, pr: 30, o: 1 };

test("isMesoShop：只認收楓幣、沒有限時說明的店", () => {
  assert.equal(isMesoShop(meso()), true);
  assert.equal(isMesoShop(halloween()), false);
  assert.equal(isMesoShop(meso({ availabilityText: "2026/10/15 維護後～2026/11/11 23:59" })), false);
  assert.equal(isMesoShop(cashShop()), false);
  assert.equal(isMesoShop(undefined), false);
});

test("商店：收楓幣、不限時的 NPC 店留下，寫成 shopRows 的樣子", () => {
  const raw = itemsOf(rawItem(2010000, [meso()]));
  const quests = [{ id: "3100", needItems: [need(2010000, "蘋果")] }];
  assert.deepEqual(buyQuestShops(["3100"], quests, raw, context), { 2010000: [apple] });
});

test("商店：萬聖節硬幣的活動店、限時的楓幣店、商城樂豆點都不列，只留常駐收楓幣的", () => {
  const mixed = [halloween(), meso({ price: 99, availabilityText: "2026/10/15 維護後～2026/11/11 23:59" }), cashShop(), meso()];
  const raw = itemsOf(rawItem(2022000, mixed));
  const quests = [{ id: "3100", needItems: [need(2022000, "礦泉水")] }];
  assert.deepEqual(buyQuestShops(["3100"], quests, raw, context), { 2022000: [apple] });
});

test("商店：剩不下任何一家就不寫；沒有商店資料、查不到道具的也不寫", () => {
  const raw = itemsOf(rawItem(2022000, [halloween(), cashShop()]), rawItem(4000023, undefined));
  const quests = [{ id: "3100", needItems: [need(2022000), need(4000023), need(9999999)] }];
  assert.deepEqual(buyQuestShops(["3100"], quests, raw, context), {});
});

test("商店：只看符合的任務要交的道具，別的任務的不管", () => {
  const raw = itemsOf(rawItem(2010000, [meso()]), rawItem(2000001, [meso({ price: 160 })]));
  const quests = [
    { id: "3100", needItems: [need(2010000, "蘋果")] },
    { id: "9", needItems: [need(2000001, "橘色藥水")] },
  ];
  assert.deepEqual(buyQuestShops(["3100"], quests, raw, context), { 2010000: [apple] });
});

const skillTable = new Map([[1003, { id: 1003, n: "神匠之魂" }], [1004, { id: 1004, n: "別的技能" }]]);

test("獎勵技能：站上有的技能編號寫成技能名", () => {
  const quests = [{ id: "6000", rewardSkills: [1003] }];
  assert.deepEqual(buyQuestSkills(["6000"], quests, skillTable), { 1003: "神匠之魂" });
});

test("獎勵技能：站上查不到的編號（別的職業線）略過，查得到的照留", () => {
  const quests = [{ id: "6000", rewardSkills: [1003, 10001003, 20001003] }];
  assert.deepEqual(buyQuestSkills(["6000"], quests, skillTable), { 1003: "神匠之魂" });
});

test("獎勵技能：沒被選進來的任務不管", () => {
  const quests = [{ id: "6000", rewardSkills: [1003] }, { id: "7", rewardSkills: [1004] }];
  assert.deepEqual(buyQuestSkills(["6000"], quests, skillTable), { 1003: "神匠之魂" });
});

test("獎勵技能：沒有 rewardSkills 的任務不產生東西", () => {
  const quests = [{ id: "2206" }, { id: "3100", rewardSkills: [] }];
  assert.deepEqual(buyQuestSkills(["2206", "3100"], quests, skillTable), {});
});
