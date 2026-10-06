/**
 * 首頁「能力值＋裝備＋衝卷」卡（v0.27）的純函式。
 * 資料來自 public/data/gear.json（pipeline/build-gear.mjs 產出，格式見該檔開頭註解與
 * docs/superpowers/specs/2026-10-06-gear-card-design.md）。這裡不碰畫面，只算數字跟排序。
 */
import { canJobUse } from "./item-view";
import { baseJob, previousJob } from "./jobs";

/* ------------------------------------------------------------------ 資料型別（對應 public/data/gear.json，兩邊要一致） */

export type GearSource = {
  /** 幾個商店有賣（items.json 的 sh）；沒賣就不給 */
  shop?: number;
  /** 掉落怪：只收出現在已開放地圖的怪，依怪物等級由低到高，最多 8 隻；map 是牠出現的一張已開放地圖（優先不是 V002 的） */
  drops?: Array<{ m: number; n: string; lv: number; map: number; o?: string }>;
  /** 給這個道具的已開放任務（quests.json 有的）；o：V002 任務（同 src/lib/v002.ts 的規則） */
  quests?: Array<{ id: string; n: string; minLv?: number; o?: string }>;
};

export type GearWeapon = {
  id: number;
  n: string;
  /** 武器種類，照 items.json 的 s：單手劍、雙手劍、單手斧、雙手斧、單手棍、雙手棍、槍、矛、短杖、長杖、弓、弩、拳套、短刀、指虎、火槍 */
  s: string;
  /** reqLevel（沒寫當 0） */
  lv: number;
  /** incPAD */
  atk?: number;
  /** incMAD */
  mag?: number;
  /** attackSpeed */
  spd?: number;
  /** reqSTR／reqDEX／reqINT／reqLUK，有寫才給 */
  req?: Partial<Record<"STR" | "DEX" | "INT" | "LUK", number>>;
  /** reqJob 位元（沒寫 0） */
  job: number;
  /** 可衝卷次數 */
  tuc?: number;
  src: GearSource;
  /** 所有來源都是 V002 → "2026-10-15" */
  o?: string;
};

export type GearScroll = {
  /** 同名同成功率合併後，留拿得到的那個 id（多個就留最小的） */
  id: number;
  /** 卷軸名去掉成功率：「拳套攻擊卷軸」 */
  n: string;
  /** 部位：手套、披風、套服、上衣、褲裙、鞋子、耳環、頭盔、盾牌，或武器種類（短劍 → 短刀） */
  slot: string;
  /** 攻擊、魔力、力量、敏捷、智力、幸運，其他照名字（防禦、生命、跳躍…） */
  stat: string;
  /** 成功率 % */
  rate: number;
  /** 說明裡成功率後面那段原文：「物理攻擊力+2，命中率+1」 */
  effect: string;
  src: GearSource;
  o?: string;
};

export type StatKey = "STR" | "DEX" | "INT" | "LUK";

export type StatRule = {
  jobs: number[];
  label: string;
  main: StatKey;
  secondary: null | {
    stat: StatKey;
    type: "level" | "double-level" | "fixed" | "equip" | "ratio";
    offset?: number;
    cap?: number;
    value?: number;
    floor?: number;
    ratio?: [number, number];
  };
  t: string;
  s: string[];
  v: "tw" | "community" | "legacy";
  mainstream: boolean;
};

export type GearNote = {
  jobs: number[];
  topic: "weapon" | "scroll" | "armor" | "stat";
  t: string;
  s: string[];
  v: "tw" | "community" | "legacy";
  items?: number[];
};

export type GearData = {
  builtAt: string;
  weapons: GearWeapon[];
  scrolls: GearScroll[];
  rules: StatRule[];
  before?: { t: string; s: string[]; v: "tw" | "community" | "legacy" };
  notes: GearNote[];
};

/* ------------------------------------------------------------------ 能力值 */

const STAT_KEYS: StatKey[] = ["STR", "DEX", "INT", "LUK"];
/** 職業硬規則：能力值最少 4 點 */
const STAT_FLOOR = 4;

/** 總點數：1 等 25 點、每級 5 點 */
export function totalStats(level: number): number {
  return 5 * level + 20;
}

/**
 * 這套點法在這個等級的四圍目標。equip 類型的副屬看 equipReq（見 equipRequirement）；
 * 沒給 equipReq、或那個屬性沒資料時退回 floor。
 * 副屬算出來若超過「總點數－12」會夾住（留給主屬性跟其餘兩項各自最低 4 點）；
 * 所有算出來的數字最低都是 4。
 */
export function statTargets(rule: StatRule, level: number, equipReq?: Partial<Record<StatKey, number>>): Record<StatKey, number> {
  const total = totalStats(level);
  const result: Record<StatKey, number> = { STR: STAT_FLOOR, DEX: STAT_FLOOR, INT: STAT_FLOOR, LUK: STAT_FLOOR };
  const sec = rule.secondary;

  if (!sec) {
    result[rule.main] = Math.max(STAT_FLOOR, total - STAT_FLOOR * 3);
    return result;
  }

  let secondaryValue: number;
  switch (sec.type) {
    case "level":
      secondaryValue = level + (sec.offset ?? 0);
      break;
    case "double-level":
      secondaryValue = sec.cap !== undefined ? Math.min(level * 2, sec.cap) : level * 2;
      break;
    case "fixed":
      secondaryValue = sec.value ?? STAT_FLOOR;
      break;
    case "equip": {
      const floor = sec.floor ?? STAT_FLOOR;
      secondaryValue = Math.max(floor, equipReq?.[sec.stat] ?? 0);
      break;
    }
    case "ratio": {
      const [mainShare, secondaryShare] = sec.ratio ?? [1, 1];
      const pool = total - STAT_FLOOR * STAT_KEYS.length;
      secondaryValue = STAT_FLOOR + Math.floor((pool * secondaryShare) / (mainShare + secondaryShare));
      break;
    }
    default:
      secondaryValue = STAT_FLOOR;
  }

  secondaryValue = Math.max(STAT_FLOOR, Math.min(secondaryValue, total - STAT_FLOOR * 3));
  result[sec.stat] = secondaryValue;
  result[rule.main] = Math.max(STAT_FLOOR, total - secondaryValue - STAT_FLOOR * 2);
  return result;
}

/* ------------------------------------------------------------------ 武器種類 */

/**
 * 職業能用的武器種類，依遊戲資料的熟練技能分流（skills.json 的「精準之劍」「精準之斧」…，
 * 一個二轉只點得出其中一支熟練技能，能用的武器種類就跟著那支技能走）。只列一轉跟二轉；
 * 三轉沒有新的熟練技能、沿用二轉那支，所以 weaponTypesFor 查不到時會沿 previousJob 往上找
 * （111 → 110），不在表裡另外重複一份。
 */
const WEAPON_TYPES_BY_JOB: Record<number, string[]> = {
  100: ["單手劍", "雙手劍", "單手斧", "雙手斧", "單手棍", "雙手棍"],
  110: ["單手劍", "雙手劍", "單手斧", "雙手斧"],
  120: ["單手劍", "雙手劍", "單手棍", "雙手棍"],
  130: ["槍", "矛"],
  200: ["短杖", "長杖"],
  210: ["短杖", "長杖"],
  220: ["短杖", "長杖"],
  230: ["短杖", "長杖"],
  300: ["弓", "弩"],
  310: ["弓"],
  320: ["弩"],
  400: ["拳套", "短刀"],
  410: ["拳套"],
  420: ["短刀"],
  500: ["指虎", "火槍"],
  510: ["指虎"],
  520: ["火槍"],
};

/** 初心者（0）與認不得的職業代碼回空陣列；三轉（表裡查不到）沿 previousJob 往上找二轉那組。 */
export function weaponTypesFor(job: number): string[] {
  const direct = WEAPON_TYPES_BY_JOB[job];
  if (direct) return direct;
  const prev = previousJob(job);
  return prev > 0 ? weaponTypesFor(prev) : [];
}

/** 法師系：一轉、二轉、三轉都算（200 系） */
export function isMagicJob(job: number): boolean {
  return baseJob(job) === 200;
}

/* ------------------------------------------------------------------ 能力值規則 */

/**
 * 找這個職業的主流點法：先看這一轉自己有沒有，沒有就沿著 previousJob 往上找（三轉 → 二轉 → 一轉）。
 * inherited＝true 代表規則是從上一轉沿用的（研究檔還沒有這一轉自己的規則）；
 * others＝規則最終落腳那一轉、掛在同一個職業底下的非主流點法。規則是空陣列（研究檔還沒進來）
 * 或整條線都沒有規則時，main 回 null，呼叫端照「還沒有主流點法」處理，不是程式錯誤。
 */
export function rulesFor(rules: StatRule[], job: number): { main: StatRule | null; others: StatRule[]; inherited: boolean } {
  let current = job;
  let inherited = false;
  while (current > 0) {
    const atThisLevel = rules.filter(r => r.jobs.includes(current));
    const main = atThisLevel.find(r => r.mainstream) ?? null;
    if (main) return { main, others: atThisLevel.filter(r => r !== main), inherited };
    current = previousJob(current);
    inherited = true;
  }
  return { main: null, others: [], inherited: false };
}

/* ------------------------------------------------------------------ 武器 */

function offenseStat(weapon: GearWeapon, magic: boolean): number {
  return (magic ? weapon.mag : weapon.atk) ?? 0;
}

function eligibleWeapons(weapons: GearWeapon[], types: Set<string>, job: number, level: number): GearWeapon[] {
  return weapons.filter(w => types.has(w.s) && w.lv <= level && canJobUse(w.job, job) === true);
}

/**
 * 第一名（拿得到、符合職業與種類裡攻擊／魔力最高的，同分攻速數字小的先，再同分需求等級高的先）；
 * 備選最多兩把、彼此跟第一名都不同種類；下一把＝需求等級比現在高、攻擊／魔力比第一名高的第一把
 * （依需求等級由低到高，最近能換的排前面）。
 */
export function weaponPicks(
  weapons: GearWeapon[],
  job: number,
  level: number,
): { best: GearWeapon | null; alternatives: GearWeapon[]; next: GearWeapon | null } {
  const magic = isMagicJob(job);
  const types = new Set(weaponTypesFor(job));

  const sorted = eligibleWeapons(weapons, types, job, level).sort((a, b) => {
    const offense = offenseStat(b, magic) - offenseStat(a, magic);
    if (offense) return offense;
    const speed = (a.spd ?? Infinity) - (b.spd ?? Infinity);
    if (speed) return speed;
    return b.lv - a.lv;
  });

  const best = sorted[0] ?? null;
  const alternatives: GearWeapon[] = [];
  if (best) {
    for (const w of sorted.slice(1)) {
      if (w.s === best.s || alternatives.some(pick => pick.s === w.s)) continue;
      alternatives.push(w);
      if (alternatives.length === 2) break;
    }
  }

  const bestOffense = best ? offenseStat(best, magic) : -Infinity;
  const next =
    weapons
      .filter(w => types.has(w.s) && w.lv > level && canJobUse(w.job, job) === true && offenseStat(w, magic) > bestOffense)
      .sort((a, b) => a.lv - b.lv)[0] ?? null;

  return { best, alternatives, next };
}

/**
 * 從 1 等算到現在，每一等「當時拿得到的第一名」的力敏智幸需求，取各屬性出現過的最大值。
 * 不會因為等級到了之後換上的更強武器剛好沒寫某項需求（楓葉拳套不需要敏捷，但之前的狼牙拳套要 50）
 * 就讓那項需求往回掉——玩家點下去的能力值不會因為換裝備就消失。
 */
export function equipRequirement(weapons: GearWeapon[], job: number, level: number): Partial<Record<StatKey, number>> {
  const result: Partial<Record<StatKey, number>> = {};
  for (let l = 1; l <= level; l++) {
    const req = weaponPicks(weapons, job, l).best?.req;
    if (!req) continue;
    for (const key of STAT_KEYS) {
      const value = req[key];
      if (value === undefined) continue;
      if (result[key] === undefined || value > result[key]!) result[key] = value;
    }
  }
  return result;
}

/** 武器的力敏智幸需求比目標高的部分：「照這套點法敏捷還差 10」。沒寫需求或沒超過目標的不列。 */
export function statShortfall(weapon: GearWeapon, targets: Record<StatKey, number>): Array<{ stat: StatKey; short: number }> {
  const result: Array<{ stat: StatKey; short: number }> = [];
  for (const stat of STAT_KEYS) {
    const req = weapon.req?.[stat];
    if (req === undefined) continue;
    const short = req - targets[stat];
    if (short > 0) result.push({ stat, short });
  }
  return result;
}

/* ------------------------------------------------------------------ 衝卷 */

const MAIN_STAT_WORD: Record<StatKey, string> = { STR: "力量", DEX: "敏捷", INT: "智力", LUK: "幸運" };

/** 主屬性卷的部位順序；手套在這裡是「手套＋主屬性」卷，跟手套攻擊卷（武器家族後面那組）分開算 */
const MAIN_STAT_SLOTS = ["手套", "披風", "套服", "上衣", "褲裙", "鞋子", "耳環", "頭盔"];

/**
 * 推薦卷軸，依序：武器種類攻擊卷（法師是魔力卷；weaponType 給 null 時這個職業能用的每一種都各列一組）、
 * 手套攻擊卷（物理職業才有，法師沒有手套攻擊這種東西）、主屬性卷（披風、套服…裡名字對上主屬性的，
 * main 給 null 就不列）。拿不到的（這個部位目前篩不出任何卷軸）整組不出現；每組內依成功率高到低排。
 */
export function scrollPicks(
  scrolls: GearScroll[],
  job: number,
  weaponType: string | null,
  main: StatKey | null,
): Array<{ slot: string; stat: string; options: GearScroll[] }> {
  const magic = isMagicJob(job);
  const weaponStat = magic ? "魔力" : "攻擊";
  const weaponSlots = weaponType ? [weaponType] : weaponTypesFor(job);

  const families: Array<{ slot: string; stat: string; options: GearScroll[] }> = [];
  const addFamily = (slot: string, stat: string) => {
    const options = scrolls.filter(s => s.slot === slot && s.stat === stat).sort((a, b) => b.rate - a.rate);
    if (options.length) families.push({ slot, stat, options });
  };

  for (const slot of weaponSlots) addFamily(slot, weaponStat);
  if (!magic) addFamily("手套", "攻擊");
  if (main) for (const slot of MAIN_STAT_SLOTS) addFamily(slot, MAIN_STAT_WORD[main]);

  return families;
}

/* ------------------------------------------------------------------ 來源 */

type SourcePick =
  | { kind: "shop" }
  | { kind: "drop"; drop: NonNullable<GearSource["drops"]>[number] }
  | { kind: "quest"; quest: NonNullable<GearSource["quests"]>[number] };

function closestDrop(drops: NonNullable<GearSource["drops"]>, level: number) {
  return drops.reduce((best, drop) => {
    const diff = Math.abs(drop.lv - level);
    const bestDiff = Math.abs(best.lv - level);
    if (diff < bestDiff) return drop;
    if (diff === bestDiff && drop.lv < best.lv) return drop;
    return best;
  });
}

/**
 * 最好打的來源：商店優先；再來是掉落怪等級最接近你的（同分選等級低的那隻，比較好打）；
 * 最後是任務（列第一個）。
 *
 * beforeOpen＝true（10/15 前）時，要跨「掉落」「任務」兩層一起看現在真的拿得到什麼：
 * 先看掉落裡沒有 o 的（一樣取等級最接近的），沒有就看任務裡沒有 o 的（取第一個）；
 * 兩層都只剩 V002 的（或兩層都是空的）才整個退回正常順序（不分 o，掉落先於任務）。
 * 不然像「弩攻擊卷軸」這種掉落怪剛好只掛在 V002 地圖、但任務還是現在就能接的道具，
 * 會被「掉落優先」誤判成只能等 10/15，其實任務那條路現在就打得到。
 */
export function closestSource(src: GearSource, level: number, beforeOpen = false): SourcePick | null {
  if (src.shop) return { kind: "shop" };

  const drops = src.drops ?? [];
  const quests = src.quests ?? [];

  if (beforeOpen) {
    const openDrops = drops.filter(d => !d.o);
    if (openDrops.length) return { kind: "drop", drop: closestDrop(openDrops, level) };
    const openQuests = quests.filter(q => !q.o);
    if (openQuests.length) return { kind: "quest", quest: openQuests[0] };
    // 掉落、任務全部都是 V002 的（或兩邊都沒資料）：沒有「現在拿得到」的選項，退回正常順序。
  }

  if (drops.length) return { kind: "drop", drop: closestDrop(drops, level) };
  if (quests.length) return { kind: "quest", quest: quests[0] };

  return null;
}
