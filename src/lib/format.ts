export function formatNumber(value: number | undefined | null): string {
  if (value === undefined || value === null) return "—";
  return value.toLocaleString("zh-TW");
}

/** 等級範圍：頭尾同一級只寫一個（Lv.30），不寫成 Lv.30–30 */
export function levelRange(from: number, to: number): string {
  return from === to ? `Lv.${from}` : `Lv.${from}–${to}`;
}

/**
 * 大數字縮寫成「萬」。
 * 任務獎勵動輒六七位數，完整寫出來在手機上塞不下也不好比大小。
 */
export function formatCompact(value: number): string {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}億`;
  if (value >= 10000) {
    const wan = value / 10000;
    return `${wan >= 100 ? Math.round(wan) : wan.toFixed(1)}萬`;
  }
  return value.toLocaleString("zh-TW");
}

/** 任務給的獎勵通常同時有經驗、楓幣、人氣，湊成一句話比排三個欄位好讀。 */
export function rewardSummary(exp?: number, money?: number, pop?: number): string {
  const parts: string[] = [];
  if (exp) parts.push(`經驗 ${formatNumber(exp)}`);
  if (money) parts.push(`楓幣 ${formatNumber(money)}`);
  if (pop) parts.push(`人氣 ${pop > 0 ? "+" : ""}${pop}`);
  return parts.join(" · ");
}

const ELEMENT_LABEL: Record<string, string> = {
  f: "火",
  i: "冰",
  l: "雷",
  p: "毒",
  h: "聖",
  s: "毒", // 部分資料用 s 代表 poison 的首字
};

const RESIST_LABEL: Record<string, { text: string; tone: "good" | "bad" | "flat" }> = {
  i: { text: "免疫", tone: "bad" },
  s: { text: "抗性", tone: "bad" },
  w: { text: "弱點", tone: "good" },
};

export function elementalNotes(elemental: Record<string, string> | undefined) {
  if (!elemental) return [];
  return Object.entries(elemental).map(([element, value]) => ({
    element: ELEMENT_LABEL[element] ?? element,
    ...(RESIST_LABEL[value] ?? { text: value, tone: "flat" as const }),
  }));
}

export function equipStatLabel(key: string): string {
  const labels: Record<string, string> = {
    reqLevel: "需求等級",
    reqSTR: "需求力量",
    reqDEX: "需求敏捷",
    reqINT: "需求智力",
    reqLUK: "需求幸運",
    incSTR: "力量",
    incDEX: "敏捷",
    incINT: "智力",
    incLUK: "幸運",
    incMHP: "最大 HP",
    incMMP: "最大 MP",
    incPAD: "物理攻擊",
    incMAD: "魔法攻擊",
    incPDD: "物理防禦",
    incMDD: "魔法防禦",
    incACC: "命中",
    incEVA: "迴避",
    incSpeed: "移動速度",
    incJump: "跳躍力",
    tuc: "可衝卷次數",
    islot: "裝備欄位",
    attackSpeed: "攻擊速度",
  };
  return labels[key] ?? key;
}
