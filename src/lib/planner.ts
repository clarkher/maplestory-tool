import type { FarmingRow, Item, MapRecord, Monster, Profile, Quest, TrainingRow } from "./types";

/* ------------------------------------------------------------------ 職業 */

/**
 * 一個職業的所有前身。三轉遊俠做得了獵人時期的任務，反過來不行，
 * 所以任務的職業條件要拿「自己 + 前身」去比對。
 * 代碼規則：312 → 310 → 300 → 0；皇家騎士團 1112 → 1110 → 1100 → 1000 → 0。
 */
export function jobLineage(job: number): number[] {
  const chain: number[] = [];
  let current = job;
  while (current > 0) {
    chain.push(current);
    if (current % 10 !== 0) current -= current % 10;
    else if (current % 100 !== 0) current -= current % 100;
    else if (current % 1000 !== 0) current -= current % 1000;
    else current = 0;
  }
  chain.push(0);
  return chain;
}

/* ------------------------------------------------------------------ 任務 */

export type QuestBucket = "expiring" | "fresh" | "backlog";

export type QuestPlan = {
  quest: Quest;
  /** 前置任務都做完才叫可接；這裡列出還沒滿足的前置 */
  blockedBy: string[];
  /** 這條任務鏈的名稱，用來把同一串任務收在一起 */
  chain: string;
  /** 分組：快過期 / 剛解鎖 / 早該做了 */
  bucket: QuestBucket;
  /** 還剩幾級這個任務就接不到了 */
  levelsLeft?: number;
};

/** 再過幾級就超過等級上限，就算「快過期」。 */
const EXPIRING_WINDOW = 8;
/** 等級門檻在最近幾級內解鎖的，算「剛解鎖」。 */
const FRESH_WINDOW = 10;

/**
 * 篩出「這個等級、這個職業，現在真的接得到」的任務。
 *
 * 排序刻意不是照等級由低到高——那會把一堆沒有等級門檻的雜項推到最前面。
 * 玩家真正在意的順序是：快過期的先做（過了就沒了），再來是剛解鎖的（通常是主線），
 * 剩下的才是隨時能補的。
 */
export function planQuests(profile: Profile, quests: Quest[]): QuestPlan[] {
  const lineage = new Set(jobLineage(profile.job));
  const byId = new Map(quests.map(quest => [quest.id, quest]));

  const eligible = quests.filter(quest => {
    if (quest.minLv !== undefined && profile.level < quest.minLv) return false;
    if (quest.maxLv !== undefined && profile.level > quest.maxLv) return false;
    if (quest.jobs?.length && !quest.jobs.some(job => lineage.has(job))) return false;
    return true;
  });

  const rank: Record<QuestBucket, number> = { expiring: 0, fresh: 1, backlog: 2 };

  return eligible
    .map(quest => {
      const levelsLeft = quest.maxLv !== undefined ? quest.maxLv - profile.level : undefined;
      const justUnlocked = quest.minLv !== undefined && profile.level - quest.minLv <= FRESH_WINDOW;
      const bucket: QuestBucket =
        levelsLeft !== undefined && levelsLeft <= EXPIRING_WINDOW ? "expiring"
          : justUnlocked ? "fresh"
            : "backlog";

      return {
        quest,
        blockedBy: (quest.pre || []).filter(id => {
          const previous = byId.get(id);
          // 前置任務本身如果我們資料裡沒有，就不擋，但也不假裝它已完成
          return previous ? !isLikelyDone(previous, profile) : false;
        }),
        chain: quest.parent || quest.cat || "其他",
        bucket,
        levelsLeft,
      };
    })
    .sort((a, b) =>
      rank[a.bucket] - rank[b.bucket]
      || (a.levelsLeft ?? 99) - (b.levelsLeft ?? 99)
      || a.blockedBy.length - b.blockedBy.length
      || (b.quest.minLv ?? 0) - (a.quest.minLv ?? 0)
      || (b.quest.exp ?? 0) - (a.quest.exp ?? 0));
}

export const QUEST_BUCKET_LABEL: Record<QuestBucket, { title: string; hint: string }> = {
  expiring: { title: "快過期，先做這些", hint: "再升幾級就接不到了" },
  fresh: { title: "剛解鎖", hint: "這個等級新開的任務" },
  backlog: { title: "隨時可以補", hint: "沒有等級上限，之後再做也行" },
};

/** 等級已經遠遠超過的前置任務，視為早就做過了。 */
function isLikelyDone(quest: Quest, profile: Profile): boolean {
  if (quest.minLv === undefined) return true;
  return profile.level >= quest.minLv;
}

/* ------------------------------------------------------------------ 練功 */

export type TrainPick = {
  row: TrainingRow;
  /** 這張圖的主力怪 */
  lead: Monster | undefined;
  /** 0～1，等級適配度 */
  fit: number;
  /** 排序分數 = 密度 × 適配度 */
  score: number;
  /** 打到不會 miss 需要的命中，取這張圖最難命中的怪 */
  needAcc: number;
  /** 這張圖最高等的怪比你高幾級（負數代表比你低） */
  topGap: number;
  /** 打不打得動的提示 */
  warn?: "too-strong" | "too-weak";
};

/**
 * 命中需求，用經典版社群通用的命中公式反推：
 *   命中率 = 命中 ÷ ((1.84 + 0.07 × 等級差) × 怪物迴避 + 1)
 * 等級差只算「怪比你高」的部分。這不是官方公開數字，UI 會標明出處。
 */
export function requiredAccuracy(playerLevel: number, monster: Pick<Monster, "lv" | "eva">): number {
  const gap = Math.max(0, (monster.lv ?? 0) - playerLevel);
  return Math.ceil((1.84 + 0.07 * gap) * (monster.eva ?? 0) + 1);
}

/**
 * 等級適配度。
 * 怪比你低太多沒經驗、比你高太多打不動，中間那段才是練功帶。
 */
export function levelFit(playerLevel: number, mapLevel: number): number {
  const diff = mapLevel - playerLevel;
  if (diff >= -3 && diff <= 10) return 1;
  if (diff > 10) return Math.max(0, 1 - (diff - 10) / 12);
  return Math.max(0.05, 1 - (Math.abs(diff) - 3) / 18);
}

/**
 * 只看平均等級會害死人。
 *
 * 實際踩到的例子：Lv.52 的角色被推薦「試煉之洞Ⅲ」，因為那張圖同時有 Lv43 小獵犬
 * 跟 Lv51 火精靈把平均拉到 52 上下——但圖裡還站著 Lv90 的煉獄獵犬。
 * 所以另外用「最高等怪跟你差多少」再壓一次分數，超過 8 級就開始扣。
 */
export function dangerPenalty(playerLevel: number, topMobLevel: number): number {
  const gap = topMobLevel - playerLevel;
  if (gap <= 8) return 1;
  return Math.max(0.08, 1 - (gap - 8) / 25);
}

export function planTraining(
  profile: Profile,
  training: TrainingRow[],
  monsters: Map<number, Monster>,
  limit = 30,
): TrainPick[] {
  const picks: TrainPick[] = [];
  for (const row of training) {
    const fit = levelFit(profile.level, row.lv);
    if (fit <= 0.05) continue;
    const danger = dangerPenalty(profile.level, row.lvMax);
    if (danger <= 0.1) continue;

    let needAcc = 0;
    for (const [mobId] of row.mobs) {
      const monster = monsters.get(mobId);
      if (monster) needAcc = Math.max(needAcc, requiredAccuracy(profile.level, monster));
    }

    const lead = monsters.get(row.mobs[0]?.[0]);
    const topGap = row.lvMax - profile.level;
    picks.push({
      row,
      lead,
      fit,
      needAcc,
      score: row.eff * fit * danger,
      topGap,
      warn: topGap > 8 ? "too-strong" : row.lv - profile.level < -10 ? "too-weak" : undefined,
    });
  }
  picks.sort((a, b) => b.score - a.score);
  return picks.slice(0, limit);
}

/**
 * 把排序分數換算成同一批推薦裡的相對指數（最高 100）。
 * 直接顯示原始密度沒有意義，玩家要的是「哪張比較好」。
 */
export function relativeIndex(picks: TrainPick[]): Map<number, number> {
  const top = picks[0]?.score ?? 0;
  const index = new Map<number, number>();
  for (const pick of picks) {
    index.set(pick.row.m, top > 0 ? Math.round((pick.score / top) * 100) : 0);
  }
  return index;
}

/* ------------------------------------------------------------------ 打寶 */

export type FarmPick = {
  map: number;
  /** 這張圖能收到的目標道具 */
  items: number[];
  /** 會掉目標的怪物 */
  monsters: number[];
  /** 這些怪在這張圖的刷怪點總數 */
  spawn: number;
  /** 主要用來排序：一趟能收幾樣 + 刷怪密度 */
  score: number;
};

/**
 * 「一趟收最多」。
 * 官方沒有公開掉落率，所以這裡不算機率，只回答一個可查證的問題：
 * 哪一張圖同時掛著最多你要的東西、而且怪最密。
 */
export function planFarming(
  targets: number[],
  farming: Record<string, FarmingRow[]>,
  limit = 25,
): FarmPick[] {
  const perMap = new Map<number, { items: Set<number>; monsters: Set<number>; spawn: number }>();

  for (const itemId of targets) {
    for (const [mapId, spawn, monsterIds] of farming[String(itemId)] || []) {
      let bucket = perMap.get(mapId);
      if (!bucket) {
        bucket = { items: new Set(), monsters: new Set(), spawn: 0 };
        perMap.set(mapId, bucket);
      }
      bucket.items.add(itemId);
      for (const monsterId of monsterIds) bucket.monsters.add(monsterId);
      bucket.spawn = Math.max(bucket.spawn, spawn);
    }
  }

  return [...perMap.entries()]
    .map(([map, bucket]) => ({
      map,
      items: [...bucket.items],
      monsters: [...bucket.monsters],
      spawn: bucket.spawn,
      // 收得到的目標數是主要條件，刷怪密度是次要條件
      score: bucket.items.size * 1000 + bucket.spawn,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* -------------------------------------------------------------- 共用工具 */

export function searchItems(items: Item[], keyword: string, limit = 40): Item[] {
  const query = keyword.trim().toLowerCase();
  if (!query) return [];
  const exact: Item[] = [];
  const partial: Item[] = [];
  for (const item of items) {
    if (item.un) continue;
    if (!item.dm?.length) continue; // 打寶只列打得到的東西
    const name = item.n.toLowerCase();
    if (name === query) exact.push(item);
    else if (name.includes(query) || String(item.id) === query) partial.push(item);
    if (exact.length + partial.length >= limit * 2) break;
  }
  return [...exact, ...partial].slice(0, limit);
}

export function mapDisplayLevel(record: MapRecord | undefined, fallback: string) {
  return record?.zh || record?.en || fallback;
}
