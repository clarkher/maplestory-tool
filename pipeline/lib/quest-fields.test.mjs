import assert from "node:assert/strict";
import { test } from "node:test";
import { givenRewardRows, rewardSkillNames, splitPreQuests, splitStartNone } from "./quest-fields.mjs";

// data/client/quest-start-none.json 的 none：任務 id → 接取條件裡 count 沒寫（＝不能有）的道具
const none = { 1115: [4031683], 2215: [4031894] };
const love = { id: 4031683, n: "瑪亞的愛情象徵", c: 1 };

test("客戶端寫「不能有」的道具搬到 startNone，數量拿掉（上游補的 1 不是真的）", () => {
  assert.deepEqual(splitStartNone("1115", [love], none), { startItems: undefined, startNone: [{ id: 4031683, n: "瑪亞的愛情象徵" }] });
});

test("客戶端寫了數量的照舊是「身上要有」", () => {
  const sword = { id: 1302014, n: "舊戰劍", c: 1 };
  assert.deepEqual(splitStartNone("2048", [sword], none), { startItems: [sword], startNone: undefined });
});

test("同一個任務兩種都有：只搬客戶端寫不能有的那件", () => {
  const paper = { id: 4031894, n: "弄皺的紙張碎片", c: 1 };
  const other = { id: 4000001, n: "菇菇寶貝傘", c: 40 };
  assert.deepEqual(splitStartNone("2215", [other, paper], none), {
    startItems: [other],
    startNone: [{ id: 4031894, n: "弄皺的紙張碎片" }],
  });
});

test("客戶端沒有這個任務（比上游舊）：照上游寫「身上要有」", () => {
  const juice = { id: 4031200, n: "食人花汁", c: 1 };
  assert.deepEqual(splitStartNone("3069", [juice], none), { startItems: [juice], startNone: undefined });
});

test("沒有接取道具：兩個都是 undefined", () => {
  assert.deepEqual(splitStartNone("1115", undefined, none), { startItems: undefined, startNone: undefined });
});

// 流浪煉金術師的新技術（6000）獎勵三個神匠之魂：1003 冒險家、10001003 皇家騎士團、20001003 狂狼勇士——經典版只有冒險家
const skillsById = new Map([[1003, { id: 1003, n: "神匠之魂" }]]);

test("獎勵技能寫站上有的技能名，別的職業線（站上沒有）略過", () => {
  assert.deepEqual(rewardSkillNames([1003, 10001003, 20001003], skillsById), ["神匠之魂"]);
});

test("一個都查不到、或沒有獎勵技能：undefined（細節不寫那一行）", () => {
  assert.equal(rewardSkillNames([10001003], skillsById), undefined);
  assert.equal(rewardSkillNames(undefined, skillsById), undefined);
});

test("獎勵清單只留真的會給的：收走的、數量 0 的都不算", () => {
  const given = { id: 2000000, count: 30, action: "give" };
  const removed = { id: 4031856, count: -15, action: "remove" };
  // 打手指南：交 15 個強大力量結晶，上游獎勵寫同一個道具 count 0、action give
  const handedIn = { id: 4031856, count: 0, action: "give" };
  assert.deepEqual(givenRewardRows([given, removed, handedIn]), [given]);
});

test("獎勵沒寫數量的留著（只有明寫 0 才拿掉）", () => {
  const noCount = { id: 2000000, action: "give" };
  assert.deepEqual(givenRewardRows([noCount]), [noCount]);
});

// 站上有的任務（buildQuests 濾完的編號）
const listed = new Set(["2020", "2023", "2081", "2079"]);
const nothing = { pre: undefined, preDoing: undefined, preNot: undefined };

test("前置照上游的狀態分：已完成進 pre；進行中也進 pre，另外記在 preDoing", () => {
  assert.deepEqual(splitPreQuests([{ id: 2081, state: 2 }, { id: 2020, state: 1 }], listed), {
    pre: ["2081", "2020"],
    preDoing: ["2020"],
    preNot: undefined,
  });
});

test("未開始跟沒寫都是「不能接過」，不算前置", () => {
  assert.deepEqual(splitPreQuests([{ id: 2079, state: 0 }, { id: 2023 }], listed), {
    pre: undefined,
    preDoing: undefined,
    preNot: ["2079", "2023"],
  });
});

test("不能接過的任務站上沒有就不留：玩家接不到，這個條件一定成立（不明人士的 3246）", () => {
  assert.deepEqual(splitPreQuests([{ id: 3246, state: 0 }], listed), nothing);
});

test("要先完成的任務站上查不到照留（師父的後悔的 69044）", () => {
  assert.deepEqual(splitPreQuests([{ id: 69044, state: 2 }], listed), { pre: ["69044"], preDoing: undefined, preNot: undefined });
});

test("上游只給編號、沒帶狀態：照「要先完成」", () => {
  assert.deepEqual(splitPreQuests([2081], listed), { pre: ["2081"], preDoing: undefined, preNot: undefined });
});

test("沒有前置：三個都不寫", () => {
  assert.deepEqual(splitPreQuests(undefined, listed), nothing);
  assert.deepEqual(splitPreQuests([], listed), nothing);
});
