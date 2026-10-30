import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { buildAtlas, doorEdges } from "./atlas.mjs";

// 樣本從上游 maps-data、public/data 切出來（不讀 data/raw：那是 git 忽略的，CI 沒有）
const fixture = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "__fixtures__", "atlas-upstream.json"), "utf8"));

const OPEN_REGIONS = ["楓之島", "維多利亞島", "奇幻村", "鯨魚號", "楓葉世界", "冰原雪域", "廢礦"];

function run(overrides = {}) {
  return buildAtlas({
    upstreamMaps: fixture.maps,
    mapRecords: fixture.mapRecords,
    graphEdges: fixture.graphEdges,
    portalEdges: fixture.portalEdges,
    items: fixture.items,
    quests: fixture.quests,
    monsterIds: new Set([130100, 130101, 210100, 1210100]),
    npcImageIds: new Set([12100, 1011001]),
    openRegions: OPEN_REGIONS,
    heldBackMaps: new Map(),
    ...overrides,
  });
}

const atlas = run();
const mapOf = id => atlas.maps.find(map => map.id === id);
const npcOf = id => atlas.npcs.find(npc => npc.id === id);

test("1020000 怪物分組：照數量排，p 長度等於 k", () => {
  const map = mapOf(1020000);
  assert.ok(map);
  assert.deepEqual(map.mobs.map(mob => [mob.n, mob.k]), [["木妖", 7], ["紅寶", 7], ["綠水靈", 4], ["肥肥", 3]]);
  for (const mob of map.mobs) assert.equal(mob.p.length, mob.k);
  assert.equal(map.mobs[0].pg, 1);
  assert.equal(map.n, "楓葉村東郊平原");
  assert.equal(map.st, "彩虹之地");
  assert.equal(map.rg, "楓之島");
  assert.deepEqual(map.b, [-422, -694, 2240, 1216]);
});

test("1020000 門：四個有名字的目的地，沒有 2000000，楓葉村座標對上上游門", () => {
  const map = mapOf(1020000);
  const names = map.doors.map(door => door.n);
  for (const name of ["楓葉村", "番茄園", "草叢狩獵場Ⅰ", "草叢狩獵場Ⅱ"]) assert.ok(names.includes(name), name);
  assert.equal(map.doors.length, 4);
  assert.ok(!map.doors.some(door => door.to === 2000000));
  assert.deepEqual(map.doors.find(door => door.n === "楓葉村").p[0], [-216, 93]);
});

test("1020000 NPC：只有麥加", () => {
  assert.deepEqual(mapOf(1020000).npcs, [{ id: 12100, n: "麥加", x: -21, y: 87 }]);
});

test("麥加任務：8 個，同名的兩筆都留，桑姆的考驗是交", () => {
  const npc = npcOf(12100);
  assert.equal(npc.quests.length, 8);
  assert.equal(npc.quests.find(quest => quest.n === "桑姆的考驗").r, "交");
  assert.equal(npc.quests.filter(quest => quest.n === "麥加的最後一次修煉").length, 2);
  assert.equal(npc.quests.find(quest => quest.n === "麥加的修煉").r, "接・交");
  assert.equal(npc.img, 1);
  assert.deepEqual(npc.maps, [1020000]);
});

test("山姆店：在弓箭手村武器店、店 90 樣，店面圖有收", () => {
  const npc = npcOf(1011001);
  assert.ok(npc.maps.includes(100000101));
  assert.equal(npc.shop.length, 90);
  for (const row of npc.shop) {
    assert.equal(typeof row.id, "number");
    assert.ok(row.pr > 0);
    assert.ok(row.s);
  }
  assert.ok(atlas.index.maps.includes(100000101));
  // 克爾在同一張圖，但山姆的店不能算到他頭上
  const kerItems = fixture.items.filter(item => item.sp.some(row => row.n === "克爾")).length;
  assert.ok(kerItems > 0);
  assert.equal(npcOf(1011000).shop.length, kerItems);
  assert.equal(npcOf(1011000).img, undefined);
});

test("沒名字的 NPC 不收", () => {
  assert.ok(!atlas.npcs.some(npc => /^NPC \d+$/.test(npc.n)));
  assert.ok(!atlas.npcs.some(npc => npc.id === 1063013));
  for (const map of atlas.maps) assert.ok(!map.npcs.some(npc => /^NPC \d+$/.test(npc.n)));
});

test("沒開放的圖不收：日本、regionName 空白又沒中文名", () => {
  assert.ok(!atlas.index.maps.includes(800020400));
  assert.ok(!atlas.index.maps.includes(993073000));
});

test("多收的圖：街名是隱藏地圖的不收，就算門對得到也一樣", () => {
  assert.ok(!atlas.index.maps.includes(910320000));
  const withDoor = run({ mapRecords: { ...fixture.mapRecords, 910320010: { zh: "測試目的地" } } });
  assert.ok(!withDoor.index.maps.includes(910320000));
  const hidden = { ...fixture.maps[100000101], street: "航海中" };
  const sailing = run({ upstreamMaps: { ...fixture.maps, 100000101: hidden } });
  assert.ok(!sailing.index.maps.includes(100000101));
});

test("多收的圖：沒有門的房間不收（只靠 NPC、任務進去的考驗場）", () => {
  assert.ok(!atlas.index.maps.includes(108000100));
  // maps.json 有 zh 的圖不受影響：同一張考驗場給了 zh 就收（它有 NPC）
  const named = run({ mapRecords: { ...fixture.mapRecords, 108000100: { zh: "弓箭手2轉考驗場" } } });
  assert.ok(named.index.maps.includes(108000100));
});

test("同一個目的地多個門：清單只列一次，每個門都有座標", () => {
  const south = mapOf(100040000);
  const toCamp = south.doors.filter(door => door.to === 100040001);
  assert.equal(toCamp.length, 1);
  assert.ok(toCamp[0].p.length >= 2, JSON.stringify(toCamp[0].p));
  const back = mapOf(100040001).doors.find(door => door.to === 100040000);
  assert.deepEqual(back.p, [[-189, 277], [275, -1090]]);
});

test("doorEdges：同一個目的地每個門都留，反向門照 pt 2／3 補", () => {
  const edges = doorEdges(
    { 1: { p: [[2, "a", "x", 10, 5, 6], [2, "b", "y", 10, 7, 8], [3, "c", "z", 2, 1, 1], [1, "self", "", 2, 0, 0], [9, "gone", "", 2, 0, 0]] } },
    { 1: {}, 2: {}, 3: {} },
  );
  assert.deepEqual(edges[1], [[2, "a", 5, 6], [2, "b", 7, 8], [3, "c", 1, 1]]);
  assert.deepEqual(edges[3], [[1, "z", 0, 0]]);
});

test("門的規則：npc: 邊不算門、上游有門清單時對不到門名的不畫（只進清單）", () => {
  const out = run({
    graphEdges: {
      ...fixture.graphEdges,
      1020000: [
        [1010000, "west00", 0, 0],
        [1020001, "沒有這個門", 11, 22],
        [1000005, "沒有這個門2", 0, 0],
        [1000006, "npc:麥加:傳送", 5, 5],
      ],
    },
    portalEdges: {},
  });
  const doors = out.maps.find(map => map.id === 1020000).doors;
  assert.deepEqual(doors.map(door => door.to), [1010000, 1020001, 1000005]);
  assert.deepEqual(doors[0].p, [[-216, 93]]);
  // 1020000 在台服客戶端有門清單：v83 才有的門名（graph 座標 11,22）不畫
  assert.deepEqual(doors[1].p, []);
  assert.deepEqual(doors[2].p, []);
});

test("門座標以台服客戶端為準：上游有門清單時，v83 才有的門名整個丟掉、對得到的用上游座標", () => {
  // 仿 101030109：上游只有 west00，v83 另外多了一堆門名
  const south = { ...fixture.maps[100040000], portals: [{ name: "west00", pt: 2, x: -1861, y: 2077 }, { name: "in01", pt: 10, x: -1, y: -2 }] };
  const out = run({ upstreamMaps: { ...fixture.maps, 100040000: south } });
  const doors = out.maps.find(map => map.id === 100040000).doors;
  assert.deepEqual(doors.find(door => door.to === 100040001).p, [[-1, -2]]);
  assert.deepEqual(doors.find(door => door.to === 100030000).p, [[-1861, 2077]]);
  for (const target of [100040002, 100040003, 100040004]) {
    const door = doors.find(item => item.to === target);
    if (door) assert.deepEqual(door.p, [], `${target} 只有 v83 的門名`);
  }
});

test("門座標：上游完全沒有門清單的圖才用 v83／graph 的座標", () => {
  const bare = { ...fixture.maps[100040001], portals: [] };
  const out = run({ upstreamMaps: { ...fixture.maps, 100040001: bare } });
  const back = out.maps.find(map => map.id === 100040001).doors.find(door => door.to === 100040000);
  assert.deepEqual(back.p, [[-189, 277], [275, -1090]]);
});

test("擋住的圖不收", () => {
  const held = run({ heldBackMaps: new Map([[100000101, "測試"]]) });
  assert.ok(!held.index.maps.includes(100000101));
  assert.ok(!held.npcs.some(npc => npc.id === 1011001));
});

test("index 跟輸出一致、排好序", () => {
  assert.deepEqual(atlas.index.maps, atlas.maps.map(map => map.id));
  assert.deepEqual(atlas.index.npcs, atlas.npcs.map(npc => npc.id));
  assert.deepEqual(atlas.index.maps, [...atlas.index.maps].sort((a, b) => a - b));
  assert.deepEqual(atlas.index.npcs, [...atlas.index.npcs].sort((a, b) => a - b));
});

test("upstreamMaps 是陣列也吃", () => {
  const fromArray = run({ upstreamMaps: Object.values(fixture.maps) });
  assert.deepEqual(fromArray, atlas);
});

test("maps.json 沒被改", () => {
  const before = JSON.stringify(fixture.mapRecords);
  run();
  assert.equal(JSON.stringify(fixture.mapRecords), before);
});
