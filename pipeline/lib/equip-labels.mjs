/**
 * 裝備數值的欄位名與值的寫法——改版整理（patch-diff.mjs）用。
 * pipeline 不能 import TypeScript，所以這份是 src/lib/format.ts（equipStatLabel／equipStatValue）的對照；
 * src/lib/__tests__/equip-labels-sync.test.ts 會逐欄比對兩邊，改一邊忘了另一邊測試會紅。
 */
export const EQUIP_STAT_LABELS = {
  reqLevel: "需求等級",
  reqJob: "需求職業",
  reqSTR: "需求力量",
  reqDEX: "需求敏捷",
  reqINT: "需求智力",
  reqLUK: "需求幸運",
  incSTR: "力量",
  incDEX: "敏捷",
  incINT: "智力",
  incLUK: "幸運",
  incMHP: "HP",
  incMMP: "MP",
  incPAD: "攻擊力",
  incMAD: "魔法攻擊力",
  incPDD: "防禦力",
  incMDD: "魔法防禦力",
  incACC: "命中率",
  incEVA: "迴避率",
  incSpeed: "移動速度",
  incJump: "跳躍力",
  tuc: "可使用捲軸次數",
  islot: "裝備欄位",
  attackSpeed: "攻擊速度",
};

const REQ_JOB_BITS = [[1, "劍士"], [2, "法師"], [4, "弓箭手"], [8, "盜賊"], [16, "海盜"]];
const ATTACK_SPEED_WORDS = { 2: "更快", 3: "更快", 4: "快", 5: "快", 6: "普通", 7: "慢", 8: "慢", 9: "比較慢" };
const TWO_SLOT_TEXT = { WpSi: "雙手，不能配盾", MaPn: "上衣＋褲裙（佔兩格）" };

export function equipStatLabel(key) {
  return EQUIP_STAT_LABELS[key] ?? key;
}

/** 同 format.ts 的 equipStatValue；回 null 表示這格站上不顯示 */
export function equipStatValue(key, value) {
  if (key === "reqJob" && typeof value === "number") {
    if (value === 0) return "不限職業";
    if (value === -1) return "初心者";
    if (value < 0 || value >= 32) return String(value);
    return REQ_JOB_BITS.filter(([bit]) => value & bit).map(([, name]) => name).join("、");
  }
  if (key === "attackSpeed" && typeof value === "number") {
    const word = ATTACK_SPEED_WORDS[value];
    return word ? `${word}（${value}）` : String(value);
  }
  if (key === "islot") return TWO_SLOT_TEXT[String(value)] ?? null;
  return String(value);
}
