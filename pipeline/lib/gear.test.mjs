import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allSourcesV002,
  buildScrolls,
  buildSource,
  buildWeapon,
  convertBefore,
  convertNotes,
  convertStatRules,
  dropSources,
  hasAnySource,
  isV002Quest,
  mergeSources,
  openMapFrom,
  parseScroll,
  questSources,
  WEAPON_TYPES,
} from "./gear.mjs";

/* ------------------------------------------------------------ parseScroll */

test("parseScroll：基本案例，成功率與效果都從說明解析", () => {
  const result = parseScroll({ n: "拳套攻擊卷軸60%", d: "拳套附加攻擊力提升屬性。 成功率：60%，物理攻擊力+2，命中率+1" });
  assert.deepEqual(result, { n: "拳套攻擊卷軸", slot: "拳套", stat: "攻擊", rate: 60, effect: "物理攻擊力+2，命中率+1" });
});

test("parseScroll：短劍卷軸的 slot 是短刀（道具種類叫短刀，卷軸說明寫短劍）", () => {
  const result = parseScroll({ n: "短劍攻擊卷軸10%", d: "短劍附加攻擊力提升屬性。 成功率：10%，物理攻擊力+5，LUK+3，物理防禦力+1" });
  assert.equal(result.slot, "短刀");
  assert.equal(result.n, "短劍攻擊卷軸");
  assert.equal(result.stat, "攻擊");
  assert.equal(result.rate, 10);
});

test("parseScroll：說明用「、」分隔也能正確取出 effect", () => {
  const result = parseScroll({ n: "手套攻擊卷軸60%", d: "手套附加攻擊力提升屬性。 成功率：60%、物理攻擊力+2" });
  assert.equal(result.effect, "物理攻擊力+2");
});

test("parseScroll：褲子卷軸 slot 正規化成褲裙、敏捷性正規化成敏捷", () => {
  const result = parseScroll({ n: "褲子敏捷性卷軸65%", d: "褲子附加敏捷提升屬性。 成功率：65%、DEX+2、命中率+1" });
  assert.equal(result.slot, "褲裙");
  assert.equal(result.stat, "敏捷");
  assert.equal(result.n, "褲子敏捷性卷軸");
});

test("parseScroll：耳環智力卷軸 → slot 耳環、stat 智力", () => {
  const result = parseScroll({ n: "耳環智力卷軸10%", d: "耳環附加智力提升屬性。 成功率：10%，魔法攻擊力+5，INT+3，魔法防禦力+1" });
  assert.equal(result.slot, "耳環");
  assert.equal(result.stat, "智力");
});

test("parseScroll：詛咒卷軸回 null（會壞裝，這版不推）", () => {
  assert.equal(parseScroll({ n: "上衣力量詛咒卷軸30%", d: "用來在上衣中附加力量屬性。 成功率：30%, 力量+3 若失敗時上衣會以50%的機率消失。" }), null);
  assert.equal(parseScroll({ n: "指虎命中詛咒卷軸30%", d: "在指虎中附加命中率屬性。 成功率：30%，命中率+5、敏捷+3、物理攻擊力+3 若失敗時道具會以50%的機率消失。" }), null);
});

test("parseScroll：名字不是「部位＋屬性＋卷軸」格式的（寵物、包包、週年慶活動名）回 null", () => {
  assert.equal(parseScroll({ n: "寵物跳躍力卷軸10%", d: "寵物附加跳躍力屬性。 成功率：10%，跳躍力+1" }), null);
  assert.equal(parseScroll({ n: "受到咀咒的包包的卷軸1%", d: "卷軸套用失敗減少的可升級次數恢復2。" }), null);
  assert.equal(parseScroll({ n: "[6週年] 手套力量卷軸70%", d: "用來在手套中附加力量屬性。 成功率：70%、力量+1" }), null);
  assert.equal(parseScroll({ n: "企鵝國王的單手劍攻擊卷軸10%", d: "單手劍附加攻擊力屬性。 成功率：10%，物理攻擊力+5" }), null);
  assert.equal(parseScroll({ n: "一級單手武器攻擊力卷軸40%", d: "單手武器附加攻擊力提升屬性。 成功率：40%、物理攻擊力+4 #c失敗時，道具以70%機率毀損。" }), null);
});

test("parseScroll：失敗處罰那段不算進 effect（非詛咒卷軸也可能有這段）", () => {
  const result = parseScroll({ n: "褲裙敏捷卷軸30%", d: "在褲裙中附加敏捷屬性。 成功率:30%, 敏捷+3, 命中率+2, 移動速度+1 若失敗時道具會以50%的機率消失。" });
  assert.equal(result.effect, "敏捷+3, 命中率+2, 移動速度+1");
});

test("parseScroll：說明用「成功機率」而不是「成功率」也能解析", () => {
  const result = parseScroll({ n: "火槍攻擊卷軸15%", d: "火槍附加攻擊力屬性。 成功機率：15%， 物理 攻擊力+5， 命中率+3， 敏捷+1" });
  assert.equal(result.rate, 15);
  assert.equal(result.effect, "物理 攻擊力+5， 命中率+3， 敏捷+1");
});

/* ------------------------------------------------------------ dropSources */

const openMap = openMapFrom({
  100000000: { zh: "弓箭手村" },
  200010000: { zh: "雲彩公園Ⅰ", o: "2026-10-15" },
  999999999: {}, // 沒有中文名＝未開放
});

test("dropSources：怪沒出現在任何已開放地圖 → 不收", () => {
  const monstersById = new Map([[1, { id: 1, n: "未開放怪", lv: 10, maps: [999999999] }]]);
  const result = dropSources({ dm: [1] }, monstersById, openMap);
  assert.deepEqual(result, []);
});

test("dropSources：只出現在 V002 地圖 → 帶 o", () => {
  const monstersById = new Map([[2, { id: 2, n: "雪怪", lv: 20, maps: [200010000] }]]);
  const result = dropSources({ dm: [2] }, monstersById, openMap);
  assert.deepEqual(result, [{ m: 2, n: "雪怪", lv: 20, map: 200010000, o: "2026-10-15" }]);
});

test("dropSources：有已開放地圖時優先用非 V002 的那張", () => {
  const monstersById = new Map([[3, { id: 3, n: "雙棲怪", lv: 15, maps: [200010000, 100000000] }]]);
  const result = dropSources({ dm: [3] }, monstersById, openMap);
  assert.deepEqual(result, [{ m: 3, n: "雙棲怪", lv: 15, map: 100000000 }]);
});

test("dropSources：依怪物等級排序、最多 8 隻", () => {
  const monstersById = new Map(
    Array.from({ length: 10 }, (_, index) => [index, { id: index, n: `怪${index}`, lv: 100 - index, maps: [100000000] }]),
  );
  const result = dropSources({ dm: Array.from({ length: 10 }, (_, index) => index) }, monstersById, openMap);
  assert.equal(result.length, 8);
  assert.deepEqual(result.map(row => row.lv), [91, 92, 93, 94, 95, 96, 97, 98]);
});

test("dropSources：沒有 dm 回空陣列", () => {
  assert.deepEqual(dropSources({}, new Map(), openMap), []);
});

/* ------------------------------------------------------------ questSources / isV002Quest */

const maps = { 211000001: { o: "2026-10-15" }, 101000003: { zh: "魔法森林圖書館" } };

test("isV002Quest：等級限制超過 100 算 V002", () => {
  assert.equal(isV002Quest({ minLv: 110 }, maps), true);
});

test("isV002Quest：接取地圖是 V002 地圖算 V002", () => {
  assert.equal(isV002Quest({ sNpc: { map: 211000001 } }, maps), true);
});

test("isV002Quest：接取地圖不是 V002、等級不超過 100、職業非全三轉 → 不算", () => {
  assert.equal(isV002Quest({ minLv: 30, sNpc: { map: 101000003 }, jobs: [200] }, maps), false);
});

test("isV002Quest：可接職業全是三轉代碼才算（混二轉不算）", () => {
  assert.equal(isV002Quest({ jobs: [111, 121] }, maps), true);
  assert.equal(isV002Quest({ jobs: [110, 111] }, maps), false);
});

test("questSources：只收站內查得到的任務、V002 任務帶 o", () => {
  const questsById = new Map([
    ["1", { id: "1", n: "任務一", minLv: 20 }],
    ["2", { id: "2", n: "任務二", minLv: 110 }],
  ]);
  const result = questSources({ qr: ["1", "2", "999"] }, questsById, maps, "2026-10-15");
  assert.deepEqual(result, [
    { id: "1", n: "任務一", minLv: 20 },
    { id: "2", n: "任務二", minLv: 110, o: "2026-10-15" },
  ]);
});

test("questSources：任務限定職業帶 jobs、這個道具的獎勵限定職業帶 rj（前端照玩家職業過濾）", () => {
  const questsById = new Map([
    ["10", { id: "10", n: "劍士才能接", jobs: [100, 110, 111], rewardItems: [{ id: 2044001, n: "弓攻擊卷軸10%" }] }],
    ["11", { id: "11", n: "獎勵分職業", rewardItems: [{ id: 2044001, n: "弓攻擊卷軸10%", job: 8200 }, { id: 2043001, n: "別的" }] }],
    ["12", { id: "12", n: "誰都能接", rewardItems: [{ id: 2044001, n: "弓攻擊卷軸10%" }] }],
  ]);
  const result = questSources({ id: 2044001, qr: ["10", "11", "12"] }, questsById, maps, "2026-10-15");
  assert.deepEqual(result, [
    { id: "10", n: "劍士才能接", jobs: [100, 110, 111] },
    { id: "11", n: "獎勵分職業", rj: 8200 },
    { id: "12", n: "誰都能接" },
  ]);
});

test("questSources：查不到的任務 id 略過並呼叫 warn", () => {
  const warnings = [];
  const result = questSources({ id: 1, n: "測試道具", qr: ["999"] }, new Map(), maps, "2026-10-15", message => warnings.push(message));
  assert.deepEqual(result, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /測試道具.*999/);
});

/* ------------------------------------------------------------ buildSource / allSourcesV002 / hasAnySource */

test("buildSource：商店、掉落、任務合成一個 GearSource，沒有的欄位不給", () => {
  const monstersById = new Map([[5, { id: 5, n: "小怪", lv: 5, maps: [100000000] }]]);
  const questsById = new Map([["1", { id: "1", n: "任務一" }]]);
  const src = buildSource(
    { sh: 2, dm: [5], qr: ["1"] },
    { monstersById, questsById, maps: { 100000000: { zh: "弓箭手村" } }, openMap, v002Date: "2026-10-15" },
  );
  assert.deepEqual(src, { shop: 2, drops: [{ m: 5, n: "小怪", lv: 5, map: 100000000 }], quests: [{ id: "1", n: "任務一" }] });
});

test("hasAnySource / allSourcesV002", () => {
  assert.equal(hasAnySource({}), false);
  assert.equal(hasAnySource({ shop: 1 }), true);
  assert.equal(allSourcesV002({ shop: 1, drops: [{ o: "2026-10-15" }] }), false);
  assert.equal(allSourcesV002({ drops: [{ o: "2026-10-15" }] }), true);
  assert.equal(allSourcesV002({ drops: [{ o: "2026-10-15" }, { m: 1 }] }), false);
  assert.equal(allSourcesV002({}), false);
});

/* ------------------------------------------------------------ mergeSources */

test("mergeSources：掉落依怪物 id 去重、依等級排序、商店取最大", () => {
  const merged = mergeSources([
    { shop: 2, drops: [{ m: 1, n: "怪1", lv: 30, map: 1 }] },
    { shop: 5, drops: [{ m: 1, n: "怪1", lv: 30, map: 1 }, { m: 2, n: "怪2", lv: 10, map: 1 }] },
  ]);
  assert.deepEqual(merged, { shop: 5, drops: [{ m: 2, n: "怪2", lv: 10, map: 1 }, { m: 1, n: "怪1", lv: 30, map: 1 }] });
});

/* ------------------------------------------------------------ buildScrolls（含合併案例） */

test("buildScrolls：同名同成功率兩個 id，一個有掉落一個沒有 → 合併成一筆，src 合併，id 取拿得到的那個", () => {
  const items = [
    { id: 999, n: "手套攻擊卷軸 60%", d: "手套附加攻擊力提升屬性。 成功率：60%，物理攻擊力+2" }, // 沒有來源
    { id: 500, n: "手套攻擊卷軸60%", d: "手套附加攻擊力提升屬性。 成功率：60%，物理攻擊力+2", dm: [5], qr: ["1"] },
  ];
  const monstersById = new Map([[5, { id: 5, n: "小怪", lv: 5, maps: [100000000] }]]);
  const questsById = new Map([["1", { id: "1", n: "任務一" }]]);
  const ctx = { monstersById, questsById, maps: { 100000000: { zh: "弓箭手村" } }, openMap, v002Date: "2026-10-15" };
  const scrolls = buildScrolls(items, ctx);
  assert.equal(scrolls.length, 1);
  assert.equal(scrolls[0].id, 500);
  assert.equal(scrolls[0].n, "手套攻擊卷軸");
  assert.deepEqual(scrolls[0].src, { drops: [{ m: 5, n: "小怪", lv: 5, map: 100000000 }], quests: [{ id: "1", n: "任務一" }] });
});

test("buildScrolls：完全沒有來源的卷軸不收（事件卷軸會因此自然被濾掉）", () => {
  const items = [{ id: 1, n: "[6週年] 手套力量卷軸70%", d: "用來在手套中附加力量屬性。 成功率：70%、力量+1" }];
  const ctx = { monstersById: new Map(), questsById: new Map(), maps: {}, openMap, v002Date: "2026-10-15" };
  assert.deepEqual(buildScrolls(items, ctx), []);
});

test("buildScrolls：全部來源都只在 V002 才有 → 卷軸帶 o", () => {
  const items = [{ id: 1, n: "手套攻擊卷軸60%", d: "手套附加攻擊力提升屬性。 成功率：60%，物理攻擊力+2", dm: [5] }];
  const monstersById = new Map([[5, { id: 5, n: "雪怪", lv: 20, maps: [200010000] }]]);
  const ctx = { monstersById, questsById: new Map(), maps: { 200010000: { zh: "雲彩公園Ⅰ", o: "2026-10-15" } }, openMap, v002Date: "2026-10-15" };
  const scrolls = buildScrolls(items, ctx);
  assert.equal(scrolls.length, 1);
  assert.equal(scrolls[0].o, "2026-10-15");
});

/* ------------------------------------------------------------ buildWeapon */

test("buildWeapon：組出 GearWeapon，沒寫的需求欄位不給", () => {
  const item = {
    id: 1432004, n: "丈八蛇矛", c: "裝備", s: "槍",
    eq: { reqLevel: 50, reqJob: 1, reqSTR: 160, incPAD: 72, tuc: 7, islot: "Wp", attackSpeed: 6 },
    dm: [5],
  };
  const monstersById = new Map([[5, { id: 5, n: "怪", lv: 50, maps: [100000000] }]]);
  const ctx = { monstersById, questsById: new Map(), maps: { 100000000: { zh: "弓箭手村" } }, openMap, v002Date: "2026-10-15" };
  const weapon = buildWeapon(item, ctx);
  assert.equal(weapon.id, 1432004);
  assert.equal(weapon.s, "槍");
  assert.equal(weapon.lv, 50);
  assert.equal(weapon.atk, 72);
  assert.equal(weapon.mag, undefined);
  assert.equal(weapon.spd, 6);
  assert.deepEqual(weapon.req, { STR: 160 });
  assert.equal(weapon.job, 1);
  assert.equal(weapon.tuc, 7);
  assert.equal(weapon.o, undefined);
});

test("buildWeapon：完全沒有來源的武器回 null（不編造拿不到的裝備）", () => {
  const item = { id: 1, n: "絕版劍", c: "裝備", s: "單手劍", eq: { reqLevel: 10 } };
  const ctx = { monstersById: new Map(), questsById: new Map(), maps: {}, openMap, v002Date: "2026-10-15" };
  assert.equal(buildWeapon(item, ctx), null);
});

test("WEAPON_TYPES：16 種武器種類", () => {
  assert.equal(WEAPON_TYPES.length, 16);
  for (const type of ["單手劍", "雙手劍", "單手斧", "雙手斧", "單手棍", "雙手棍", "槍", "矛", "短杖", "長杖", "弓", "弩", "拳套", "短刀", "指虎", "火槍"]) {
    assert.ok(WEAPON_TYPES.includes(type), type);
  }
});

/* ------------------------------------------------------------ 研究檔轉換：缺檔或缺欄位不能失敗 */

test("convertStatRules / convertNotes / convertBefore：沒有研究檔時給空陣列、before 不給", () => {
  assert.deepEqual(convertStatRules(undefined), []);
  assert.deepEqual(convertNotes(undefined), []);
  assert.equal(convertBefore(undefined), undefined);
});

test("convertStatRules：text／sources／verified 轉成 t／s／v，其餘欄位照帶", () => {
  const result = convertStatRules([
    { jobs: [200], label: "主流", main: "INT", secondary: null, text: "全智", sources: ["x"], verified: "tw", mainstream: true },
  ]);
  assert.deepEqual(result, [{ jobs: [200], label: "主流", main: "INT", secondary: null, t: "全智", s: ["x"], v: "tw", mainstream: true }]);
});

test("convertNotes：items 欄位有才帶", () => {
  const result = convertNotes([{ jobs: [100], topic: "weapon", text: "備註", sources: ["x"], verified: "community" }]);
  assert.deepEqual(result, [{ jobs: [100], topic: "weapon", t: "備註", s: ["x"], v: "community" }]);
});

test("convertBefore：轉成 t／s／v", () => {
  assert.deepEqual(convertBefore({ text: "轉職前自動配點", sources: ["x"], verified: "tw" }), { t: "轉職前自動配點", s: ["x"], v: "tw" });
});
