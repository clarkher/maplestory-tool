import assert from "node:assert/strict";
import { test } from "node:test";
import { inheritParentTrain, lintResearch, lintText, mapsNamedIn, mobsNotOnRow, normalizeReward, pqKeyOf, pqWindows, rowTextIssues, spawnTable } from "./guides.mjs";

test("攻略文字檢查：地圖編號、站內用語、屬性代碼、玩家 ID 都擋", () => {
  assert.deepEqual(lintText("人多可退到迷宮入口（106000300，黑斧木妖）").map(issue => issue.label), ["地圖／道具編號"]);
  assert.deepEqual(lintText("月妙組隊任務（站內無對應地圖名）").map(issue => issue.label), ["站內資料的內部用語"]);
  assert.deepEqual(lintText("近戰常搶不到（見 notWorth）").map(issue => issue.label), ["站內資料的內部用語"]);
  assert.deepEqual(lintText("危險的洞穴（未開放地區，見 notOpenYet）").map(issue => issue.label), ["站內資料的內部用語"]);
  assert.deepEqual(lintText("殭屍菇菇是不死系（el h:w）").map(issue => issue.label), ["屬性代碼"]);
  assert.deepEqual(lintText("混沌魔精靈怕暗（el d:w）").map(issue => issue.label), ["屬性代碼"]);
  assert.deepEqual(lintText("gappyhay493：40 等打冰獨眼獸").map(issue => issue.label), ["玩家 ID", "玩家署名"]);
});

test("攻略文字檢查：等級、數值、版本號不擋", () => {
  for (const text of ["Lv100 以上", "MP100 以上的怪", "經典版 V001", "AP295 實測", "清一輪 23,000 經驗", "弩約 170 萬楓幣",
    "舊版 PART1：瞬移→神聖之箭", "41~47 在猴子沼澤地Ⅲ；37 開始去猴沼 3 清底"]) {
    assert.deepEqual(lintText(text), [], text);
  }
});

test("玩家 ID 數字後面接字母、中間有大寫也擋", () => {
  assert.deepEqual(lintText("槍手線（w851228w 1~50 攻略）").map(issue => issue.label), ["玩家 ID"]);
  assert.deepEqual(lintText("團練必備；iAnChen520 說激勵先滿").map(issue => issue.label), ["玩家 ID"]);
});

test("英數暱稱當署名接冒號也擋（HSZERO：）", () => {
  assert.deepEqual(lintText("HSZERO：迅雷點滿較好").map(issue => issue.label), ["玩家署名"]);
  assert.deepEqual(lintText("近戰 42 等就能進。uranus7：蹭僧侶的天使猴").map(issue => issue.label), ["玩家署名"]);
});

test("網址不該寫在會上畫面的文字裡（放出處欄位）", () => {
  assert.deepEqual(lintText("同值亦見 https://mapleclassictools.com/guides/exp-table/ 那張表").map(issue => issue.label), ["網址"]);
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

test("技能點法每一步的 note 會畫在技能條上，要檢查；整條點法的 note 是研究備註，不檢查", () => {
  const research = {
    jobs: [{
      skillBuilds: [{
        label: "主流",
        note: "原文技能名＝站內幻化術",
        steps: [{ skillName: "激勵", to: 20, note: "團練必備；a7415820：激勵先滿" }],
      }],
    }],
  };
  const issues = lintResearch(research);
  assert.deepEqual([...new Set(issues.map(issue => issue.where))], ["jobs[0].skillBuilds[0].steps[0].note"]);
});

test("出處欄位（source、url）的網址不檢查", () => {
  const research = { expTable: { conflicts: [{ level: 73, values: [{ value: 1, source: "https://mapleclassictools.com/js/bundle.js" }] }] }, url: "https://x.y/z" };
  assert.deepEqual(lintResearch(research), []);
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
  // 永久獎勵（冒險家的戒指）不會隨等級過期，旗標要帶到輸出
  assert.deepEqual(normalizeReward({ label: "永久戒指", items: [1050018], permanent: true }, items).reward, { label: "永久戒指", items: [1050018], permanent: true });
  assert.throws(() => normalizeReward({ items: [1050018] }, items), /label/);
  // 錯誤訊息要說是哪個任務，不然研究檔 37 筆要一筆一筆找
  assert.throws(() => normalizeReward({ items: [1050018] }, items, "瑪亞和奇怪的藥"), /瑪亞和奇怪的藥.*label/);
});

// 出怪對照用的小表：地圖名照遊戲（有羅馬數字也有 Ⅲ），怪物 id 是真的
const SPAWNS = {
  maps: {
    105040303: { zh: "森林迷宮III", mobs: [3230100, 5130102] },
    105040304: { zh: "森林迷宮IV", mobs: [3230100, 5130102] },
    105090400: { zh: "寺院入口", mobs: [4230100] },
    105080000: { zh: "龍族狩獵場", mobs: [5130100, 2110200] },
    106000300: { zh: "勇士之村迷宮入口", mobs: [2130100, 3210100] },
    106000101: { zh: "火焰之地Ⅰ", mobs: [3210100] },
    106000105: { zh: "火焰之地Ⅴ", mobs: [3210100, 3210800] },
    105040306: { zh: "巨人之林", mobs: [5130102, 5150000] },
    107000400: { zh: "鱷魚潭Ⅱ", mobs: [5130103] },
    103000804: { zh: "組隊訓練場<最後階段>", mobs: [9300003] },
  },
  mobs: {
    3230100: "風獨眼獸", 5130102: "黑曜石巨人", 4230100: "冰獨眼獸", 5130100: "青龍", 2110200: "刺菇菇", 2130100: "黑斧木妖", 3210100: "火肥肥",
    3210800: "猴子", 5150000: "混種石巨人", 5130103: "黑鱷魚", 9300003: "超級綠水靈", 5130101: "石巨人", 4130100: "土龍", 3110100: "鱷魚",
  },
};

test("spawnTable：有台服刷怪點用刷怪點；完全沒有刷怪點的怪（樹妖王這類首領）才看地圖上有沒有宣告；沒中文名的圖不收", () => {
  const maps = { 1: { zh: "甲" }, 2: { zh: "乙" }, 3: {} };
  const monsters = [
    { id: 10, n: "有刷怪點", sp: [[1, 5, 0], [3, 5, 0]], maps: [1, 2, 3] },
    { id: 20, n: "首領", maps: [2] },
  ];
  assert.deepEqual(spawnTable(maps, monsters), {
    maps: { 1: { zh: "甲", mobs: [10] }, 2: { zh: "乙", mobs: [20] } },
    mobs: { 10: "有刷怪點", 20: "首領" },
  });
});

test("mapsNamedIn：一列寫好幾張圖都認得，羅馬數字跟 Ⅲ 算同一張，簡寫的集數會展開", () => {
  assert.deepEqual(mapsNamedIn("森林迷宮Ⅲ／寺院入口", SPAWNS).sort(), ["105040303", "105090400"]);
  assert.deepEqual(mapsNamedIn("火焰之地（Ⅰ／Ⅴ）火肥肥", SPAWNS).sort(), ["106000101", "106000105"]);
  assert.deepEqual(mapsNamedIn("火焰之地Ⅰ／Ⅴ 火肥肥", SPAWNS).sort(), ["106000101", "106000105"]);
  assert.deepEqual(mapsNamedIn("火焰之地Ⅰ～Ⅱ", SPAWNS), ["106000101"]);
  assert.deepEqual(mapsNamedIn("告示牌任務", SPAWNS), []);
});

test("mobsNotOnRow：寫的怪要在這張圖或這列寫到的其他圖", () => {
  const row = (name, map, mobs, pq) => ({ name, map, mobs, ...(pq ? { pq } : {}) });
  // 查核時抓到的真實案例：有一隻對得上（青龍）另一隻也要抓（土龍）
  assert.deepEqual(mobsNotOnRow(row("龍族狩獵場（青龍／土龍）", 105080000, [5130100, 4130100]), SPAWNS), [4130100]);
  assert.deepEqual(mobsNotOnRow(row("森林迷宮IV（石巨人／黑曜石巨人）", 105040304, [5130101, 5130102]), SPAWNS), [5130101]);
  // 一列寫兩張圖：怪在另一張也算
  assert.deepEqual(mobsNotOnRow(row("鱷魚潭Ⅱ（黑鱷魚）／巨人之林（混種石巨人）", 107000400, [5130103, 5150000]), SPAWNS), []);
  assert.deepEqual(mobsNotOnRow(row("火焰之地（Ⅰ／Ⅴ）火肥肥", 106000101, [3210100, 3210800]), SPAWNS), []);
  // 不判斷：沒有地圖、組隊任務（關卡裡的怪是任務叫出來的，刷怪表沒有）、地圖沒有出怪資料
  assert.deepEqual(mobsNotOnRow(row("一次性高經驗任務", null, [5130100]), SPAWNS), []);
  assert.deepEqual(mobsNotOnRow(row("超級綠水靈組隊任務", 103000804, [9300003, 3110100], "kerning"), SPAWNS), []);
  assert.deepEqual(mobsNotOnRow(row("某城鎮", 999, [5130100]), SPAWNS), []);
});

test("rowTextIssues：地圖名後面接的怪要真的在那張圖", () => {
  const issues = (name, why = "") => rowTextIssues({ name, why }, SPAWNS);
  assert.equal(issues("龍族狩獵場（青龍／土龍）").length, 1);
  assert.equal(issues("火焰之地Ⅰ", "人多可退到勇士之村迷宮入口（黑斧木妖＋刺菇菇）。").length, 1);
  // 兩張圖共用一個括號：每張都要出得到（森林迷宮III 沒有冰獨眼獸，寺院入口才有）
  assert.equal(issues("森林迷宮III／寺院入口（冰獨眼獸）").length, 1);
  assert.equal(issues("森林迷宮III 冰獨眼獸").length, 1);
  assert.equal(issues("森林迷宮III（不打石巨人）").length, 1);
});

test("rowTextIssues：寫對的、整類的、沒寫怪的、內文裡順口提到的都不算", () => {
  const issues = (name, why = "") => rowTextIssues({ name, why }, SPAWNS);
  assert.deepEqual(issues("龍族狩獵場（青龍）"), []);
  assert.deepEqual(issues("鱷魚潭Ⅱ（黑鱷魚）／巨人之林（混種石巨人）"), []);
  // 地圖名裡有怪名（鱷魚潭）不算在寫鱷魚
  assert.deepEqual(issues("鱷魚潭Ⅱ（6 人團）"), []);
  // 「石巨人系」是整類，圖上有黑曜石巨人就算
  assert.deepEqual(issues("巨人之林 石巨人系"), []);
  assert.deepEqual(issues("森林迷宮III（不打石巨人系）"), []);
  assert.deepEqual(issues("告示牌任務（土龍）"), []);
  assert.deepEqual(issues("鱷魚潭Ⅱ", "鱷魚潭Ⅱ 經驗遠比石巨人高。"), []);
  assert.deepEqual(issues("火焰之地（Ⅰ／Ⅴ）火肥肥"), []);
});

test("三轉攻略檔繼承二轉 70 等以上的練功段與無攻略段", () => {
  const outputs = new Map([
    ["310.json", { job: 310, train: [{ from: 30, to: 40, name: "黑肥肥領土" }, { from: 80, to: 100, name: "巨人之林" }], gaps: [{ from: 70, to: 80, t: "還沒有攻略" }] }],
    ["311.json", { job: 311, train: [], gaps: [] }],
    ["300.json", { job: 300, train: [{ from: 10, to: 20, name: "南部森林訓練場Ⅰ" }], gaps: [] }],
  ]);
  inheritParentTrain(outputs);
  assert.deepEqual(outputs.get("311.json").train.map(segment => segment.name), ["巨人之林"]);
  assert.deepEqual(outputs.get("311.json").gaps, [{ from: 70, to: 80, t: "還沒有攻略" }]);
  assert.equal(outputs.get("310.json").train.length, 2);
  assert.equal(outputs.get("300.json").train.length, 1);
});

test("組隊任務：研究檔有 why 就帶出去，沒有 guide 就不帶（女神組隊沒有懶人包圖解）", () => {
  const pqList = [
    { key: "moon", name: "月妙組隊任務", quest: "1200", match: "月妙", entrance: 100000200, guide: "/guide#pq-moon" },
    { key: "goddess", name: "女神組隊任務", quest: "1203", match: "女神", entrance: 200080101, why: "經驗比打野圖慢一點" },
  ];
  const trainByJob = new Map([[410, [{ from: 51, to: 70, kind: "party", name: "女神組隊任務（天空之城 疑問之塔）" }]]]);
  const [moon, goddess] = pqWindows(pqList, trainByJob);
  assert.equal(moon.guide, "/guide#pq-moon");
  assert.equal("why" in moon, false);
  assert.equal("guide" in goddess, false);
  assert.equal(goddess.why, "經驗比打野圖慢一點");
  assert.deepEqual(goddess.byJob, { 410: [51, 70] });
});
