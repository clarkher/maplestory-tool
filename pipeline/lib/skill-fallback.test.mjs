import assert from "node:assert/strict";
import { test } from "node:test";
import { fillLostFields, snapshotSkillValues } from "./skill-fallback.mjs";

// 字串照抄上游 2026-10-15 的 skills-data.js（遊戲版本 2.0.0）：熟練度 #M 整個沒抽到，說明直接留著「#M%」，
// 同一個技能其他欄位也一起不見（values 是空的）。前一版的數值照抄站上 1.15.1 的 public/data/skills.json。

const fireArrow = {
  id: 2101004,
  name: "火焰箭",
  formula: "消耗MP#mpCon, 攻擊力#mad，熟練度#M%",
  valueFields: [],
  valueLabels: {},
  levels: [
    { level: 1, description: "消耗MP14, 攻擊力33，熟練度#M%", values: {} },
    { level: 2, description: "消耗MP14, 攻擊力36，熟練度#M%", values: {} },
    { level: 3, description: "消耗MP14, 攻擊力39，熟練度#M%", values: {} },
  ],
};
const fireArrowPrev = {
  labels: { mpCon: "消耗 MP", mad: "魔法攻擊力", M: "熟練度" },
  levels: [
    { mpCon: 14, mad: 33, M: 15 },
    { mpCon: 14, mad: 36, M: 15 },
    { mpCon: 14, mad: 39, M: 15 },
  ],
};

test("整列數值不見（火焰箭）：說明原文跟前一版數值代進樣板一樣，三個欄位都用前一版的補，說明裡的 #M 換成數字", () => {
  const out = fillLostFields(fireArrow, fireArrowPrev);
  assert.deepEqual(out.filled, ["mpCon", "mad", "M"]);
  assert.equal(out.mismatch, undefined);
  assert.deepEqual(out.levels.map(level => level.values), fireArrowPrev.levels);
  assert.deepEqual(
    out.levels.map(level => level.description),
    ["消耗MP14, 攻擊力33，熟練度15%", "消耗MP14, 攻擊力36，熟練度15%", "消耗MP14, 攻擊力39，熟練度15%"],
  );
  assert.deepEqual(out.labels, { mpCon: "消耗 MP", mad: "魔法攻擊力", M: "熟練度" });
});

test("上游留下來的欄位、表頭照用上游的，只補不見的（精準之劍：上游還有命中率的表頭）", () => {
  const sword = {
    id: 1100000,
    name: "精準之劍",
    formula: "劍系列武器的熟練度+#M%，命中率+#x",
    valueFields: [],
    valueLabels: { x: "命中率" },
    levels: [
      { level: 1, description: "劍系列武器的熟練度+#M%，命中率+1", values: {} },
      { level: 2, description: "劍系列武器的熟練度+#M%，命中率+2", values: {} },
    ],
  };
  const prev = { labels: { x: "命中率", M: "熟練度" }, levels: [{ M: 15, x: 1 }, { M: 15, x: 2 }] };
  const out = fillLostFields(sword, prev);
  assert.deepEqual(out.filled, ["M", "x"]);
  assert.deepEqual(out.levels.map(level => level.values), [{ M: 15, x: 1 }, { M: 15, x: 2 }]);
  // 前一版的說明在「，」後面多一個空白，比對時不看空白
  assert.equal(out.levels[0].description, "劍系列武器的熟練度+15%，命中率+1");
  assert.deepEqual(out.labels, { x: "命中率", M: "熟練度" });
});

test("代號被上游當顏色碼切掉（虎咆哮 #rb 的 #r 被拿掉、說明剩「攻擊範圍 b%」）：也當萬用字元，換回數字", () => {
  const roar = {
    id: 1111008,
    name: "虎咆哮",
    formula: "消耗MP#mpCon, 攻擊力#damage%, 攻擊範圍 #rb%, 以#prop%機率出現昏迷攻擊，持續#time秒",
    valueFields: [],
    valueLabels: {},
    levels: [{ level: 1, description: "消耗MP8, 攻擊力11%, 攻擊範圍 b%, 以52%機率出現昏迷攻擊，持續5秒", values: {} }],
  };
  const prev = {
    labels: { mpCon: "消耗 MP", damage: "傷害", rb: "範圍", prop: "機率", time: "持續時間" },
    levels: [{ mpCon: 8, damage: 11, rb: 110, prop: 52, time: 5 }],
  };
  const out = fillLostFields(roar, prev);
  assert.deepEqual(out.filled, ["mpCon", "damage", "rb", "prop", "time"]);
  assert.equal(out.levels[0].description, "消耗MP8, 攻擊力11%, 攻擊範圍 110%, 以52%機率出現昏迷攻擊，持續5秒");
  assert.deepEqual(out.levels[0].values, prev.levels[0]);
});

test("說明比樣板多或少空白（「熟練度#M%, 攻擊範圍b」）照樣認得；說明裡其他字一個不同就不補", () => {
  const meteor = {
    formula: "消耗MP#mpCon. 基本攻擊力#mad, 熟練度#M%, 攻擊範圍 #rb",
    levels: [{ level: 1, description: "消耗MP21. 基本攻擊力60, 熟練度#M%, 攻擊範圍b", values: {} }],
  };
  const prev = { labels: {}, levels: [{ mpCon: 21, mad: 60, M: 15, rb: 110 }] };
  assert.equal(fillLostFields(meteor, prev).levels[0].description, "消耗MP21. 基本攻擊力60, 熟練度15%, 攻擊範圍110");
  const reworded = { ...meteor, levels: [{ level: 1, description: "消耗MP21. 基本攻擊力60, 熟練度#M%, 攻擊範圍：b", values: {} }] };
  assert.match(fillLostFields(reworded, prev).mismatch, /第 1 級/);
});

test("這一版真的改了數字（說明看得到的數字跟前一版不一樣）：只收說明裡的數字，看不到的熟練度不拿舊的猜", () => {
  const changed = {
    ...fireArrow,
    levels: [
      { level: 1, description: "消耗MP14, 攻擊力40，熟練度#M%", values: {} },
      { level: 2, description: "消耗MP14, 攻擊力36，熟練度#M%", values: {} },
      { level: 3, description: "消耗MP14, 攻擊力39，熟練度#M%", values: {} },
    ],
  };
  const out = fillLostFields(changed, fireArrowPrev);
  assert.equal(out.filled, undefined);
  assert.deepEqual(out.changed, ["mpCon", "mad"]);
  assert.deepEqual(out.levels.map(level => level.values), [{ mpCon: 14, mad: 40 }, { mpCon: 14, mad: 36 }, { mpCon: 14, mad: 39 }]);
  assert.equal(out.levels[0].description, "消耗MP14, 攻擊力40，熟練度#M%");
  assert.deepEqual(out.labels, { mpCon: "消耗 MP", mad: "魔法攻擊力" });
});

test("神聖祈禱（2.0.0 持續時間每級 +1 秒、代號 #y 改名 #time）：說明有前一版沒有的數字＝改過，看不到的隊員經驗不拿舊的補", () => {
  const symbol = {
    formula: "消耗MP#mpCon, 持續#time秒 隊員的取得經驗值#xAddHun%",
    valueLabels: {},
    levels: [{ level: 1, description: "消耗MP51, 持續33秒 隊員的取得經驗值#xAddHun%", values: {} }],
  };
  const prev = { labels: { mpCon: "消耗 MP", y: "持續時間", xAddHun: "經驗" }, levels: [{ mpCon: 51, y: 32, xAddHun: 102 }] };
  const out = fillLostFields(symbol, prev);
  assert.equal(out.filled, undefined);
  assert.deepEqual(out.changed, ["mpCon"]);
  assert.deepEqual(out.levels[0].values, { mpCon: 51 });
  assert.equal(out.levels[0].description, "消耗MP51, 持續33秒 隊員的取得經驗值#xAddHun%");
});

test("龍咆哮（2.0.0 的 10 級間隔 3→4 秒）：攻擊力、HP、間隔照說明，被切掉的攻擊範圍留空", () => {
  const roar = {
    formula: "消耗MP#mpCon、HP#x%, 攻擊力#damage%, 攻擊範圍#rb%, 技能間隔時間#y秒",
    valueLabels: {},
    levels: [
      { level: 1, description: "消耗MP16、HP59%, 攻擊力96%, 攻擊範圍b%, 技能間隔時間4秒", values: {} },
      { level: 2, description: "消耗MP16、HP50%, 攻擊力150%, 攻擊範圍b%, 技能間隔時間4秒", values: {} },
    ],
  };
  const prev = {
    labels: { mpCon: "消耗 MP", x: "HP", damage: "傷害", rb: "範圍", y: "間隔" },
    levels: [{ mpCon: 16, x: 59, damage: 96, rb: 110, y: 4 }, { mpCon: 16, x: 50, damage: 150, rb: 200, y: 3 }],
  };
  const out = fillLostFields(roar, prev);
  assert.deepEqual(out.changed, ["mpCon", "x", "damage", "y"]);
  assert.deepEqual(out.levels[1].values, { mpCon: 16, x: 50, damage: 150, y: 4 });
  assert.equal(out.levels[1].description, "消耗MP16、HP50%, 攻擊力150%, 攻擊範圍b%, 技能間隔時間4秒");
});

test("級數跟前一版不一樣（改版改了上限）：不補、回 mismatch", () => {
  const out = fillLostFields(fireArrow, { ...fireArrowPrev, levels: fireArrowPrev.levels.slice(0, 2) });
  assert.equal(out.filled, undefined);
  assert.match(out.mismatch, /3 級.*2 級/);
});

test("上游數值都在（穿透之箭 2.0.0 改成 200%）：不動、不比前一版", () => {
  const ironArrow = {
    id: 3201005,
    formula: "消耗MP#mpCon, 攻擊力#damage%",
    valueFields: ["mpCon", "damage"],
    valueLabels: { mpCon: "消耗 MP", damage: "傷害" },
    levels: [{ level: 1, description: "消耗MP23, 攻擊力200%", values: { mpCon: 23, damage: 200 } }],
  };
  const out = fillLostFields(ironArrow, { labels: {}, levels: [{ mpCon: 23, damage: 180 }] });
  assert.equal(out.filled, undefined);
  assert.equal(out.mismatch, undefined);
  assert.equal(out.levels, ironArrow.levels);
});

test("前一版也沒有這個技能、或沒有樣板：原樣交回去", () => {
  assert.equal(fillLostFields(fireArrow, undefined).levels, fireArrow.levels);
  assert.equal(fillLostFields({ ...fireArrow, formula: undefined }, fireArrowPrev).levels, fireArrow.levels);
});

test("樣板的代號前一版也沒有（本來就沒數值的技能）：不算漏抽，原樣交回去", () => {
  const spear = {
    formula: "消耗MP#mpCon, 攻擊力#damage%, 對#mobCount名怪物攻擊#attackCount次",
    levels: [{ level: 1, description: "消耗MP10, 攻擊力55%, 對一名怪物兩次攻擊", values: {} }],
  };
  const out = fillLostFields(spear, { labels: {}, levels: [{}] });
  assert.equal(out.filled, undefined);
  assert.equal(out.mismatch, undefined);
  assert.equal(out.levels, spear.levels);
});

test("snapshotSkillValues：站上 skills.json 只留有數值的技能（id → 表頭＋每一級數值）", () => {
  const snapshot = snapshotSkillValues([
    { id: 2101004, n: "火焰箭", labels: fireArrowPrev.labels, levels: fireArrowPrev.levels, levelText: { 3: "…" } },
    { id: 1311002, n: "矛連擊", labels: {}, levels: [{}, {}] },
    { id: 1003, n: "神匠之魂", labels: {} },
  ]);
  assert.deepEqual(snapshot, { 2101004: { labels: fireArrowPrev.labels, levels: fireArrowPrev.levels } });
});
