import assert from "node:assert/strict";
import { test } from "node:test";
import { NPC_WARPS, gateLevels, npcWarpEdges } from "./npc-warps.mjs";

const ICE_VALLEY_2 = 211040200;
const SHARP_CLIFF_1 = 211040300;
const jeff = { slot: "14", npcId: 2030000, name: "傑夫", x: -29, y: -2585 };
const upstreamMaps = [
  { id: ICE_VALLEY_2, name: "冰雪峽谷Ⅱ", npcSpawns: [jeff, { npcId: 2030009, name: "格里巴", x: 363, y: -2077 }] },
  { id: SHARP_CLIFF_1, name: "尖銳的絕壁Ⅰ", npcSpawns: [] },
];

test("冰雪峽谷Ⅱ的傑夫送到尖銳的絕壁Ⅰ：NPC 名字、站的位置、座標照台服客戶端，50 等以上（參考舊版）", () => {
  assert.deepEqual(npcWarpEdges(upstreamMaps), [[ICE_VALLEY_2, [SHARP_CLIFF_1, "npc:傑夫:最上面", -29, -2585, 50]]]);
});

test("上游那張圖上已經沒有這個 NPC（換圖、拿掉）就不給這條路，不憑表裡的舊資料硬接", () => {
  const moved = [{ id: ICE_VALLEY_2, name: "冰雪峽谷Ⅱ", npcSpawns: [{ npcId: 2030009, name: "格里巴", x: 363, y: -2077 }] }];
  assert.deepEqual(npcWarpEdges(moved), []);
  assert.deepEqual(npcWarpEdges([]), []);
});

test("NPC 名字用客戶端當下的（改名就跟著換），客戶端沒給名字就不給這條路", () => {
  const renamed = [{ id: ICE_VALLEY_2, npcSpawns: [{ ...jeff, name: "傑弗" }] }];
  assert.equal(npcWarpEdges(renamed)[0][1][1], "npc:傑弗:最上面");
  const unnamed = [{ id: ICE_VALLEY_2, npcSpawns: [{ ...jeff, name: "" }] }];
  assert.deepEqual(npcWarpEdges(unnamed), []);
});

test("表裡每一筆都寫了出處、站的位置、送到哪（不准沒來源的路混進來）", () => {
  assert.ok(NPC_WARPS.length >= 1);
  for (const warp of NPC_WARPS) {
    assert.ok(Number.isInteger(warp.from) && Number.isInteger(warp.to) && Number.isInteger(warp.npc), JSON.stringify(warp));
    assert.match(warp.spot, /\S/);
    assert.match(warp.source, /\S{10,}/);
    if (warp.minLevel !== undefined) assert.ok(Number.isInteger(warp.minLevel) && warp.minLevel > 0);
  }
});

test("每張圖要幾等才走得到：只有過傑夫才到得了的圖記 50，不用等級就走得到的、怎樣都走不到的不記", () => {
  const TOWN = 1, VALLEY = 2, CLIFF = 3, WOLF = 4, ALONE = 5, BACK = 6;
  const edges = {
    [TOWN]: [[VALLEY, "east00", 0, 0]],
    [VALLEY]: [[TOWN, "west00", 0, 0], [CLIFF, "npc:傑夫:最上面", -29, -2585, 50]],
    [CLIFF]: [[VALLEY, "under00", 0, 0], [WOLF, "top00", 0, 0], [BACK, "east00", 0, 0]],
    [BACK]: [[TOWN, "out00", 0, 0]],
  };
  // BACK 從 CLIFF 也走得到，但它自己往城鎮有門——反過來從城鎮走不到 BACK，所以一樣要 50 等
  assert.deepEqual(gateLevels(edges, [TOWN]), { [CLIFF]: 50, [WOLF]: 50, [BACK]: 50 });
  assert.equal(gateLevels(edges, [TOWN])[ALONE], undefined);
  assert.deepEqual(gateLevels({ [TOWN]: [[VALLEY, "east00", 0, 0]] }, [TOWN]), {});
});

test("同一張圖有不用等級的路，就不記等級（傑夫之外還有門）", () => {
  const edges = {
    1: [[2, "npc:傑夫:最上面", 0, 0, 50], [3, "east00", 0, 0]],
    3: [[2, "top00", 0, 0]],
  };
  assert.deepEqual(gateLevels(edges, [1]), {});
});

test("兩個門檻：照放行的等級記比較低的那個", () => {
  const edges = {
    1: [[2, "npc:甲:左邊", 0, 0, 70], [3, "npc:乙:右邊", 0, 0, 50]],
    3: [[2, "east00", 0, 0]],
  };
  assert.deepEqual(gateLevels(edges, [1]), { 3: 50, 2: 50 });
});
