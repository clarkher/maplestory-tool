import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanSkillDesc, clientLevels, expiredOn, linkPrereqs, skillLevelText, splitPrereq } from "./skill-text.mjs";

// 字串都照抄上游 artale.json（2026-10-05 抓的 skills-data.js，遊戲版本 1.15.1）

test("說明尾巴上游沒清乾淨的「#」拿掉（劍氣縱橫「所需技能：魔天一擊1等級以上#」）", () => {
  assert.equal(
    cleanSkillDesc("[最高等級：20] 消耗HP、MP以作為裝備的武器對周圍的敵人進行整體攻擊。 所需技能：魔天一擊1等級以上#", 20),
    "消耗HP、MP以作為裝備的武器對周圍的敵人進行整體攻擊。 所需技能：魔天一擊1等級以上",
  );
});

test("「#」前面多一個反斜線的（3 個技能）連反斜線一起拿掉", () => {
  assert.equal(cleanSkillDesc("所需技能：快速之槍 3等級以上\\#"), "所需技能：快速之槍 3等級以上");
});

test("句子中間的也拿掉（能量暴擊「只限在能量補滿#的狀態下使用」，遊戲原字串是「#c能量補滿#」）", () => {
  assert.equal(
    cleanSkillDesc("近距離的多個敵人發動攻擊。只限在能量補滿#的狀態下使用。"),
    "近距離的多個敵人發動攻擊。只限在能量補滿的狀態下使用。",
  );
});

test("沒有「#」的說明不動（開頭的最高等級另外拿掉，見下面）；空的回 undefined（建置時 dropEmpty 拿掉欄位）", () => {
  assert.equal(cleanSkillDesc("用槍多次攻擊前方多名敵人。進行刺擊攻擊。"), "用槍多次攻擊前方多名敵人。進行刺擊攻擊。");
  assert.equal(cleanSkillDesc(""), undefined);
  assert.equal(cleanSkillDesc(undefined), undefined);
});

test("多級、整個技能都沒有數值（槍連擊）：每一級的原文都留，卡片一級一列", () => {
  const levels = [
    { level: 1, description: "消耗MP10, 攻擊力55%, 對一名怪物兩次攻擊", values: {} },
    { level: 2, description: "消耗MP10, 攻擊力60%, 對一名怪物兩次攻擊", values: {} },
    { level: 3, description: "消耗MP10, 攻擊力65%, 對一名怪物兩次攻擊", values: {} },
  ];
  assert.deepEqual(skillLevelText(levels), {
    1: "消耗MP10, 攻擊力55%, 對一名怪物兩次攻擊",
    2: "消耗MP10, 攻擊力60%, 對一名怪物兩次攻擊",
    3: "消耗MP10, 攻擊力65%, 對一名怪物兩次攻擊",
  });
});

test("有數值的技能只留最高級那一句（卡片的「滿級效果」），其他級數值表就有了（嫩寶丟擲術）", () => {
  const levels = [
    { level: 1, description: "消耗MP 3後，殺傷力10", values: { mpCon: 3, fixdamage: 10 } },
    { level: 2, description: "消耗MP 5後，殺傷力25", values: { mpCon: 5, fixdamage: 25 } },
    { level: 3, description: "消耗MP 7後，殺傷力40", values: { mpCon: 7, fixdamage: 40 } },
  ];
  assert.deepEqual(skillLevelText(levels), { 3: "消耗MP 7後，殺傷力40" });
});

test("有數值、但某一級整列沒有數值：那一級的原文也留（表上那一列放原文；隱身術 20 級是最高級，這裡用中間一級驗）", () => {
  const levels = [
    { level: 1, description: "消耗MP24, 隱身10秒，移動速度-30", values: { mpCon: 24, time: 10, speed: -30 } },
    { level: 2, description: "消耗MP5, 隱身200秒，移動速度 正常", values: {} },
    { level: 3, description: "消耗MP6, 隱身190秒，移動速度-1", values: { mpCon: 6, time: 190, speed: -1 } },
  ];
  assert.deepEqual(skillLevelText(levels), {
    2: "消耗MP5, 隱身200秒，移動速度 正常",
    3: "消耗MP6, 隱身190秒，移動速度-1",
  });
});

test("只有一級、沒有數值（英雄共鳴、坐騎）：不留——效果樣板本身就是完整句子，坐騎的原文還是韓文", () => {
  assert.equal(skillLevelText([{ level: 1, description: "消耗MP 30，在40分鐘內提升物理攻擊力與魔法攻擊力4%", values: {} }]), undefined);
  assert.equal(skillLevelText([{ level: 1, description: "[TW]MP 10 소비, 물리, 마법 방어력 10 증가, 이동속도 120, 점프력 120", values: {} }]), undefined);
});

test("韓文、還留著 #代號（沒代入數值）、空白的原文不留，那一級畫面寫「—」", () => {
  const levels = [
    { level: 1, description: "消耗MP10, 攻擊力110%, 製造一個分身攻擊怪物", values: {} },
    { level: 2, description: "[TW]MP 10 소비", values: {} },
    { level: 3, description: "消耗MP#mpCon, 攻擊力#damage%", values: {} },
    { level: 4, description: "  ", values: {} },
  ];
  assert.deepEqual(skillLevelText(levels), { 1: "消耗MP10, 攻擊力110%, 製造一個分身攻擊怪物" });
});

test("上游的級數跟順序對不上（排序變了、跳號）就讓重建失敗，不默默把原文標到錯的級數；訊息寫出是哪個技能", () => {
  const levels = [
    { level: 1, description: "消耗MP10, 攻擊力55%", values: {} },
    { level: 3, description: "消耗MP10, 攻擊力65%", values: {} },
  ];
  assert.throws(() => skillLevelText(levels, "1311001 槍連擊"), error => error.message.includes("1311001 槍連擊") && error.message.includes("第 2 筆"));
});

test("沒有 levels（神匠之魂等 7 個）回 undefined", () => {
  assert.equal(skillLevelText([]), undefined);
  assert.equal(skillLevelText(undefined), undefined);
});

// ---- 2026-10-08 使用者「全修」的 12 項優化（v0.78）----

test("說明開頭的「[最高等級：20]」跟技能上限一樣才拿掉：卡片標題下已經寫「上限 20 級」", () => {
  assert.equal(
    cleanSkillDesc("[最高等級：20] 消耗HP、MP以作為裝備的武器對周圍的敵人進行整體攻擊。", 20),
    "消耗HP、MP以作為裝備的武器對周圍的敵人進行整體攻擊。",
  );
  assert.equal(cleanSkillDesc("[等級上限 : 1] 可以騎雪吉拉移動。", 1), "可以騎雪吉拉移動。");
});

test("開頭寫的等級跟技能上限不一樣（精靈的祝福寫 12、上限 20）或沒有上限（肥肥的弱點攻擊）：照留，那是唯一寫到的地方", () => {
  assert.equal(cleanSkillDesc("[等級上限：12] 提升攻擊力。", 20), "[等級上限：12] 提升攻擊力。");
  assert.equal(cleanSkillDesc("[等級上限 : 1] 給予肥肥150%的傷害。", undefined), "[等級上限 : 1] 給予肥肥150%的傷害。");
});

test("別種開頭標記（「[道具潛在技能]」）不是重複的資訊，照留", () => {
  assert.equal(cleanSkillDesc("[道具潛在技能] 攻擊時有一定機率回復HP。"), "[道具潛在技能] 攻擊時有一定機率回復HP。");
});

test("說明是韓文的（19 個坐騎技能，上游「[TW][마스터 레벨 : 1] 예티를…」）不留：卡片照列中文的效果行", () => {
  assert.equal(cleanSkillDesc("[TW][마스터 레벨 : 1] 예티를 타고 이동할 수 있다."), undefined);
});

test("說明尾巴的「所需技能：魔天一擊1等級以上」拆出來：說明只留前面，所需技能變成名字＋級數（卡片做成連結）", () => {
  assert.deepEqual(splitPrereq("消耗HP、MP以作為裝備的武器對周圍的敵人進行整體攻擊。 所需技能：魔天一擊1等級以上"), {
    desc: "消耗HP、MP以作為裝備的武器對周圍的敵人進行整體攻擊。",
    req: [{ name: "魔天一擊", level: 1 }],
  });
});

test("所需技能上游的兩種寫法都認得：名字後面有空格（詛咒術 3等級以上）、等級寫在前面（精準強化等級3以上）", () => {
  assert.deepEqual(splitPrereq("消耗MP隱身於影子中。 所需技能：詛咒術 3等級以上").req, [{ name: "詛咒術", level: 3 }]);
  assert.deepEqual(splitPrereq("提升命中率和迴避率。 所需技能：精準強化等級3以上").req, [{ name: "精準強化", level: 3 }]);
});

test("沒有所需技能、或寫法認不得的：說明原樣、沒有 req（不硬拆）", () => {
  assert.deepEqual(splitPrereq("用槍多次攻擊前方多名敵人。"), { desc: "用槍多次攻擊前方多名敵人。", req: undefined });
  assert.deepEqual(splitPrereq("提升攻擊力。 所需技能：要先學會攻擊技能"), { desc: "提升攻擊力。 所需技能：要先學會攻擊技能", req: undefined });
  // 用「和」連兩個的：拆出來的名字會帶「以上」跟數字，不收
  assert.deepEqual(splitPrereq("提升攻擊力。 所需技能：憤怒 3等級以上和激勵5等級以上"), { desc: "提升攻擊力。 所需技能：憤怒 3等級以上和激勵5等級以上", req: undefined });
  assert.deepEqual(splitPrereq(undefined), { desc: undefined, req: undefined });
});

test("所需技能只在同一條職業線（自己、上一轉、一轉）找名字完全一樣、只有一個的才接上 id；找不到或不只一個就只留名字", () => {
  const list = [
    { id: 1001004, n: "魔天一擊", job: 100 },
    { id: 1001005, n: "劍氣縱橫", job: 100, req: [{ name: "魔天一擊", level: 1 }] },
    { id: 1301007, n: "神聖之火", job: 130 },
    { id: 1311008, n: "龍之魂", job: 131, req: [{ name: "神聖之火", level: 5 }] },
    { id: 4100002, n: "恢復術", job: 410 },
    { id: 4200001, n: "恢復術", job: 420 },
    // 劍士線沒有叫「恢復術」的技能（上游字寫錯），盜賊線有兩個也不能亂接
    { id: 1001003, n: "自身強化", job: 100, req: [{ name: "恢復術", level: 3 }] },
    { id: 1101007, n: "反射之盾", job: 110, req: [{ name: "憤怒", level: 3 }] },
    // 同一條職業線（格鬥家 511 → 打手 510）就有兩個同名的：不知道是哪個，也不接
    { id: 5101000, n: "同名技能", job: 510 },
    { id: 5111000, n: "同名技能", job: 511 },
    { id: 5111099, n: "要同名技能的", job: 511, req: [{ name: "同名技能", level: 1 }] },
  ];
  linkPrereqs(list);
  assert.deepEqual(list[1].req, [{ name: "魔天一擊", level: 1, id: 1001004 }]);
  assert.deepEqual(list[3].req, [{ name: "神聖之火", level: 5, id: 1301007 }]);
  assert.deepEqual(list[6].req, [{ name: "恢復術", level: 3 }]);
  assert.deepEqual(list[7].req, [{ name: "憤怒", level: 3 }]);
  assert.deepEqual(list[10].req, [{ name: "同名技能", level: 1 }]);
});

test("寫「需求技能：」的也拆（黑暗之劍等 13 個，v0.78 漏了）；只寫「20級」沒寫「以上」的（3連發）也收", () => {
  assert.deepEqual(splitPrereq("攻擊單一敵人，但只限裝備劍，並且鬥氣量有上升的狀態下使用。 需求技能：鬥氣集中1級以上"), {
    desc: "攻擊單一敵人，但只限裝備劍，並且鬥氣量有上升的狀態下使用。",
    req: [{ name: "鬥氣集中", level: 1 }],
  });
  assert.deepEqual(splitPrereq("提升魔法攻擊速度。 需求技能：魔力激發 3級以上").req, [{ name: "魔力激發", level: 3 }]);
  assert.deepEqual(splitPrereq("無法與其他各種藥水重複使用。 需求技能： 神聖之光5級以上").req, [{ name: "神聖之光", level: 5 }]);
  assert.deepEqual(splitPrereq("使用雙子星攻擊時所發射的子彈數量增多，且攻擊力也會提升。 需求技能：雙子星攻擊20級").req, [{ name: "雙子星攻擊", level: 20 }]);
  // 只有數字、沒寫級也沒寫以上：認不得，不拆
  assert.equal(splitPrereq("提升攻擊力。 需求技能：雙子星攻擊20").req, undefined);
  // 技能名本身有數字的（四轉瞬‧迅雷要「3連發 20級」）照收；「A 3等級以上和B 5等級以上」照舊不收
  assert.deepEqual(splitPrereq("連續發射子彈。 需求技能：3連發 20級").req, [{ name: "3連發", level: 20 }]);
  assert.equal(splitPrereq("提升攻擊力。 所需技能：憤怒 3級和激勵5級").req, undefined);
});

// data/client/skill-req.json：台服客戶端每個技能的 req（所需技能 id → 等級），scripts/client/skill-req.mjs 抽的
test("客戶端寫了所需技能就照它的 id 接，名字換成那個技能的正式名稱（遊戲說明寫錯的「劍技專精」→ 精準之劍；2026-10-08 使用者選 A）", () => {
  const list = [
    { id: 1100000, n: "精準之劍", job: 110 },
    { id: 1100002, n: "終極之劍", job: 110, req: [{ name: "劍技專精", level: 3 }] },
    { id: 1000002, n: "生命恢復", job: 100 },
    // 劍士線沒有「恢復術」，客戶端寫的是生命恢復；盜賊線的恢復術不能被拿來接
    { id: 1001003, n: "自身強化", job: 100, req: [{ name: "恢復術", level: 3 }] },
    { id: 4100002, n: "恢復術", job: 410 },
    // 名字本來就對的照接（客戶端跟名字指到同一個）
    { id: 1001004, n: "魔天一擊", job: 100 },
    { id: 1001005, n: "劍氣縱橫", job: 100, req: [{ name: "魔天一擊", level: 1 }] },
  ];
  linkPrereqs(list, { 1100002: { 1100000: 3 }, 1001003: { 1000002: 3 }, 1001005: { 1001004: 1 } });
  assert.deepEqual(list[1].req, [{ name: "精準之劍", level: 3, id: 1100000 }]);
  assert.deepEqual(list[3].req, [{ name: "生命恢復", level: 3, id: 1000002 }]);
  assert.deepEqual(list[6].req, [{ name: "魔天一擊", level: 1, id: 1001004 }]);
});

test("客戶端的等級跟說明不一樣、指到別條職業線、或清單裡沒有那個技能：不照客戶端接，退回找同名（不亂接）", () => {
  const list = [
    { id: 1100000, n: "精準之劍", job: 110 },
    { id: 1100002, n: "終極之劍", job: 110, req: [{ name: "劍技專精", level: 3 }] },
    { id: 1200001, n: "精準之棍", job: 120 },
    { id: 1100003, n: "終極之斧", job: 110, req: [{ name: "斧頭專精", level: 3 }] },
    { id: 1101004, n: "快速之劍", job: 110, req: [{ name: "精準之劍", level: 5 }] },
  ];
  linkPrereqs(list, { 1100002: { 1100000: 5 }, 1100003: { 1200001: 3 }, 1101004: { 9999999: 5 } });
  assert.deepEqual(list[1].req, [{ name: "劍技專精", level: 3 }]);
  assert.deepEqual(list[3].req, [{ name: "斧頭專精", level: 3 }]);
  assert.deepEqual(list[4].req, [{ name: "精準之劍", level: 5, id: 1100000 }]);
});

test("好幾個所需技能：名字一樣的先配；同一個等級剩一個寫錯的、客戶端也剩一個才配給它，兩個以上配不準就只留名字", () => {
  const sword = { id: 1100000, n: "精準之劍", job: 110 };
  const rage = { id: 1101006, n: "激勵", job: 110 };
  const axe = { id: 1100001, n: "精準之斧", job: 110 };
  const one = { id: 1, n: "一個寫錯", job: 110, req: [{ name: "劍技專精", level: 3 }, { name: "激勵", level: 3 }] };
  const two = { id: 2, n: "兩個寫錯", job: 110, req: [{ name: "劍技專精", level: 3 }, { name: "斧頭專精", level: 3 }] };
  linkPrereqs([sword, rage, axe, one, two], { 1: { 1100000: 3, 1101006: 3 }, 2: { 1100000: 3, 1100001: 3 } });
  assert.deepEqual(one.req, [{ name: "精準之劍", level: 3, id: 1100000 }, { name: "激勵", level: 3, id: 1101006 }]);
  assert.deepEqual(two.req, [{ name: "劍技專精", level: 3 }, { name: "斧頭專精", level: 3 }]);
});

test("說明寫的名字本來就是這條職業線的技能、只是等級跟客戶端不一樣：照名字接，不被改名配給客戶端同等級的別的技能（code review）", () => {
  const sword = { id: 1100000, n: "精準之劍", job: 110 };
  const rage = { id: 1101006, n: "激勵", job: 110 };
  const skill = { id: 1, n: "測試", job: 110, req: [{ name: "精準之劍", level: 5 }] };
  linkPrereqs([sword, rage, skill], { 1: { 1100000: 3, 1101006: 5 } });
  assert.deepEqual(skill.req, [{ name: "精準之劍", level: 5, id: 1100000 }]);
});

test("說明寫了有效期限的活動技能（宇宙衝鋒「有效時間：2009年6月8日00時」）讀得出到期日；沒寫的回 null", () => {
  assert.equal(expiredOn("連按兩次左右方向鍵瞬間提升移動速度和跳躍力。有效時間：2009年6月8日00時"), "2009-06-08");
  assert.equal(expiredOn("可以騎雪吉拉移動。 有效期間：2009年9月7日00點"), "2009-09-07");
  assert.equal(expiredOn("用槍多次攻擊前方多名敵人。"), null);
  assert.equal(expiredOn(undefined), null);
});

// 衝鋒 5001005：上游每一級只有文字，台服客戶端有每一級的數值（data/client/skills.json，scripts/client/ 抽的）
const DASH_UPSTREAM = [
  { level: 1, description: "消耗MP 14，持續時間為4秒", values: {} },
  { level: 2, description: "消耗MP 13，持續時間為4秒", values: {} },
];
const DASH_CLIENT = {
  labels: { mpCon: "消耗 MP", x: "移動速度", y: "跳躍力", time: "持續時間" },
  levels: [
    { mpCon: 14, x: 12, y: 1, time: 4 },
    { mpCon: 13, x: 14, y: 2, time: 4 },
  ],
};

test("上游沒有每一級數值、客戶端有（衝鋒）：每一級的數值跟表頭用客戶端的，說明原文照留", () => {
  assert.deepEqual(clientLevels(DASH_UPSTREAM, DASH_CLIENT, "5001005 衝鋒"), {
    levels: [
      { level: 1, description: "消耗MP 14，持續時間為4秒", values: { mpCon: 14, x: 12, y: 1, time: 4 } },
      { level: 2, description: "消耗MP 13，持續時間為4秒", values: { mpCon: 13, x: 14, y: 2, time: 4 } },
    ],
    labels: { mpCon: "消耗 MP", x: "移動速度", y: "跳躍力", time: "持續時間" },
  });
});

test("上游已經有數值就用上游的（不混兩邊）；客戶端沒有這個技能就原樣", () => {
  const upstream = [{ level: 1, description: "消耗MP 3後，殺傷力10", values: { mpCon: 3, fixdamage: 10 } }];
  assert.deepEqual(clientLevels(upstream, DASH_CLIENT, "1000 嫩寶丟擲術"), { levels: upstream, labels: undefined });
  assert.deepEqual(clientLevels(DASH_UPSTREAM, undefined, "5001005 衝鋒"), { levels: DASH_UPSTREAM, labels: undefined });
});

test("客戶端的級數跟上游對不上（改版後技能上限變了）：不擋每天的資料更新，退回上游的文字（卡片一級一列放原文）、印警告寫出是哪個技能", () => {
  const warnings = [];
  const result = clientLevels(DASH_UPSTREAM, { ...DASH_CLIENT, levels: DASH_CLIENT.levels.slice(0, 1) }, "5001005 衝鋒", { warn: message => warnings.push(message) });
  assert.deepEqual(result, { levels: DASH_UPSTREAM, labels: undefined });
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes("5001005 衝鋒") && warnings[0].includes("data/client/skills.json"));
});
