import assert from "node:assert/strict";
import { test } from "node:test";
import { closedCraftMaterials, fourthJobNeeds, howToGet, snapshotFourthJob } from "./future.mjs";

const monsters = [{ id: 1, n: "肥肥", lv: 8 }, { id: 2, n: "土龍", lv: 60 }, { id: 3, n: "青龍", lv: 66 }, { id: 4, n: "赤龍", lv: 70 }];
const recipe = (group, recipeId, materials, output = 1432004) => ({
  groupLabel: group, recipeId, sourceKind: "npcDialog", primaryOutput: { id: output }, materials: materials.map(id => ({ id })),
});
const raw = (id, crafts = []) => ({ id, name: `道具${id}`, sources: { crafts } });

test("現在怎麼拿：怪照等級排、最多寫兩隻，多的寫幾種", () => {
  assert.deepEqual(howToGet({ id: 9, dm: [2, 3, 4, 1] }, { monsters, craftTowns: [] }), [{ kind: "mob", text: "打肥肥、土龍等 4 種怪", ids: [1, 2] }]);
});

test("現在怎麼拿：只收不限時的楓幣店，活動店不算", () => {
  const item = { id: 9, sp: [{ p: "活動地", n: "活動", pr: 1, u: "硬幣", e: "2026-11-11" }, { p: "冰原雪域", n: "排檔", pr: 100 }] };
  assert.deepEqual(howToGet(item, { monsters, craftTowns: [] }), [{ kind: "shop", text: "排檔賣 100 楓幣" }]);
});

test("現在怎麼拿：已開放城鎮的合成算，強化合成跟沒開的城鎮不算", () => {
  const craftTowns = ["玩具城", "0轉技能「強化合成」", "冰原雪域"];
  assert.deepEqual(howToGet({ id: 9 }, { monsters, craftTowns }), [{ kind: "craft", text: "冰原雪域合成" }]);
  assert.deepEqual(howToGet({ id: 9 }, { monsters, craftTowns: ["玩具城"] }), []);
});

test("沒開放城鎮的配方才算：數每種材料用在幾個配方，現在拿得到的照配方數排", () => {
  const rawItems = [
    raw(1432004, [recipe("玩具城：武器製作", "a", [4000100, 4000101]), recipe("玩具城：武器製作", "b", [4000100, 4000102])]),
    raw(4000100, [recipe("冰原雪域：冶煉", "c", [4000103], 4000100)]),
    raw(4000101), raw(4000102),
  ];
  const siteItems = [
    { id: 4000100, n: "螺絲釘" }, { id: 4000101, n: "龍皮", dm: [2] }, { id: 4000102, n: "機器心臟" }, { id: 4000103, n: "鋼鐵母礦" },
  ];
  const out = closedCraftMaterials(rawItems, siteItems, monsters);
  assert.deepEqual(out.now.map(m => [m.n, m.recipes]), [["螺絲釘", 2], ["龍皮", 1]]);
  assert.deepEqual(out.now[0].how, [{ kind: "craft", text: "冰原雪域合成" }]);
  assert.deepEqual(out.notNow.map(m => m.n), ["機器心臟"]);
  assert.equal(out.now.some(m => m.n === "鋼鐵母礦"), false);
});

test("同一個配方掛在好幾件道具底下只算一次；未命名道具跟裝備不收", () => {
  const shared = recipe("玩具城：武器製作", "a", [4000100, 4130001, 1082023]);
  const siteItems = [{ id: 4000100, n: "螺絲釘", dm: [1] }, { id: 4130001, n: "未命名道具 4130001", dm: [1] }, { id: 1082023, n: "鋼鐵長手套", dm: [1] }];
  const out = closedCraftMaterials([raw(1, [shared]), raw(2, [shared]), raw(4130001), raw(1082023)], siteItems, monsters);
  assert.deepEqual(out.now.map(m => [m.n, m.recipes]), [["螺絲釘", 1]]);
});

test("四轉快照：只留四轉任務線，留任務名、職業、要交的道具（數量大於 0）", () => {
  const quests = [
    { id: "6303", name: "製作鋰礦手鐲", startRequirements: { jobs: [112, 212] }, completeRequirements: { items: [{ id: 4011002, name: "鋰礦石", count: 10 }, { id: 9, name: "給的", count: -1 }] } },
    { id: "2000", name: "別的", startRequirements: { jobs: [] }, completeRequirements: { items: [] } },
    { id: "6800", name: "女神的安排", startRequirements: { jobs: [0, 100] }, completeRequirements: { items: [] } },
  ];
  assert.deepEqual(snapshotFourthJob(quests), [{ id: "6303", n: "製作鋰礦手鐲", jobs: [112, 212], items: [{ id: 4011002, n: "鋰礦石", c: 10 }] }]);
});

test("四轉材料：同職業同道具加總；現在拿得到的放 now，其他放 later；三轉接的任務線算進四轉", () => {
  const snapshot = [
    { id: "6222", n: "逆屬性召喚獸理論", jobs: [212], items: [{ id: 200, n: "鋰礦石", c: 5 }] },
    { id: "6303", n: "製作鋰礦手鐲", jobs: [112, 212], items: [{ id: 200, n: "鋰礦石", c: 10 }, { id: 201, n: "老舊手鐲", c: 1 }] },
    { id: "6910", n: "羅貝亞的介紹函", jobs: [211], items: [{ id: 202, n: "法師轉職證明書", c: 1 }] },
  ];
  const siteItems = [{ id: 200, n: "鋰礦石", dm: [1] }];
  const out = fourthJobNeeds(snapshot, siteItems, monsters);
  assert.deepEqual(out["212"].now, [{ id: 200, n: "鋰礦石", c: 15, quests: ["逆屬性召喚獸理論", "製作鋰礦手鐲"], how: [{ kind: "mob", text: "打肥肥", ids: [1] }] }]);
  assert.deepEqual(out["212"].later.map(x => x.n), ["老舊手鐲", "法師轉職證明書"]);
  assert.deepEqual(out["112"].now.map(x => x.c), [10]);
});

test("四轉材料：皇家騎士團這類四碼職業、一轉不收；未命名道具不列", () => {
  const snapshot = [{ id: "6325", n: "楓葉祝福技能書", jobs: [2112, 100], items: [{ id: 200, n: "鋰礦石", c: 1 }] }, { id: "6100", n: "書", jobs: [312], items: [{ id: 201, n: "未命名道具 201", c: 1 }] }];
  const out = fourthJobNeeds(snapshot, [], monsters);
  assert.deepEqual(Object.keys(out), ["312"]);
  assert.deepEqual(out["312"].later, []);
});
