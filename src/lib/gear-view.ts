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
  kitStats,
  nearestUpgrade,
  rulesFor,
  scrollFamily,
  scrollPicks,
  statShortfall,
  statTargets,
  weaponPicks,
  weaponTypesFor,
  type GearData,
  type GearKit,
  type GearNote,
  type GearScroll,
  type GearWeapon,
  type StatKey,
  type StatRule,
} from "./gear";
import { jobTier, previousJob, stageJob } from "./jobs";

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

/** 「8,000 楓幣」：數字跟「楓幣」中間用不換行空白，手機上不會拆成兩行 */
function money(value: number): string {
  return `${formatNumber(value)} 楓幣`;
}

/** 掉落的前半句：「火肥肥（Lv.32）會掉」（畫面上這塊不斷行，地圖名接在後面） */
export function dropLead(drop: { n: string; lv: number }): string {
  return `${drop.n}（Lv.${drop.lv}）會掉`;
}

/**
 * 怎麼拿：「墮落城市武器店的曼斯塔賣 8,000 楓幣」「火肥肥（Lv.32）會掉・螞蟻洞」
 * 「Lv.40 任務〈珍的最後一個挑戰〉隨機給」（任務有等級限制才寫等級；好幾樣獎勵抽一樣寫「隨機給」）
 */
export function sourceText(pick: SourcePick, mapLabel: (id: number) => string): string {
  if (pick.kind === "shop") return `${pick.shop.p}${pick.shop.n ? `的${pick.shop.n}` : ""}賣 ${money(pick.shop.pr)}`;
  if (pick.kind === "craft") {
    const place = pick.craft.m !== undefined ? `${mapLabel(pick.craft.m)}的` : "";
    return `${place}${pick.craft.n}${pick.craft.rand ? "隨機合成" : "合成"}`;
  }
  if (pick.kind === "drop") return `${dropLead(pick.drop)}・${mapLabel(pick.drop.map)}`;
  return `${pick.quest.minLv ? `Lv.${pick.quest.minLv} ` : ""}任務〈${pick.quest.n}〉${pick.quest.rand ? "隨機給" : "給"}`;
}

/** 合成要的材料：「拳套、鋼鐵×3、動物皮×20、木材×30、5,000 楓幣」（只要 1 個就不寫×1） */
export function craftMaterialsText(craft: { mats: Array<{ n: string; c: number }>; fee?: number }): string {
  const parts = craft.mats.map(mat => (mat.c > 1 ? `${mat.n}×${formatNumber(mat.c)}` : mat.n));
  if (craft.fee) parts.push(money(craft.fee));
  return parts.join("、");
}

/** 這個來源是不是 V002 才開放（回開放日）：10/15 才開的城鎮的店、合成 NPC、只在 V002 地圖出現的怪、V002 任務 */
export function sourceOpensLater(pick: SourcePick): string | undefined {
  if (pick.kind === "shop") return pick.shop.o;
  if (pick.kind === "craft") return pick.craft.o;
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
 * 提醒寫了 tab 的，只在選了那套點法時出現（tab 是目前選的點法標籤）；沒寫 tab 的每套都出現。
 */
export function notesFor(notes: GearNote[], job: number, tab?: string): Array<{ topic: GearNote["topic"]; label: string; notes: GearNote[] }> {
  const groups: Array<{ topic: GearNote["topic"]; label: string; notes: GearNote[] }> = [];
  for (const [topic, label] of NOTE_TOPICS) {
    for (let current = job; current > 0; current = previousJob(current)) {
      const found = notes.filter(entry => entry.topic === topic && entry.jobs.includes(current) && (!entry.tab || entry.tab === tab));
      if (found.length) {
        groups.push({ topic, label, notes: found });
        break;
      }
    }
  }
  return groups;
}

/**
 * 卡片上方的點法切換：這個職業的主推跟其他點法裡有寫 tab 的，主推排第一。
 * 主推沒有 tab、或湊不到兩條，回空陣列（不出現切換——俠盜、劍士、弓箭手）。
 */
export function tabsFor(rules: StatRule[], job: number): Array<{ tab: string; rule: StatRule }> {
  const { main, others } = rulesFor(rules, job);
  if (!main?.tab) return [];
  const tabs = [main, ...others].filter(rule => rule.tab).map(rule => ({ tab: rule.tab!, rule }));
  return tabs.length > 1 ? tabs : [];
}

/* ------------------------------------------------------------------ 組裝 */

export type GearFamily = { slot: string; stat: string; options: GearScroll[]; pick: GearScroll; source: SourcePick | null };

/**
 * 要湊的裝備的一件：source 是去哪拿；closedAfter 只在拿法是有等級上限的任務時有，
 * 值是那個任務的最高等級（綠色斗笠的〈第一次同行〉30 等以後就接不到），畫面據此提醒要先接、或已經接不到。
 */
export type KitEntry = { piece: GearKit; source: SourcePick | null; closedAfter?: number };

export type GearPlan = {
  magic: boolean;
  rule: StatRule | null;
  others: StatRule[];
  /** 這一轉還沒有自己的點法，沿用上一轉的 */
  inherited: boolean;
  /** 卡片上方的點法切換（主推排第一）；這個職業沒有第二套就是空的 */
  tabs: Array<{ tab: string; rule: StatRule }>;
  /** 照這套點法現在的力敏智幸（空身，不含要湊的裝備）；沒有點法時 null */
  targets: Record<StatKey, number> | null;
  /**
   * 這套點法要湊的裝備（全幸的敏捷裝）：stat 是補哪個能力值、base 空身那格、wear 穿上之後、total 補了多少；
   * worn 現在穿得上的、later 還穿不上的（等級、需求不夠）。沒有要湊的裝備就是 null。
   */
  kit: {
    stat: StatKey;
    base: number;
    wear: number;
    total: number;
    worn: KitEntry[];
    later: KitEntry[];
  } | null;
  /** 選了第二套才有：這套的主屬性比主推（tab 是主推的標籤）多／少幾點；兩套一樣多（差 0）就是 null */
  diff: { tab: string; stat: StatKey; delta: number } | null;
  /** 選了第二套、主推這級用的武器跟現在用的、跟「再強一點」那把都不同才有；need＝要湊裝備的點法穿不上那把時，那把還要的副屬性 */
  compare: { tab: string; weapon: GearWeapon; need: { stat: StatKey; value: number } | null } | null;
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
  tabs: [],
  targets: null,
  kit: null,
  diff: null,
  compare: null,
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
 * beforeOpen（10/15 前）一路傳下去：能力值目標、武器只看現在拿得到的；來源不分開放前後都先推舊地區的（見 closestSource）。
 * 初心者（0）回空的一包。
 * tab 是卡片上方選的第二套點法（全幸、裝備法）：沒選、選了主推、選了這個職業沒有的標籤都照主推。
 */
export function gearPlan(gear: GearData, job: number, level: number, beforeOpen: boolean, tab?: string | null): GearPlan {
  const magic = isMagicJob(job);
  if (job <= 0) return { magic, ...EMPTY_PLAN };

  const found = rulesFor(gear.rules, job);
  const tabs = tabsFor(gear.rules, job);
  // 選了第二套（全幸、裝備法）就換那條；沒選、選了主推、這個職業沒有那個標籤都照主推
  const chosen = tab ? tabs.find(entry => entry.tab === tab && entry.rule !== found.main)?.rule ?? null : null;
  const rule = chosen ?? found.main;
  const others = chosen ? [found.main!, ...found.others].filter(other => other !== chosen) : found.others;
  const inherited = found.inherited;

  // 空身的四格（每個等級只算一次，weaponPicks 會拿很多等級來問）
  const baseAt = targetsAtFor(gear, job, rule, beforeOpen);
  const targets = baseAt ? baseAt(level) : null;
  // 穿不穿得上看「空身＋要湊的裝備」（全幸的敏捷裝）；沒有 kit 的點法就是空身
  const wearAt = rule?.kit?.length && baseAt ? (lv: number) => kitStats(rule.kit!, lv, baseAt(lv), beforeOpen).stats : baseAt;

  const picks = weaponPicks(gear.weapons, job, level, { targetsAt: wearAt, beforeOpen, types: rule?.weapons });
  const source = (weapon: GearWeapon) => closestSource(weapon.src, level, job);
  const wearNow = wearAt ? wearAt(level) : null;

  const kitNow = rule?.kit?.length && targets ? kitStats(rule.kit, level, targets, beforeOpen) : null;
  // 任務過了等級上限（綠色斗笠 31 等起接不到）還是算穿上的，不能只剩一件沒有出處的裝備：
  // 現在的等級沒有來源時，退到「剛好穿得上它的等級」，再不行退到任務本身的最低等級，照樣寫去哪拿
  const kitPick = (piece: GearKit): KitEntry => {
    const questFloor = Math.min(...(piece.src.quests ?? []).map(quest => quest.minLv ?? 1));
    const source =
      closestSource(piece.src, level, job) ??
      closestSource(piece.src, piece.lv, job) ??
      (Number.isFinite(questFloor) ? closestSource(piece.src, questFloor, job) : null);
    const closedAfter = source?.kind === "quest" ? source.quest.maxLv : undefined;
    return closedAfter === undefined ? { piece, source } : { piece, source, closedAfter };
  };
  const kit =
    kitNow && targets && rule
      ? {
          stat: rule.kit![0].stat,
          base: targets[rule.kit![0].stat],
          wear: kitNow.stats[rule.kit![0].stat],
          total: kitNow.worn.reduce((sum, piece) => sum + piece.v, 0),
          worn: kitNow.worn.map(kitPick),
          later: kitNow.later.map(kitPick),
        }
      : null;

  // 全幸：「再強一點」改成差最少點的那把（空身再點幾點就能用），不再找別的點法
  const stronger = kit && wearNow ? nearestUpgrade(gear.weapons, job, level, wearNow, picks.best, { beforeOpen, types: rule?.weapons }) : picks.stronger;

  // 選了第二套：跟主推比主屬性、主推這級用哪把
  let diff: GearPlan["diff"] = null;
  let compare: GearPlan["compare"] = null;
  if (chosen && found.main?.tab && targets) {
    const mainAt = targetsAtFor(gear, job, found.main, beforeOpen)!;
    const delta = targets[chosen.main] - mainAt(level)[chosen.main];
    // 兩套點到一樣多（盜賊 10 到 14 等全幸的幸運）就不寫「多 0 點」
    if (delta !== 0) diff = { tab: found.main.tab, stat: chosen.main, delta };
    const mainBest = weaponPicks(gear.weapons, job, level, { targetsAt: mainAt, beforeOpen, types: found.main.weapons }).best;
    // 主推這級用的跟現在選的這套用的、或這套的「再強一點」是同一把，就不再講第二次
    if (mainBest && mainBest.id !== picks.best?.id && mainBest.id !== stronger?.id) {
      const short = wearNow ? statShortfall(mainBest, wearNow)[0] : undefined;
      compare = { tab: found.main.tab, weapon: mainBest, need: kit && short ? { stat: short.stat, value: mainBest.req![short.stat]! } : null };
    }
  }

  // 要湊的裝備的卷軸分兩群：現在穿得上的（排前面）、還要等等級的（排最後，桑那服 30 等才拿得到，25 等的人先衝它沒用）
  const kitFamilies = (pieces: GearKit[]) =>
    pieces.flatMap(piece => (piece.scroll ? [scrollFamily(gear.scrolls, job, piece.scroll.slot, piece.scroll.stat, level)] : []));
  const families = mergeKitFamilies(
    scrollPicks(gear.scrolls, job, picks.best?.s ?? null, rule?.main ?? null, level),
    kitFamilies(kitNow?.worn ?? []),
    kitFamilies(kitNow?.later ?? rule?.kit ?? []),
  ).map(family => {
    const pick = familyPick(family.options, beforeOpen);
    return { ...family, pick, source: closestSource(pick.src, level, job) };
  });

  return {
    magic,
    rule,
    others,
    inherited,
    tabs,
    targets,
    kit,
    diff,
    compare,
    best: picks.best,
    bestSource: picks.best ? source(picks.best) : null,
    bestShort: picks.best && wearNow ? statShortfall(picks.best, wearNow) : [],
    alternatives: picks.alternatives.map(weapon => ({ weapon, source: source(weapon) })),
    next: picks.next,
    stronger,
    strongerShort: stronger && wearNow ? statShortfall(stronger, wearNow) : [],
    strongerVia: !kit && stronger ? otherRuleThatWears(gear, job, level, others, stronger, beforeOpen) : null,
    families,
    notes: notesFor(gear.notes, job, rule?.tab),
  };
}

/** 這套點法空身的四格，每個等級只算一次；equip 類型才吃 equipRequirement。沒有點法回 undefined */
function targetsAtFor(gear: GearData, job: number, rule: StatRule | null, beforeOpen: boolean) {
  if (!rule) return undefined;
  const cache = new Map<number, Record<StatKey, number>>();
  return (lv: number) => {
    let targets = cache.get(lv);
    if (!targets) {
      const equipReq = rule.secondary?.type === "equip" ? equipRequirement(gear.weapons, job, lv, rule, beforeOpen) : undefined;
      targets = statTargets(rule, lv, equipReq);
      cache.set(lv, targets);
    }
    return targets;
  };
}

/**
 * 要湊的裝備的卷軸（全幸：套服敏捷、披風敏捷）插進衝卷。
 * now＝現在穿得上的裝備的卷軸：第一組最前面（這套點法靠它穿得上武器），其餘排在武器卷後面；
 * soon＝還要等等級的裝備的卷軸（400 的桑那服 30 等才拿得到）：一律排最後，不然 10 到 29 等第一組會是衝不到的套服卷。
 * 原本就有同一組的不重複；now 是空的就是「武器卷、soon」。
 */
function mergeKitFamilies<T extends { slot: string; stat: string }>(base: T[], now: Array<T | null>, soon: Array<T | null>): T[] {
  const seen: T[] = [...base];
  const fresh = (families: Array<T | null>): T[] =>
    families.flatMap(family => {
      if (family === null || seen.some(s => s.slot === family.slot && s.stat === family.stat)) return [];
      seen.push(family);
      return [family];
    });
  const nowFamilies = fresh(now);
  const soonFamilies = fresh(soon);
  return [...nowFamilies.slice(0, 1), ...base.slice(0, 1), ...nowFamilies.slice(1), ...base.slice(1), ...soonFamilies];
}

/* ------------------------------------------------------------------ 升級路線每一段 */

export type BandWeapon = { level: number; weapon: GearWeapon; source: SourcePick | null };
export type BandGear = { weapons: BandWeapon[]; families: GearFamily[] };

/**
 * 這一級用哪套點法：已經是選的職業就用它的主流；還沒轉到（俠盜 25 等還是一轉盜賊）用那一轉的點法——
 * 那一轉有好幾套時，挑武器種類跟選的職業對得上的那套（槍手一轉照「力量＝等級」用火槍、弩弓手照「一轉先拿弩」），
 * 都對不上就用那一轉的主流（一轉盜賊不管之後走刺客還是俠盜都是丟標，2026-10-07 使用者）。
 */
function ruleAt(rules: StatRule[], job: number, stage: number): StatRule | null {
  if (stage === job) return rulesFor(rules, job).main;
  const wanted = weaponTypesFor(job);
  const matching = rules.find(rule => rule.jobs.includes(stage) && rule.weapons?.some(type => wanted.includes(type)));
  return matching ?? rulesFor(rules, stage).main;
}

/**
 * 升級路線一段（from 到 to，兩頭都算）裡該拿的武器：每一級算一次照點法穿得上、現在拿得到的最強那把，
 * 只列換武器的那一級（30 等拿 A、35 等換 B）；卷只列武器卷跟手套攻擊卷（部位的主屬性卷不隨等級變，留在首頁卡片）。
 * 還沒轉到選的職業的那幾級，用那一轉實際用的武器（見 ruleAt）。初心者回空的。
 */
export function bandGear(gear: GearData, job: number, from: number, to: number, beforeOpen: boolean): BandGear {
  if (job <= 0) return { weapons: [], families: [] };
  const cache = new Map<string, Record<StatKey, number>>();
  const weapons: BandWeapon[] = [];
  let lastStage = job;
  for (let level = Math.max(1, from); level <= to; level++) {
    const stage = stageJob(job, level);
    if (stage <= 0) continue;
    const rule = ruleAt(gear.rules, job, stage);
    const targetsAt = rule
      ? (lv: number) => {
          const key = `${stage}|${rule.label}|${lv}`;
          let targets = cache.get(key);
          if (!targets) {
            const equipReq = rule.secondary?.type === "equip" ? equipRequirement(gear.weapons, stage, lv, rule, beforeOpen) : undefined;
            targets = statTargets(rule, lv, equipReq);
            cache.set(key, targets);
          }
          return targets;
        }
      : undefined;
    const best = weaponPicks(gear.weapons, stage, level, { targetsAt, beforeOpen, types: rule?.weapons }).best;
    if (!best || weapons[weapons.length - 1]?.weapon.id === best.id) continue;
    weapons.push({ level, weapon: best, source: closestSource(best.src, level, stage) });
    lastStage = stage;
  }
  const last = weapons[weapons.length - 1];
  // main 給 null：只要武器卷跟手套攻擊卷
  const families = scrollPicks(gear.scrolls, lastStage, last?.weapon.s ?? null, null, to).map(family => {
    const pick = familyPick(family.options, beforeOpen);
    return { ...family, pick, source: closestSource(pick.src, from, lastStage) };
  });
  return { weapons, families };
}

