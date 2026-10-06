/**
 * 首頁「能力值與裝備」卡（src/components/route/GearCard.tsx）的顯示用字跟組裝。
 * 算數字、挑武器、挑卷軸都在 gear.ts；這裡只把那些結果組成卡片要的一包，再把遊戲裡的寫法換成玩家看得懂的字
 * （卷軸效果的 STR → 力量、攻擊速度只寫「快」）。不碰畫面，測試在 __tests__/gear-view.test.ts。
 */
import { equipStatValue, formatNumber } from "./format";
import {
  canWear,
  closestSource,
  equipRequirement,
  isMagicJob,
  rulesFor,
  scrollPicks,
  statShortfall,
  statTargets,
  weaponPicks,
  type GearData,
  type GearNote,
  type GearScroll,
  type GearWeapon,
  type StatKey,
  type StatRule,
} from "./gear";
import { jobTier, previousJob } from "./jobs";

/** 能力值四格的順序跟格子上的字 */
export const STAT_ORDER: StatKey[] = ["STR", "DEX", "INT", "LUK"];
export const STAT_SHORT: Record<StatKey, string> = { STR: "力", DEX: "敏", INT: "智", LUK: "幸" };
/** 句子裡的寫法：「力量還差 36」 */
export const STAT_WORD: Record<StatKey, string> = { STR: "力量", DEX: "敏捷", INT: "智力", LUK: "幸運" };

/* ------------------------------------------------------------------ 字 */

/** 卷軸說明裡的英文屬性（遊戲說明框原文就是這樣寫）換成中文；其餘照遊戲原文 */
const EFFECT_WORDS: Array<[RegExp, string]> = [
  [/\bMaxHP\b/g, "最大 HP"],
  [/\bMaxMP\b/g, "最大 MP"],
  [/\bSTR\b/g, "力量"],
  [/\bDEX\b/g, "敏捷"],
  [/\bINT\b/g, "智力"],
  [/\bLUK\b/g, "幸運"],
];

/** 卷軸效果一項一塊：「物理攻擊力+5，命中率+3，LUK+1」→ ["物理攻擊力+5", "命中率+3", "幸運+1"]（畫面上每塊不斷行） */
export function effectParts(effect: string): string[] {
  return effect
    .split(/[，、,]/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => EFFECT_WORDS.reduce((text, [pattern, word]) => text.replace(pattern, word), part));
}

/** 卷軸效果：「物理攻擊力+5，命中率+3，LUK+1」→「物理攻擊力+5、命中率+3、幸運+1」 */
export function effectText(effect: string): string {
  return effectParts(effect).join("、");
}

/**
 * 攻擊速度只寫遊戲說明框的字（快、普通、慢…）：沿用 format.ts 的 equipStatValue 對照，
 * 去掉它為了分 4／5 加的括號數字——卡片上只給玩家在遊戲裡看得到的那個字。
 */
export function speedWord(spd: number | undefined): string | null {
  if (spd === undefined) return null;
  const text = equipStatValue("attackSpeed", spd);
  return text ? text.replace(/（\d+）$/, "") : null;
}

/** 物理職業比攻擊、法師比魔力，卡片上也只寫那一個 */
export function offenseText(weapon: GearWeapon, magic: boolean): string {
  return magic ? `魔力 ${weapon.mag ?? 0}` : `攻擊 ${weapon.atk ?? 0}`;
}

/** ["Lv.35", "攻擊 20", "攻速 快"]；沒有等級需求寫「不限等級」，沒寫攻速就不給那塊 */
export function weaponStatParts(weapon: GearWeapon, magic: boolean): string[] {
  const speed = speedWord(weapon.spd);
  return [weapon.lv > 0 ? `Lv.${weapon.lv}` : "不限等級", offenseText(weapon, magic), speed ? `攻速 ${speed}` : null].filter(
    (part): part is string => Boolean(part),
  );
}

/** 「Lv.35・攻擊 20・攻速 快」 */
export function weaponStatsText(weapon: GearWeapon, magic: boolean): string {
  return weaponStatParts(weapon, magic).join("・");
}

/** 「力量還差 36」；好幾項差一樣多寫「力量、敏捷、幸運各差 2」；沒有差回空字串 */
export function shortText(short: Array<{ stat: StatKey; short: number }>): string {
  if (!short.length) return "";
  if (short.length > 1 && short.every(entry => entry.short === short[0].short)) {
    return `${short.map(entry => STAT_WORD[entry.stat]).join("、")}各差 ${short[0].short}`;
  }
  return short.map(entry => `${STAT_WORD[entry.stat]}還差 ${entry.short}`).join("、");
}

export type SourcePick = NonNullable<ReturnType<typeof closestSource>>;

/** 掉落的前半句：「火肥肥（Lv.32）會掉」（畫面上這塊不斷行，地圖名接在後面） */
export function dropLead(drop: { n: string; lv: number }): string {
  return `${drop.n}（Lv.${drop.lv}）會掉`;
}

/**
 * 怎麼拿：「墮落城市武器店的曼斯塔賣 8,000 楓幣」「火肥肥（Lv.32）會掉・螞蟻洞」
 * 「Lv.40 任務〈珍的最後一個挑戰〉隨機給」（任務有等級限制才寫等級；好幾樣獎勵抽一樣寫「隨機給」）
 */
export function sourceText(pick: SourcePick, mapLabel: (id: number) => string): string {
  if (pick.kind === "shop") return `${pick.shop.p}${pick.shop.n ? `的${pick.shop.n}` : ""}賣 ${formatNumber(pick.shop.pr)} 楓幣`;
  if (pick.kind === "drop") return `${dropLead(pick.drop)}・${mapLabel(pick.drop.map)}`;
  return `${pick.quest.minLv ? `Lv.${pick.quest.minLv} ` : ""}任務〈${pick.quest.n}〉${pick.quest.rand ? "隨機給" : "給"}`;
}

/** 這個來源是不是 V002 才開放（回開放日）：10/15 才開的城鎮的店、只在 V002 地圖出現的怪、V002 任務 */
export function sourceOpensLater(pick: SourcePick): string | undefined {
  if (pick.kind === "shop") return pick.shop.o;
  if (pick.kind === "drop") return pick.drop.o;
  if (pick.kind === "quest") return pick.quest.o;
  return undefined;
}

const TIER_WORD: Record<number, string> = { 1: "一轉", 2: "二轉", 3: "三轉" };

/**
 * 這一轉還沒有自己的點法、用的是上一轉的（rulesFor 的 inherited）：寫出哪一轉沿用哪一轉，
 * 「三轉先沿用二轉的點法（還沒有三轉攻略）」。規則本來就掛在這一轉、或整條線都對不上時回 null。
 */
export function inheritNote(job: number, rule: StatRule): string | null {
  if (rule.jobs.includes(job)) return null;
  for (let current = previousJob(job); current > 0; current = previousJob(current)) {
    if (!rule.jobs.includes(current)) continue;
    const self = TIER_WORD[jobTier(job)];
    return `${self}先沿用${TIER_WORD[jobTier(current)]}的點法（還沒有${self}攻略）`;
  }
  return null;
}

/* ------------------------------------------------------------------ 卷軸、玩家提醒 */

/**
 * 一組卷軸（同部位同效果，100%／60%／10%）裡「去哪拿」要寫哪一張：成功率最高的那張；
 * 10/15 前先跳過只有 V002 才拿得到的（卷軸的 o），整組都只有 V002 才退回成功率最高的。
 * options 照 scrollPicks 的順序（成功率高到低）。
 */
export function familyPick(options: GearScroll[], beforeOpen: boolean): GearScroll {
  return options.find(option => !(beforeOpen && option.o)) ?? options[0];
}

const NOTE_TOPICS: Array<[GearNote["topic"], string]> = [
  ["weapon", "武器"],
  ["scroll", "衝卷"],
  ["armor", "防具"],
  ["stat", "能力值"],
];

/**
 * 玩家提醒依主題分組（武器、衝卷、防具、能力值）。某個主題這一轉沒有任何一條，就沿上一轉找
 * （三轉 → 二轉 → 一轉，跟 rulesFor 同一個方向）；這一轉自己有的主題不再往上找。初心者回空陣列。
 */
export function notesFor(notes: GearNote[], job: number): Array<{ topic: GearNote["topic"]; label: string; notes: GearNote[] }> {
  const groups: Array<{ topic: GearNote["topic"]; label: string; notes: GearNote[] }> = [];
  for (const [topic, label] of NOTE_TOPICS) {
    for (let current = job; current > 0; current = previousJob(current)) {
      const found = notes.filter(entry => entry.topic === topic && entry.jobs.includes(current));
      if (found.length) {
        groups.push({ topic, label, notes: found });
        break;
      }
    }
  }
  return groups;
}

/* ------------------------------------------------------------------ 組裝 */

export type GearFamily = { slot: string; stat: string; options: GearScroll[]; pick: GearScroll; source: SourcePick | null };

export type GearPlan = {
  magic: boolean;
  rule: StatRule | null;
  others: StatRule[];
  /** 這一轉還沒有自己的點法，沿用上一轉的 */
  inherited: boolean;
  /** 照這套點法現在的力敏智幸；沒有點法時 null */
  targets: Record<StatKey, number> | null;
  best: GearWeapon | null;
  bestSource: SourcePick | null;
  /** best 照這套點法還差的點數（有點法時 weaponPicks 已經只挑穿得上的，正常是空的） */
  bestShort: Array<{ stat: StatKey; short: number }>;
  alternatives: Array<{ weapon: GearWeapon; source: SourcePick | null }>;
  next: GearWeapon | null;
  stronger: GearWeapon | null;
  strongerShort: Array<{ stat: StatKey; short: number }>;
  /**
   * 「其他點法」裡照著點就穿得上 stronger 的那條（祭司：三轉裝備法，幸運＝等級＋3 → 死靈法杖）。
   * 有的話畫面改講「改用這套點法就能用」，不講「幸運還差 74」——主流點法那項永遠是 4，叫人補是補不到的。
   */
  strongerVia: StatRule | null;
  families: GearFamily[];
  notes: ReturnType<typeof notesFor>;
};

const EMPTY_PLAN: Omit<GearPlan, "magic"> = {
  rule: null,
  others: [],
  inherited: false,
  targets: null,
  best: null,
  bestSource: null,
  bestShort: [],
  alternatives: [],
  next: null,
  stronger: null,
  strongerShort: [],
  strongerVia: null,
  families: [],
  notes: [],
};

/** 其他點法裡，照著點到這個等級就穿得上這把武器的第一條；都穿不上回 null */
function otherRuleThatWears(
  gear: GearData,
  job: number,
  level: number,
  others: StatRule[],
  weapon: GearWeapon,
  beforeOpen: boolean,
): StatRule | null {
  for (const other of others) {
    const equipReq = other.secondary?.type === "equip" ? equipRequirement(gear.weapons, job, level, other, beforeOpen) : undefined;
    if (canWear(weapon, statTargets(other, level, equipReq))) return other;
  }
  return null;
}

/**
 * 卡片要的一切，照 gear-realdata.test.ts 的方式組：能力值目標 targetsAt 只有 equip 類型的點法才吃
 * equipRequirement，而且每個等級只算一次（weaponPicks 會拿很多個等級來問）。
 * beforeOpen（10/15 前）一路傳下去：能力值目標、武器、來源都只看現在拿得到的。初心者（0）回空的一包。
 */
export function gearPlan(gear: GearData, job: number, level: number, beforeOpen: boolean): GearPlan {
  const magic = isMagicJob(job);
  if (job <= 0) return { magic, ...EMPTY_PLAN };

  const { main: rule, others, inherited } = rulesFor(gear.rules, job);
  const cache = new Map<number, Record<StatKey, number>>();
  const targetsAt = rule
    ? (lv: number) => {
        let targets = cache.get(lv);
        if (!targets) {
          const equipReq = rule.secondary?.type === "equip" ? equipRequirement(gear.weapons, job, lv, rule, beforeOpen) : undefined;
          targets = statTargets(rule, lv, equipReq);
          cache.set(lv, targets);
        }
        return targets;
      }
    : undefined;
  const targets = targetsAt ? targetsAt(level) : null;

  const picks = weaponPicks(gear.weapons, job, level, { targetsAt, beforeOpen, types: rule?.weapons });
  const source = (weapon: GearWeapon) => closestSource(weapon.src, level, beforeOpen, job);

  const families = scrollPicks(gear.scrolls, job, picks.best?.s ?? null, rule?.main ?? null, level).map(family => {
    const pick = familyPick(family.options, beforeOpen);
    return { ...family, pick, source: closestSource(pick.src, level, beforeOpen, job) };
  });

  return {
    magic,
    rule,
    others,
    inherited,
    targets,
    best: picks.best,
    bestSource: picks.best ? source(picks.best) : null,
    bestShort: picks.best && targets ? statShortfall(picks.best, targets) : [],
    alternatives: picks.alternatives.map(weapon => ({ weapon, source: source(weapon) })),
    next: picks.next,
    stronger: picks.stronger,
    strongerShort: picks.stronger && targets ? statShortfall(picks.stronger, targets) : [],
    strongerVia: picks.stronger ? otherRuleThatWears(gear, job, level, others, picks.stronger, beforeOpen) : null,
    families,
    notes: notesFor(gear.notes, job),
  };
}
