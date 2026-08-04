/**
 * 傳送門代號翻成方向提示。
 *
 * 這些前綴是楓之谷地圖檔一貫的命名慣例：east 在畫面右緣、west 在左緣、
 * in/out 進出建築、up/down 上下、st 樓梯、tp 傳送點。
 * 認不出來的就原樣顯示，不會亂猜一個方向給玩家。
 */
const PORTAL_PREFIX: Array<[RegExp, string]> = [
  [/^east/i, "往右邊"],
  [/^west/i, "往左邊"],
  [/^out/i, "往外走"],
  [/^in/i, "往裡面走"],
  [/^up/i, "往上"],
  [/^down|^dn/i, "往下"],
  [/^st/i, "走樓梯／通道"],
  [/^tp/i, "傳送點"],
  [/^market/i, "自由市場入口"],
  [/^portal/i, "傳送門"],
];

export function portalHint(name: string): { text: string; raw: string; known: boolean } {
  const raw = name.trim();
  if (!raw) return { text: "未命名傳送門", raw: "", known: false };
  for (const [pattern, label] of PORTAL_PREFIX) {
    if (pattern.test(raw)) return { text: label, raw, known: true };
  }
  return { text: raw, raw, known: false };
}

export function formatNumber(value: number | undefined | null): string {
  if (value === undefined || value === null) return "—";
  return value.toLocaleString("zh-TW");
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
