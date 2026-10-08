import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanSkillDesc, skillLevelText } from "./skill-text.mjs";

// 字串都照抄上游 artale.json（2026-10-05 抓的 skills-data.js，遊戲版本 1.15.1）

test("說明尾巴上游沒清乾淨的「#」拿掉（劍氣縱橫「所需技能：魔天一擊1等級以上#」）", () => {
  assert.equal(
    cleanSkillDesc("[最高等級：20] 消耗HP、MP以作為裝備的武器對周圍的敵人進行整體攻擊。 所需技能：魔天一擊1等級以上#"),
    "[最高等級：20] 消耗HP、MP以作為裝備的武器對周圍的敵人進行整體攻擊。 所需技能：魔天一擊1等級以上",
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

test("沒有「#」的說明原樣不動；空的回 undefined（建置時 dropEmpty 拿掉欄位）", () => {
  assert.equal(cleanSkillDesc("[最高等級：30] 用槍多次攻擊前方多名敵人。進行刺擊攻擊。"), "[最高等級：30] 用槍多次攻擊前方多名敵人。進行刺擊攻擊。");
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
