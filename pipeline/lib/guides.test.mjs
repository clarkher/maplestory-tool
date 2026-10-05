import assert from "node:assert/strict";
import { test } from "node:test";
import { lintResearch, lintText, normalizeReward, pqKeyOf, pqWindows } from "./guides.mjs";

test("攻略文字檢查：地圖編號、站內用語、屬性代碼、玩家 ID 都擋", () => {
  assert.deepEqual(lintText("人多可退到迷宮入口（106000300，黑斧木妖）").map(issue => issue.label), ["地圖／道具編號"]);
  assert.deepEqual(lintText("月妙組隊任務（站內無對應地圖名）").map(issue => issue.label), ["站內資料的內部用語"]);
  assert.deepEqual(lintText("殭屍菇菇是不死系（el h:w）").map(issue => issue.label), ["屬性代碼"]);
  assert.deepEqual(lintText("gappyhay493：40 等打冰獨眼獸").map(issue => issue.label), ["玩家 ID"]);
});

test("攻略文字檢查：等級、數值、版本號不擋", () => {
  for (const text of ["Lv100 以上", "MP100 以上的怪", "經典版 V001", "AP295 實測", "清一輪 23,000 經驗", "弩約 170 萬楓幣"]) {
    assert.deepEqual(lintText(text), [], text);
  }
});

test("只檢查會上畫面的欄位，出處與研究備註不檢查", () => {
  const research = {
    jobs: [{ training: [{ mapName: "黑肥肥領土", why: "gappyhay493 推", sources: ["https://x/1234567890"], note: "站內 mapId" }] }],
  };
  const issues = lintResearch(research);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].where, "jobs[0].training[0].why");
  assert.equal(issues[0].label, "玩家 ID");
});

const PQ_LIST = [
  { key: "moon", name: "月妙組隊任務", match: "月妙", entrance: 100000200, guide: "/guide" },
  { key: "kerning", name: "超級綠水靈組隊任務", match: "超綠|超級綠水靈|第一次同行", entrance: 103000000, guide: "/guide" },
];

test("組隊任務的等級範圍：同一職業多段合併、只看組隊段落", () => {
  const trainByJob = new Map([
    [100, [
      { from: 13, to: 20, kind: "party", name: "月妙組隊任務（弓箭手村邱比特公園）" },
      { from: 20, to: 30, kind: "party", name: "月妙組隊任務「打豬」" },
      { from: 25, to: 30, kind: "party", name: "超級綠水靈組隊任務（墮落城市）" },
      { from: 25, to: 30, kind: "solo", name: "月妙附近練功" },
    ]],
  ]);
  const result = pqWindows(PQ_LIST, trainByJob);
  assert.deepEqual(result.map(pq => pq.key), ["moon", "kerning"]);
  assert.deepEqual(result[0].byJob, { 100: [13, 30] });
  assert.deepEqual(result[1].byJob, { 100: [25, 30] });
  assert.equal(result[0].entrance, 100000200);
});

test("組隊任務的等級範圍裁進遊戲的等級限制，沒有上限就用等級上限", () => {
  const trainByJob = new Map([
    [200, [{ from: 21, to: 31, kind: "party", name: "超級綠水靈組隊任務（墮落城市）" }]],
    [300, [{ from: 8, to: 30, kind: "party", name: "月妙組隊任務" }]],
  ]);
  const quests = new Map([["1200", { minLv: 10 }], ["1201", { minLv: 21, maxLv: 30 }]]);
  const warnings = [];
  const pqList = [{ ...PQ_LIST[0], quest: "1200" }, { ...PQ_LIST[1], quest: "1201" }];
  const result = pqWindows(pqList, trainByJob, { quests, levelCap: 100, warn: line => warnings.push(line) });
  assert.deepEqual(result[0].byJob, { 300: [10, 30] });
  assert.deepEqual(result[1].byJob, { 200: [21, 30] });
  assert.equal(warnings.length, 2);
  assert.match(warnings[1], /超級綠水靈組隊任務.*200.*21–31.*21–30/);
});

test("組隊任務的等級範圍整段超出遊戲限制時整筆拿掉，並列警告", () => {
  const trainByJob = new Map([
    [110, [{ from: 31, to: 35, kind: "party", name: "超級綠水靈組隊任務（打到 31 等）" }]],
    [100, [{ from: 25, to: 30, kind: "party", name: "超級綠水靈組隊任務（墮落城市）" }]],
  ]);
  const warnings = [];
  const pqList = [{ ...PQ_LIST[1], quest: "1201" }];
  const result = pqWindows(pqList, trainByJob, { quests: new Map([["1201", { minLv: 21, maxLv: 30 }]]), levelCap: 100, warn: line => warnings.push(line) });
  assert.deepEqual(result[0].byJob, { 100: [25, 30] });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /110.*31–35.*拿掉/);
});

test("一個段落同時提到兩個組隊任務時，算第一個", () => {
  assert.equal(pqKeyOf(PQ_LIST, { kind: "party", name: "月妙組隊任務（打豬，最推薦）／超綠組隊任務（不推薦）" }), "moon");
  assert.equal(pqKeyOf(PQ_LIST, { kind: "solo", name: "月妙組隊任務" }), undefined);
});

test("關鍵獎勵：只留站內有的道具，沒有 label 就報錯", () => {
  const items = new Set([1050018, 1051017]);
  assert.deepEqual(normalizeReward({ label: "桑那服", items: [1050018, 1051017, 9999999] }, items), {
    reward: { label: "桑那服", items: [1050018, 1051017] },
    dropped: [9999999],
  });
  assert.deepEqual(normalizeReward(undefined, items), { reward: undefined, dropped: [] });
  assert.throws(() => normalizeReward({ items: [1050018] }, items), /label/);
});
