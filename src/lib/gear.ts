/**
 * 首頁「能力值＋裝備＋衝卷」卡（v0.27）的純函式。
 * 資料來自 public/data/gear.json（pipeline/build-gear.mjs 產出，格式見該檔開頭註解與
 * docs/superpowers/specs/2026-10-06-gear-card-design.md）。這裡不碰畫面，只算數字跟排序。
 */
import { canJobUse } from "./item-view";
import { baseJob, previousJob } from "./jobs";
import { rewardFitsJob } from "./now-plan";

/* ------------------------------------------------------------------ 資料型別（對應 public/data/gear.json，兩邊要一致） */

export type GearSource = {
  /**
   * 哪幾家店賣（items.json 的 sp，只留開放的地圖或有名字的城鎮、不含商城）：p 地點、n NPC、m 地圖、pr 楓幣；
   * o：店在 10/15 才開的城鎮（冰原雪域、天空之城）。現在就開的排前面、再比便宜，最多 3 家。
   */
  shops?: Array<{ p: string; n?: string; m?: number; pr: number; o?: string }>;
  /**
   * 城鎮 NPC 合成（墮落城市的後街吉姆做狼牙）：n NPC、m 地圖、mats 材料、fee 楓幣、rand 隨機給、o 10/15 才開的城鎮。
   * 台服經典版很多武器是這樣拿的（狼牙的店都在還沒開的城鎮，2026-10-07 使用者確認墮落城市武器店沒賣）。
   */
  crafts?: Array<{ n: string; m?: number; mats: Array<{ id: number; n: string; c: number }>; fee?: number; rand?: 1; o?: string }>;
  /** 掉落怪：只收出現在已開放地圖的怪，依怪物等級由低到高，最多 8 隻；map 是牠出現的一張已開放地圖（優先不是 V002 的） */
  drops?: Array<{ m: number; n: string; lv: number; map: number; o?: string }>;
  /**
   * 給這個道具的已開放任務（quests.json 有的、接任務的 NPC 在開放地圖）；o：V002 任務（同 src/lib/v002.ts 的規則）；
   * minLv：連同前置任務一路上去最高的需求等級；maxLv：等級上限；rand：好幾樣獎勵抽一樣；
   * jobs：任務限定的職業代碼；rj：這個獎勵限定的職業旗標（跟任務獎勵的 job 同一套，見 now-plan rewardFitsJob）
   */
  quests?: Array<{ id: string; n: string; minLv?: number; maxLv?: number; rand?: 1; o?: string; jobs?: number[]; rj?: number }>;
};

type GearShop = NonNullable<GearSource["shops"]>[number];
type GearCraft = NonNullable<GearSource["crafts"]>[number];
type GearQuest = NonNullable<GearSource["quests"]>[number];

/**
 * 這個職業接不接得到這個任務、拿不拿得到這個獎勵（弓攻擊卷軸只發給弓箭手）；
 * 給了 level 再看等級上限（超過就接不了了）。
 */
export function questFits(quest: GearQuest, job: number, level?: number): boolean {
  if (quest.jobs?.length && !quest.jobs.includes(job)) return false;
  if (level !== undefined && quest.maxLv !== undefined && level > quest.maxLv) return false;
  return quest.rj === undefined || rewardFitsJob({ job: quest.rj }, job);
}

/**
 * 這個職業拿不拿得到：有商店或掉落就拿得到；只有任務時，至少要有一個任務是這個職業接得到、獎勵也發給這個職業的
 * （給了 level 也看等級上限）。完全沒有來源資料的（只會出現在測試）不在這裡擋，交給 pipeline 保證每一筆都有來源。
 */
export function obtainableBy(src: GearSource, job: number, level?: number): boolean {
  if (src.shops?.length || src.crafts?.length || src.drops?.length) return true;
  const quests = src.quests ?? [];
  return !quests.length || quests.some(quest => questFits(quest, job, level));
}

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

/**
 * 這套點法要湊的裝備（全幸的敏捷裝），pipeline/lib/gear.mjs 的 buildKit 從遊戲資料換算：
 * ids 是同一件裝備的各個道具代碼、n 名稱、slot 部位、lv 需求等級、stat／v 穿上後加哪個能力值加多少、
 * req 穿它本身要的能力值、scroll 這件裝備要衝的卷軸（id 是代表的那張卷軸）、src 怎麼拿、o 只有 V002 才拿得到。
 */
export type GearKit = {
  ids: number[];
  n: string;
  slot: string;
  lv: number;
  stat: StatKey;
  v: number;
  req?: Partial<Record<StatKey, number>>;
  scroll?: { id: number; n: string; slot: string; stat: string; rate: number; times: number };
  src: GearSource;
  o?: string;
};

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
  /** 這套點法用的武器種類（一轉盜賊「拳套需求」只看拳套）；沒寫就照職業能用的全部 */
  weapons?: string[];
  /** 卡片上方切換用的標籤字（「全幸」「裝備法」）；主推跟另一套都有才出現切換 */
  tab?: string;
  /** 點法按鈕下那行白話說明：選中這套的好處跟代價（「前期打得比較痛，但敏捷要靠裝備湊」），取自研究檔已有出處的玩家說法 */
  tabText?: string;
  /** 這套點法要湊的裝備：武器、防具要的副屬性靠這些補（全幸的敏捷） */
  kit?: GearKit[];
  t: string;
  s: string[];
  v: "tw" | "community" | "legacy";
  mainstream: boolean;
};

/**
 * 法師防具（pipeline/lib/gear.mjs 的 buildArmor）：給「裝備法」挑每個部位穿得上的。只收職業限制含法師、拿得到的；
 * slot 部位（帽子、套服、上衣、褲裙、鞋子、手套、盾牌）、lv 需求等級、req 要的能力值、job reqJob 位元、src 怎麼拿、o 只有 V002 才拿得到。
 * 陣列已排好：部位、等級低到高，同等級加智力多的、防禦高的、拿法多的先——挑的時候同等級取第一件。
 */
export type GearArmor = {
  id: number;
  n: string;
  slot: string;
  lv: number;
  req?: Partial<Record<StatKey, number>>;
  job: number;
  src: GearSource;
  o?: string;
};

export type GearNote = {
  jobs: number[];
  topic: "weapon" | "scroll" | "armor" | "stat";
  t: string;
  s: string[];
  v: "tw" | "community" | "legacy";
  items?: number[];
  /** 只在這套點法出現（「裝備法」的轉換提醒）；沒寫就每套都出現 */
  tab?: string;
};

export type GearData = {
  builtAt: string;
  weapons: GearWeapon[];
  scrolls: GearScroll[];
  /** 法師防具（v0.76 起才有；舊的 gear.json、測試假資料沒有就當沒有） */
  armor?: GearArmor[];
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

/**
 * 空身能力值加上要湊的裝備：等級到了、要求的能力值（空身＋已經穿上的）夠了才算穿上，
 * 一直套到沒有新的能穿為止——破舊的披風 +5 讓敏捷到 30，才戴得上要敏捷 30 的綠色斗笠，跟研究檔寫的順序無關。
 * worn 照研究檔順序；later 是還穿不上的（等級不夠、需求不夠、10/15 前只有 V002 拿得到）。
 */
export function kitStats(
  kit: GearKit[],
  level: number,
  base: Record<StatKey, number>,
  beforeOpen = false,
): { stats: Record<StatKey, number>; worn: GearKit[]; later: GearKit[] } {
  const stats = { ...base };
  const wornSet = new Set<GearKit>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const piece of kit) {
      if (wornSet.has(piece) || piece.lv > level || (beforeOpen && piece.o)) continue;
      if (!STAT_KEYS.every(key => (piece.req?.[key] ?? 0) <= stats[key])) continue;
      stats[piece.stat] += piece.v;
      wornSet.add(piece);
      changed = true;
    }
  }
  return { stats, worn: kit.filter(piece => wornSet.has(piece)), later: kit.filter(piece => !wornSet.has(piece)) };
}

/** 卷軸效果原文裡這個能力值加幾點：「DEX+2，命中率+1」→ 2；沒寫回 0 */
function effectGain(effect: string, stat: StatKey): number {
  return Number(new RegExp(`\\b${stat}\\+(\\d+)`).exec(effect)?.[1] ?? 0);
}

/**
 * 運氣好的上限：要湊的裝備裡有寫卷軸的那幾件，改衝同部位同屬性、這個成功率（60%）的那張，全部成功時各加多少。
 * 道具本身的點數＝原本的 v － 衝卷次數 × 100% 那張加的點數；新的 v＝道具本身＋次數 × 這張加的點數
 * （桑那服 10 次：100% 每張 +1 是 10，60% 每張 +2 就是 20）。卷軸效果照遊戲資料，不寫死。
 * 這個成功率沒有卷、或 10/15 前只有 V002 拿得到的那件照原本；一件都換不到回 null。沒換的件回傳同一個物件。
 */
export function luckyKit(kit: GearKit[], scrolls: GearScroll[], job: number, rate: number, beforeOpen = false): GearKit[] | null {
  let changed = false;
  const result = kit.map(piece => {
    const used = piece.scroll;
    if (!used) return piece;
    const family = scrollFamily(scrolls, job, used.slot, used.stat);
    const from = family?.options.find(option => option.rate === used.rate);
    const to = family?.options.find(option => option.rate === rate && !(beforeOpen && option.o));
    const perFrom = from ? effectGain(from.effect, piece.stat) : 0;
    const perTo = to ? effectGain(to.effect, piece.stat) : 0;
    if (!to || !perFrom || !perTo) return piece;
    changed = true;
    return { ...piece, v: piece.v - used.times * perFrom + used.times * perTo, scroll: { ...used, id: to.id, rate: to.rate } };
  });
  return changed ? result : null;
}

/** 法師防具挑件的部位：套服跟「上衣＋褲裙」二選一（見 armorPicks） */
const ARMOR_SLOTS = ["帽子", "套服", "上衣", "褲裙", "鞋子", "手套", "盾牌"];

/**
 * 每個部位現在拿得到、穿得上（照 wear）、等級最高的那件法師防具：帽子、身上、鞋子、手套、盾牌各一件。
 * 身上：上衣跟褲裙都有、而且兩件都比套服高等才列兩件，不然列套服（沒有套服才只列有的那件）。
 * 同等級取陣列裡第一件（pipeline 已照加智力、防禦、拿法多寡排好）。10/15 前不收只有 V002 拿得到的。
 */
export function armorPicks(armor: GearArmor[], job: number, level: number, wear: Record<StatKey, number>, beforeOpen = false): GearArmor[] {
  const usable = armor.filter(
    piece => canJobUse(piece.job, job) === true && piece.lv <= level && !(beforeOpen && piece.o) && obtainableBy(piece.src, job, level) && canWear(piece, wear),
  );
  const top = (slot: string): GearArmor | null => {
    const inSlot = usable.filter(piece => piece.slot === slot);
    const highest = Math.max(...inSlot.map(piece => piece.lv));
    return inSlot.find(piece => piece.lv === highest) ?? null;
  };
  const [hat, overall, shirt, pants, shoes, gloves, shield] = ARMOR_SLOTS.map(top);
  const body = shirt && pants && (!overall || Math.min(shirt.lv, pants.lv) > overall.lv) ? [shirt, pants] : overall ? [overall] : [shirt, pants];
  return [hat, ...body, shoes, gloves, shield].filter((piece): piece is GearArmor => piece !== null);
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

/** 有能力值需求的東西（武器、法師防具） */
type Wearable = { req?: Partial<Record<StatKey, number>> };

/** 這把武器（或這件防具）穿不穿得上：每一項需求都要 ≤ 對應的能力值目標；沒寫需求就沒有限制。 */
export function canWear(item: Wearable, targets: Record<StatKey, number>): boolean {
  if (!item.req) return true;
  return STAT_KEYS.every(key => (item.req![key] ?? 0) <= targets[key]);
}

/**
 * 職業能選的武器候選：物理職業照種類（weaponTypesFor）＋職業限制；
 * 法師系不卡種類——雨傘（分類是單手劍）、烈焰刃這類道具只要寫了魔攻、職業用得到就算候選，
 * 比的是魔攻不是種類（火毒巫師 40 等主流武器是黃色雨傘，不是短杖／長杖）。
 */
function candidatePool(weapons: GearWeapon[], job: number, magic: boolean, only?: string[]): GearWeapon[] {
  const usable = (w: GearWeapon) => canJobUse(w.job, job) === true && obtainableBy(w.src, job);
  if (magic) return weapons.filter(w => (w.mag ?? 0) > 0 && usable(w));
  // 點法指定了武器種類（一轉海盜「指虎需求」）就只看那幾種，不然力量流會被推火槍
  const types = new Set(weaponTypesFor(job).filter(type => !only?.length || only.includes(type)));
  return weapons.filter(w => types.has(w.s) && usable(w));
}

/** best／alternatives／stronger 的排序：攻擊／魔力高的在前；同分攻速數字小的先；再同分需求等級高的先；再同分非 V002 的先。 */
function rankWeapon(a: GearWeapon, b: GearWeapon, magic: boolean): number {
  const offense = offenseStat(b, magic) - offenseStat(a, magic);
  if (offense) return offense;
  const speed = (a.spd ?? Infinity) - (b.spd ?? Infinity);
  if (speed) return speed;
  const level = b.lv - a.lv;
  if (level) return level;
  const open = Number(Boolean(a.o)) - Number(Boolean(b.o));
  if (open) return open;
  // 數值一模一樣（青銅／銀／黑守護拳套）：拿法越多的越好拿（銀守護拳套能合成、兩隻怪會掉）
  return sourceCount(b.src) - sourceCount(a.src);
}

function sourceCount(src: GearSource): number {
  return (src.shops?.length ?? 0) + (src.crafts?.length ?? 0) + (src.drops?.length ?? 0) + (src.quests?.length ?? 0);
}

/** next 的排序：需求等級低的先（最近能換的）；同分非 V002 的先；再同分攻擊／魔力高的先；再同分攻速數字小的先。 */
function rankNext(a: GearWeapon, b: GearWeapon, magic: boolean): number {
  const level = a.lv - b.lv;
  if (level) return level;
  const openFirst = Number(Boolean(a.o)) - Number(Boolean(b.o));
  if (openFirst) return openFirst;
  const offense = offenseStat(b, magic) - offenseStat(a, magic);
  if (offense) return offense;
  return (a.spd ?? Infinity) - (b.spd ?? Infinity);
}

/**
 * best＝拿得到、職業能用、穿得上（有給 `targetsAt` 才檢查穿不穿得上）裡攻擊／魔力最高的；
 * alternatives＝最多兩把、彼此跟 best 都不同種類的次佳；
 * stronger＝不管穿不穿得上、攻擊／魔力比 best 還高的那把（沒有就 null）——
 * 用來顯示「想用更強的，幸運還差 N」，而不是直接把穿不上的武器當 best 推薦出去
 * （火毒巫師全智點法：護法之杖魔攻更高但要幸運 43，穿不上，不該是 best）；
 * next＝需求等級比現在高、攻擊／魔力比 best 高的第一把，依「最近能換的」排序、同分優先選非 V002 的——
 * 10/15 前 next 仍可能是只有 V002 來源的武器（nothing else），畫面自己標「10/15 開放」，
 * 這裡不因為 beforeOpen 就直接濾掉（跟 best／alternatives／stronger 不同）。
 */
export function weaponPicks(
  weapons: GearWeapon[],
  job: number,
  level: number,
  opts: { targetsAt?: (level: number) => Record<StatKey, number>; beforeOpen?: boolean; types?: string[] } = {},
): { best: GearWeapon | null; alternatives: GearWeapon[]; next: GearWeapon | null; stronger: GearWeapon | null } {
  const magic = isMagicJob(job);
  const { targetsAt, beforeOpen, types } = opts;
  const pool = candidatePool(weapons, job, magic, types);

  // 現在拿得到：等級夠、10/15 前不收只有 V002 才拿得到的、只靠任務拿的要現在還接得了（沒過等級上限）
  const eligibleNow = pool.filter(w => w.lv <= level && (!beforeOpen || !w.o) && obtainableBy(w.src, job, level));
  const wearableNow = targetsAt ? eligibleNow.filter(w => canWear(w, targetsAt(level))) : eligibleNow;

  const rankedWearable = [...wearableNow].sort((a, b) => rankWeapon(a, b, magic));
  const best = rankedWearable[0] ?? null;

  const alternatives: GearWeapon[] = [];
  if (best) {
    for (const w of rankedWearable.slice(1)) {
      // 差太多的不算備選：攻擊／魔力不到第一名八成就停（已依攻擊排序，後面只會更低）——40 等法師不該看到 8 等新手短杖
      if (offenseStat(w, magic) < offenseStat(best, magic) * 0.8) break;
      if (w.s === best.s || alternatives.some(pick => pick.s === w.s)) continue;
      alternatives.push(w);
      if (alternatives.length === 2) break;
    }
  }

  // stronger：比 best 強、但照這套點法穿不上的裡面，最划算的那把——多出來的攻擊／魔力除以缺的點數最高
  // （黑色雨傘多 33 魔力只缺力敏幸各 2，勝過多 38 魔力卻要幸運再多 39 的杖；75 等祭司則是魔力 90 的死靈法杖）。
  // 只強一點點的不值得換點法：至少要多 5 點或一成（妖精短杖 53 對黃色雨傘 52 不列）。沒給 targetsAt 就沒有「穿不上」可言。
  const bestOffense = best ? offenseStat(best, magic) : -Infinity;
  const targetsNow = targetsAt?.(level);
  const missing = (w: GearWeapon) =>
    targetsNow ? statShortfall(w, targetsNow).reduce((sum, entry) => sum + entry.short, 0) : 0;
  const worth = (w: GearWeapon) => (offenseStat(w, magic) - bestOffense) / Math.max(1, missing(w));
  const stronger =
    best && targetsNow
      ? eligibleNow
          .filter(w => offenseStat(w, magic) >= bestOffense + Math.max(5, Math.ceil(bestOffense * 0.1)) && !canWear(w, targetsNow))
          .sort((a, b) => worth(b) - worth(a) || rankWeapon(a, b, magic))[0] ?? null
      : null;

  const nextCandidates = pool.filter(w => {
    if (w.lv <= level || offenseStat(w, magic) <= bestOffense) return false;
    if (!obtainableBy(w.src, job, w.lv)) return false;
    return !targetsAt || canWear(w, targetsAt(w.lv));
  });
  const next = nextCandidates.sort((a, b) => rankNext(a, b, magic))[0] ?? null;

  return { best, alternatives, next, stronger };
}

/**
 * 「空身再點幾點就能用」的那把：拿得到、比現在這把強、照 wear 穿不上的裡面，差的點數加起來最少的；
 * 同分攻擊／魔力高的先。全幸用：35 等差 6 點敏捷的狼牙，比差 26 點的銀守護拳套實際。
 */
export function nearestUpgrade(
  weapons: GearWeapon[],
  job: number,
  level: number,
  wear: Record<StatKey, number>,
  best: GearWeapon | null,
  opts: { beforeOpen?: boolean; types?: string[] } = {},
): GearWeapon | null {
  const magic = isMagicJob(job);
  const bestOffense = best ? offenseStat(best, magic) : -Infinity;
  const missing = (w: GearWeapon) => statShortfall(w, wear).reduce((sum, entry) => sum + entry.short, 0);
  return (
    candidatePool(weapons, job, magic, opts.types)
      .filter(w => w.lv <= level && (!opts.beforeOpen || !w.o) && obtainableBy(w.src, job, level))
      .filter(w => offenseStat(w, magic) > bestOffense && !canWear(w, wear))
      // 差的點數一樣、攻擊也一樣時，照 weaponPicks 的排法（攻速、等級、非 V002、拿法多）決定，不看資料裡的順序
      .sort((a, b) => missing(a) - missing(b) || offenseStat(b, magic) - offenseStat(a, magic) || rankWeapon(a, b, magic))[0] ?? null
  );
}

/**
 * 從 1 等算到現在，每一等「當時拿得到的第一名」的力敏智幸需求，取各屬性出現過的最大值；
 * 事先濾掉這套點法另外兩項（非 main、非 secondary.stat）需求超過 4 的武器——
 * 那兩項這套點法本來就不會點超過 4，那種武器不管哪個等級都穿不上，不該拿來決定
 * secondary 這項該點多少（俠盜全幸：華氏短劍要力量 40，但全幸點法力量就停在 4；
 * 不能因為它敏捷需求也很高就把 DEX 目標拉到那邊去，其實它本來就穿不上，問題不在敏捷）。
 * 不會因為等級到了之後換上的更強武器剛好沒寫某項需求（楓葉拳套不需要敏捷，但之前的狼牙拳套要 50）
 * 就讓那項需求往回掉——玩家點下去的能力值不會因為換裝備就消失。
 */
export function equipRequirement(
  weapons: GearWeapon[],
  job: number,
  level: number,
  rule: StatRule,
  beforeOpen = false,
): Partial<Record<StatKey, number>> {
  const secondaryStat = rule.secondary?.stat;
  const otherKeys = STAT_KEYS.filter(key => key !== rule.main && key !== secondaryStat);
  const candidates = weapons.filter(w => otherKeys.every(key => (w.req?.[key] ?? 0) <= STAT_FLOOR));

  const result: Partial<Record<StatKey, number>> = {};
  for (let l = 1; l <= level; l++) {
    // beforeOpen 跟 weaponPicks 一樣：10/15 前只看現在拿得到的武器，能力值目標才對得上畫面推薦的那把
    const req = weaponPicks(candidates, job, l, { beforeOpen, types: rule.weapons }).best?.req;
    if (!req) continue;
    for (const key of STAT_KEYS) {
      const value = req[key];
      if (value === undefined) continue;
      if (result[key] === undefined || value > result[key]!) result[key] = value;
    }
  }
  return result;
}

/** 武器（或防具）的力敏智幸需求比目標高的部分：「照這套點法敏捷還差 10」。沒寫需求或沒超過目標的不列。 */
export function statShortfall(item: Wearable, targets: Record<StatKey, number>): Array<{ stat: StatKey; short: number }> {
  const result: Array<{ stat: StatKey; short: number }> = [];
  for (const stat of STAT_KEYS) {
    const req = item.req?.[stat];
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

/** 一個部位一種屬性的一組卷軸（100%／60%／10%），只收這個職業拿得到的、成功率高的在前；一張都沒有回 null */
export function scrollFamily(
  scrolls: GearScroll[],
  job: number,
  slot: string,
  stat: string,
  level?: number,
): { slot: string; stat: string; options: GearScroll[] } | null {
  const options = scrolls.filter(s => s.slot === slot && s.stat === stat && obtainableBy(s.src, job, level)).sort((a, b) => b.rate - a.rate);
  return options.length ? { slot, stat, options } : null;
}

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
  level?: number,
): Array<{ slot: string; stat: string; options: GearScroll[] }> {
  const magic = isMagicJob(job);
  const weaponStat = magic ? "魔力" : "攻擊";
  const weaponSlots = weaponType ? [weaponType] : weaponTypesFor(job);

  const families: Array<{ slot: string; stat: string; options: GearScroll[] }> = [];
  const addFamily = (slot: string, stat: string) => {
    const family = scrollFamily(scrolls, job, slot, stat, level);
    if (family) families.push(family);
  };

  for (const slot of weaponSlots) addFamily(slot, weaponStat);
  if (!magic) addFamily("手套", "攻擊");
  if (main) for (const slot of MAIN_STAT_SLOTS) addFamily(slot, MAIN_STAT_WORD[main]);

  return families;
}

/* ------------------------------------------------------------------ 來源 */

export type SourcePick =
  | { kind: "shop"; shop: GearShop }
  | { kind: "craft"; craft: GearCraft }
  | { kind: "drop"; drop: NonNullable<GearSource["drops"]>[number] }
  | { kind: "quest"; quest: NonNullable<GearSource["quests"]>[number] };

/**
 * 這個來源對你多難：不高於你等級的怪，差幾級算幾分（越接近越好、低等怪一定打得過）；
 * 比你高的怪差距算兩倍（打不太動）。任務現在接得到算 0（一定拿得到），等級還不夠的差距算兩倍。
 */
function dropCost(drop: NonNullable<GearSource["drops"]>[number], level: number): number {
  return drop.lv <= level ? level - drop.lv : (drop.lv - level) * 2;
}

function questCost(quest: GearQuest, level: number): number {
  const need = quest.minLv ?? 0;
  // 好幾樣獎勵抽一樣（珍的最後一個挑戰：60%、10% 隨機給一張）不一定拿得到想要的那張，多算 10 分，讓穩定的掉落優先
  return (need <= level ? 0 : (need - level) * 2) + (quest.rand ? 10 : 0);
}

/** 掉落跟任務一起比 dropCost／questCost，最小的勝；同分任務優先（一定拿得到），再同分選等級低的怪 */
function easiest(drops: NonNullable<GearSource["drops"]>, quests: GearQuest[], level: number): SourcePick | null {
  let pick: SourcePick | null = null;
  let pickCost = Infinity;
  for (const quest of quests) {
    const cost = questCost(quest, level);
    if (cost < pickCost) {
      pick = { kind: "quest", quest };
      pickCost = cost;
    }
  }
  for (const drop of drops) {
    const cost = dropCost(drop, level);
    const better = cost < pickCost || (cost === pickCost && pick?.kind === "drop" && drop.lv < pick.drop.lv);
    if (better) {
      pick = { kind: "drop", drop };
      pickCost = cost;
    }
  }
  return pick;
}

/**
 * 最好拿的來源：商店優先；否則掉落跟任務一起比誰最好拿（見 dropCost／questCost）——
 * 35 等刺客的手套攻擊卷軸推 40 等任務「珍的最後一個挑戰」，不推 55 等巨居蟹。
 *
 * 舊地區拿得到的一律先推：先只看沒有 o 的店、合成、掉落跟任務；全部都是 V002 的（或都沒資料）才退回不分 o。
 * 10/15 開放後也一樣（2026-10-07 使用者拍板）：不然低等的武器會改推冰原雪域、天空之城的店
 * （狼牙不推後街吉姆合成、改推斯考特賣 60,000 楓幣），V002 的怪也會蓋過舊地區打得到的怪。
 * 「弩攻擊卷軸」這種掉落怪剛好只掛在 V002 地圖、但舊地區任務接得到的，推任務。
 *
 * 給了 job：只看這個職業接得到、獎勵也發給這個職業的任務（questFits）。
 */
export function closestSource(src: GearSource, level: number, job?: number): SourcePick | null {
  const shops = src.shops ?? [];
  const drops = src.drops ?? [];
  // 接不到的任務不算：職業不對、獎勵不發給這個職業、過了等級上限
  const quests = (src.quests ?? []).filter(quest => job === undefined || questFits(quest, job, level));

  // 合成：材料湊齊就一定做得出來，比要看運氣的掉落、任務可靠，排在商店後面
  const crafts = src.crafts ?? [];
  // 先找舊地區的店、合成 NPC，再找舊地區打得到的怪、接得到的任務
  const openShop = shops.find(shop => !shop.o);
  if (openShop) return { kind: "shop", shop: openShop };
  const openCraft = crafts.find(craft => !craft.o);
  if (openCraft) return { kind: "craft", craft: openCraft };
  const open = easiest(drops.filter(drop => !drop.o), quests.filter(quest => !quest.o), level);
  if (open) return open;
  if (shops.length) return { kind: "shop", shop: shops[0] };
  if (crafts.length) return { kind: "craft", craft: crafts[0] };
  return easiest(drops, quests, level);
}
