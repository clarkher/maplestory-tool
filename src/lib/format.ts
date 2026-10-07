export function formatNumber(value: number | undefined | null): string {
  if (value === undefined || value === null) return "—";
  return value.toLocaleString("zh-TW");
}

/** 出處網站的名字（看網址的主機名）；不認得的寫「網頁」 */
const SOURCE_SITES: Array<[RegExp, string]> = [
  [/(^|\.)forum\.gamer\.com\.tw$/, "巴哈姆特"],
  [/(^|\.)home\.gamer\.com\.tw$/, "巴哈小屋"],
  [/(^|\.)bobogameguides\.com$/, "波波攻略島"],
  [/(^|\.)mapleclassictools\.com$/, "楓錄"],
  [/(^|\.)ptt\.cc$/, "PTT"],
  [/(^|\.)4gamers\.com\.tw$/, "4Gamers"],
  [/(^|\.)nownews\.com$/, "NOWnews"],
  [/(^|\.)beanfun\.com$/, "官方網站"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
];

/**
 * 出處連結的名字：寫網站名（巴哈姆特），不寫貼文編號（「巴哈 1490272」對玩家沒意義）；
 * 同一個網站好幾篇排在一起時，第二篇起加「 2」「 3」分得出來。
 */
export function sourceLabels(urls: string[]): string[] {
  const seen = new Map<string, number>();
  return urls.map(url => {
    let site = "網頁";
    try {
      const host = new URL(url).hostname;
      site = SOURCE_SITES.find(([pattern]) => pattern.test(host))?.[1] ?? "網頁";
    } catch {
      // 不是網址：照「網頁」寫
    }
    const count = (seen.get(site) ?? 0) + 1;
    seen.set(site, count);
    return count > 1 ? `${site} ${count}` : site;
  });
}

/** 刷怪點的等效回生秒數（好幾個刷怪點合成的，帶一位小數）寫成整數秒 */
export function respawnText(seconds: number): string {
  return `回生約 ${Math.round(seconds)} 秒`;
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
  s: "毒", // 遊戲客戶端的屬性代碼（elemAttr）毒是 S
};

/**
 * 屬性抗性的代碼（管線 pipeline/lib/elemental.mjs 存的）：i 免疫、r 抗性、w 弱點。
 * s 也是抗性：管線原本把 strong 存成 s（實際資料沒出現過），留著相容；只給畫面用，職業規則（job-rules.ts）不認 s，
 * 管線現在也不會再存出 s。
 */
const RESIST_LABEL: Record<string, { text: string; tone: "good" | "bad" }> = {
  i: { text: "免疫", tone: "bad" },
  r: { text: "抗性", tone: "bad" },
  s: { text: "抗性", tone: "bad" },
  w: { text: "弱點", tone: "good" },
};

/** 怪物卡的「屬性抗性」；認不得的屬性或代碼不顯示，不把資料代碼（冰 r）寫給玩家看 */
export function elementalNotes(elemental: Record<string, string> | undefined) {
  if (!elemental) return [];
  return Object.entries(elemental).flatMap(([key, value]) => {
    const element = ELEMENT_LABEL[key];
    const resist = RESIST_LABEL[value];
    return element && resist ? [{ element, ...resist }] : [];
  });
}

/**
 * 裝備數值的欄位名，寫遊戲說明框的字（經典版客戶端介面字串「攻擊力 : +{0}」「可使用捲軸次數 : {0}」…，
 * 對照表見 docs/superpowers/specs/2026-10-06-item-card-polish-design.md）。需求類欄位客戶端沒有現成的字，照舊。
 */
export function equipStatLabel(key: string): string {
  const labels: Record<string, string> = {
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
  return labels[key] ?? key;
}

/** 客戶端資料的需求職業是位元疊起來的（9＝劍士＋盜賊），「需求職業 9」對玩家沒意義 */
const REQ_JOB_BITS: Array<[number, string]> = [
  [1, "劍士"],
  [2, "法師"],
  [4, "弓箭手"],
  [8, "盜賊"],
  [16, "海盜"],
];

function reqJobText(mask: number): string {
  if (mask === 0) return "不限職業";
  if (mask === -1) return "初心者"; // 清酒、藍色拖把這類只有初心者能拿的武器
  // 有認不得的位元就照原值寫，不猜職業
  if (mask < 0 || mask >= 32) return String(mask);
  return REQ_JOB_BITS.filter(([bit]) => mask & bit).map(([, name]) => name).join("、");
}

/**
 * 攻擊速度（數字越小越快）寫遊戲說明框的字：字取自經典版客戶端的介面字串（沒有玩家常講的「頂速」「比較快」），
 * 數字對字跟經典版玩家的講法對得上（銀龍槍「慢 8」、九龍刀「普通 6」）。
 * 4、5 都叫「快」、7、8 都叫「慢」，只寫字分不出來，所以括號附數字。
 */
const ATTACK_SPEED_WORDS: Record<number, string> = {
  2: "更快",
  3: "更快",
  4: "快",
  5: "快",
  6: "普通",
  7: "慢",
  8: "慢",
  9: "比較慢",
};

/** 攻擊速度寫成「字（數字）」（道具卡、道具清單共用）；認不得的值回 null，不猜快慢 */
export function attackSpeedLabel(speed: number): string | null {
  const word = ATTACK_SPEED_WORDS[speed];
  return word ? `${word}（${speed}）` : null;
}

/**
 * 裝備欄位只寫一件佔兩格的；標題已經寫了帽子、槍，只佔一格的再寫一次是重複，不顯示。
 * 槍、矛在遊戲資料裡標的是單格（Wp），資料沒寫的不自己補。
 */
const TWO_SLOT_TEXT: Record<string, string> = {
  WpSi: "雙手，不能配盾",
  MaPn: "上衣＋褲裙（佔兩格）",
};

/** 裝備數值的值：需求職業解成職業名、攻擊速度寫成字，其他照原值；回 null 表示這格不用顯示 */
export function equipStatValue(key: string, value: number | string): string | null {
  if (key === "reqJob" && typeof value === "number") return reqJobText(value);
  if (key === "attackSpeed" && typeof value === "number") return attackSpeedLabel(value) ?? String(value);
  if (key === "islot") return TWO_SLOT_TEXT[String(value)] ?? null;
  return String(value);
}
