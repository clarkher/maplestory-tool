import type { FarmingRow, Item, MapRecord, Monster, Profile, Quest, TrainingRow } from "./types";

/* ------------------------------------------------------------------ 職業 */

/**
 * 一個職業的所有前身。三轉遊俠做得了獵人時期的任務，反過來不行，
 * 所以任務的職業條件要拿「自己 + 前身」去比對。
 * 代碼規則：312 → 310 → 300；皇家騎士團 1112 → 1110 → 1100 → 1000。
 *
 * 注意這裡**不會**把 0 加進去。
 * 資料裡 `jobs: [0]` 的 58 個任務是「初心者專屬」（弓箭手之路、戰士之路、
 * 整批楓之島任務），不是「不限職業」——不限職業的任務根本沒有 jobs 欄位。
 * 之前無條件補一個 0，結果 Lv.52 的盜賊也看得到楓之島的新手任務。
 */
export function jobLineage(job: number): number[] {
  if (job <= 0) return [0];
  const chain: number[] = [];
  let current = job;
  while (current > 0) {
    chain.push(current);
    if (current % 10 !== 0) current -= current % 10;
    else if (current % 100 !== 0) current -= current % 100;
    else if (current % 1000 !== 0) current -= current % 1000;
    else current = 0;
  }
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
    // 楓之島離島之後就回不去了，已轉職的角色不用再看那邊的任務
    if (quest.island && profile.job !== 0) return false;
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
 *
 * 原本上緣開到 +10 太寬鬆，結果 Lv.27 會被推去打 Lv.35 的小幽靈，
 * 命中需求 47、還得打得動——那不是練功，那是送死。
 * 經典版實際的練功帶是「跟你同級到高你 5 級」，高過去命中與傷害掉得很快。
 */
export function levelFit(playerLevel: number, mapLevel: number): number {
  const diff = mapLevel - playerLevel;
  if (diff >= 0 && diff <= 5) return 1;            // 甜蜜區：同級到高 5 級
  if (diff > 5 && diff <= 10) return 1 - (diff - 5) / 8;  // 高 10 級只剩 0.38
  if (diff > 10) return Math.max(0, 0.38 - (diff - 10) / 10);
  if (diff >= -5) return 0.9;                      // 略低於你，經驗差一點但打得順
  return Math.max(0.05, 0.9 - (Math.abs(diff) - 5) / 15);
}

/**
 * 只看平均等級會害死人。
 *
 * 實際踩到的例子：Lv.52 的角色被推薦「試煉之洞Ⅲ」，因為那張圖同時有 Lv43 小獵犬
 * 跟 Lv51 火精靈把平均拉到 52 上下——但圖裡還站著 Lv90 的煉獄獵犬。
 * 所以另外用「最高等怪跟你差多少」再壓一次分數。
 * 門檻從 8 級收到 5 級、衰減也加快，否則同樣會推出打不動的圖。
 */
export function dangerPenalty(playerLevel: number, topMobLevel: number): number {
  const gap = topMobLevel - playerLevel;
  if (gap <= 5) return 1;
  return Math.max(0.05, 1 - (gap - 5) / 8);
}

/**
 * 命中需求要看「你實際會打的那些怪」。
 *
 * 地圖裡常常插著一隻 ×1 的強怪（例如地鐵的冥界幽靈），拿它算命中會跳出 2119
 * 這種嚇死人又沒意義的數字。所以只看撐起這張圖的主力怪——刷怪點佔比夠的那些。
 */
function mainMobs(row: TrainingRow): Array<[number, number, number]> {
  const threshold = Math.max(2, row.sp * 0.08);
  const main = row.mobs.filter(([, count]) => count >= threshold);
  return main.length ? main : row.mobs;
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
    // 最高等怪高你 15 級以上就別列了，列出來也只是害人白跑一趟
    if (danger <= 0.2) continue;

    let needAcc = 0;
    for (const [mobId] of mainMobs(row)) {
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
      warn: topGap > 5 ? "too-strong" : row.lv - profile.level < -8 ? "too-weak" : undefined,
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

/* -------------------------------------------------------- 打寶：主動推薦 */

export type FarmSuggestion = {
  item: Item;
  /** 為什麼推薦這個 */
  reason: string;
  /** 排序權重，同一組內用 */
  weight: number;
};

export type FarmSuggestionGroup = {
  key: "quest" | "gear" | "money";
  title: string;
  lead: string;
  items: FarmSuggestion[];
};

/**
 * 玩家不會知道自己該搜什麼。
 * 與其給一個空搜尋框，不如直接回答「你這等級現在該刷什麼」，分三種動機：
 *
 *   任務要交的  最硬的需求，直接從你現在接得到的任務推出來
 *   換裝備      這等級穿得上、職業用得到、而且打得到的
 *   順路撿的錢  NPC 收購價高的掉落物
 *
 * 三組都只列「真的有怪會掉」的東西（farming 索引查得到），不列商店貨。
 */
export function suggestFarming(
  profile: Profile,
  items: Item[],
  quests: Quest[],
  farming: Record<string, FarmingRow[]>,
  monsters: Monster[],
): FarmSuggestionGroup[] {
  const byId = new Map(items.map(item => [item.id, item]));
  const farmable = (id: number) => Boolean(farming[String(id)]?.length);

  // 1) 你現在接得到的任務要交什麼
  const questNeed = new Map<number, { count: number; names: string[] }>();
  for (const plan of planQuests(profile, quests)) {
    if (plan.blockedBy.length) continue;
    for (const need of plan.quest.needItems || []) {
      if (!farmable(need.id)) continue;
      const bucket = questNeed.get(need.id) || { count: 0, names: [] };
      bucket.count += 1;
      if (bucket.names.length < 3) bucket.names.push(plan.quest.n);
      questNeed.set(need.id, bucket);
    }
  }
  const questItems: FarmSuggestion[] = [...questNeed.entries()]
    .map(([id, bucket]) => {
      const item = byId.get(id);
      if (!item) return null;
      return {
        item,
        reason: bucket.count > 1
          ? `${bucket.count} 個任務要：${bucket.names.join("、")}…`
          : `${bucket.names[0]} 要交`,
        weight: bucket.count,
      };
    })
    .filter((row): row is FarmSuggestion => row !== null)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 12);

  // 2) 這等級掉得到的裝備。
  // 不依職業過濾——別的職業的裝備一樣打得到、一樣賣得掉，濾掉反而少了收入來源。
  // 武器種類直接寫在說明裡，自己一眼判斷穿不穿得上。
  const gearItems: FarmSuggestion[] = items
    .filter(item => {
      if (item.un || !item.eq || !farmable(item.id)) return false;
      const reqLevel = Number(item.eq.reqLevel ?? 0);
      return reqLevel <= profile.level && reqLevel >= profile.level - 20;
    })
    .map(item => ({
      item,
      reason: `Lv.${item.eq?.reqLevel ?? 0} ${item.s ?? item.c}${gearHighlight(item)}`,
      // 需求等級越接近你的等級越值得換
      weight: Number(item.eq?.reqLevel ?? 0) * 10 + gearScore(item),
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 16);

  // 3) 市場上有人要的。
  // 本站沒有玩家之間的行情資料，所以不假裝算得出市價，改用三個查得到的訊號：
  // 類型（卷軸與技能書永遠有人收）、稀有度（會掉的怪越少越難拿）、
  // 以及「掉它的怪你現在打不打得動」——打不到的東西列出來沒意義。
  const killable = new Set(
    monsters.filter(monster => (monster.lv ?? 0) <= profile.level + 5).map(monster => monster.id),
  );
  const canFarmNow = (item: Item) => (item.dm || []).some(id => killable.has(id));

  const rarityOf = (item: Item) => {
    const droppers = item.dm?.length ?? 99;
    return droppers <= 1 ? 3 : droppers <= 3 ? 2 : 1;
  };

  // 卷軸與技能書：不管幾等都有人收，是最穩的收入
  const scrolls: FarmSuggestion[] = items
    .filter(item => !item.un && farmable(item.id) && canFarmNow(item)
      && (item.s === "卷軸" || item.s === "技能書"))
    .map(item => ({
      item,
      reason: `${item.s} · ${item.dm?.length ?? 0} 隻怪會掉`,
      weight: rarityOf(item) * 100 + (item.price ?? 0) / 1000,
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8);

  // 稀有武器：會掉的怪很少又有攻擊力，海神叉那類才是有人搶的。
  // 需求等級要落在你附近的等級帶，否則只會排出一堆 Lv.10 的木劍——
  // 攻擊除以等級的比值最高，但沒人要買。
  const rareGear: FarmSuggestion[] = items
    .filter(item => {
      if (item.un || !item.eq || !farmable(item.id) || !canFarmNow(item)) return false;
      const attack = Number(item.eq.incPAD ?? 0) + Number(item.eq.incMAD ?? 0);
      if (attack <= 0 || (item.dm?.length ?? 99) > 5) return false;
      const reqLevel = Number(item.eq.reqLevel ?? 0);
      return reqLevel >= profile.level - 20 && reqLevel <= profile.level + 20;
    })
    .map(item => {
      const attack = Number(item.eq?.incPAD ?? 0) + Number(item.eq?.incMAD ?? 0);
      return {
        item,
        reason: `Lv.${item.eq?.reqLevel ?? 0} ${item.s ?? ""} · 攻擊 +${attack} · 只有 ${item.dm?.length ?? 0} 隻怪會掉`,
        weight: attack + rarityOf(item) * 10,
      };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8);

  // 兩類各留一半，不要讓其中一邊把版面吃光
  const marketItems = [...scrolls, ...rareGear];

  const groups: FarmSuggestionGroup[] = [];
  if (questItems.length) {
    groups.push({
      key: "quest",
      title: "任務要交的",
      lead: "從你現在接得到的任務推出來的，先刷這些最不會白費",
      items: questItems,
    });
  }
  if (gearItems.length) {
    groups.push({
      key: "gear",
      title: "這等級該換的裝備",
      lead: "這等級掉得到的，不分職業——穿不上的也賣得掉",
      items: gearItems,
    });
  }
  if (marketItems.length) {
    groups.push({
      key: "money",
      title: "市場上有人要的",
      lead: "卷軸、技能書與稀有武器，而且是你現在打得到的",
      items: marketItems,
    });
  }
  return groups;
}

/** 裝備的主要賣點，寫在推薦理由裡讓玩家一眼看出值不值得換。 */
function gearHighlight(item: Item): string {
  const stats = item.eq;
  if (!stats) return "";
  const parts: string[] = [];
  const pad = Number(stats.incPAD ?? 0);
  const mad = Number(stats.incMAD ?? 0);
  const pdd = Number(stats.incPDD ?? 0);
  if (pad) parts.push(`物攻 +${pad}`);
  if (mad) parts.push(`魔攻 +${mad}`);
  if (!pad && !mad && pdd) parts.push(`物防 +${pdd}`);
  return parts.length ? ` · ${parts.join(" ")}` : "";
}

function gearScore(item: Item): number {
  const stats = item.eq;
  if (!stats) return 0;
  return Number(stats.incPAD ?? 0) * 3 + Number(stats.incMAD ?? 0) * 3 + Number(stats.incPDD ?? 0);
}

/* -------------------------------------------------------- 任務打包（同場打） */

export type BundleTarget = {
  kind: "item" | "mob";
  id: number;
  name: string;
  /**
   * 實際要收/要打的總量。
   * 道具是相加（交出去就被收走，下一個任務要重新收）；
   * 討伐是取最大值（擊殺數各任務同時累加，打最多的那個就全部達成）。
   */
  total: number;
  /** 哪些任務要、各要幾個 */
  from: Array<{ questId: string; questName: string; count: number }>;
};

export type QuestBundle = {
  map: number;
  /** 在這張圖能同時推進的任務 */
  quests: Array<{ id: string; name: string; exp?: number; money?: number; pop?: number }>;
  targets: BundleTarget[];
  /** 這些目標在這張圖的刷怪點總數 */
  spawn: number;
  /**
   * 這一趟全部完成能拿到的總獎勵——玩家真正在比較的數字。
   * items 只算一定拿得到的；隨機給或綁職業的另外算進 maybeItems，不能混為一談。
   */
  reward: { exp: number; money: number; pop: number; items: number; maybeItems: number };
};

/**
 * 任務打包：同一張圖能一次推進哪幾個任務。
 *
 * 例如 A 任務要藍菇菇 50 個、B 任務要 40 個，就該一趟打 90 個，
 * 而不是分兩次跑。這裡按「你實際要去的地圖」聚合，把各任務的需求量加總，
 * 讓你出門前就知道這趟要收滿多少。
 */
export function planQuestBundles(
  profile: Profile,
  quests: Quest[],
  farming: Record<string, FarmingRow[]>,
  monsters: Map<number, Monster>,
  limit = 20,
): QuestBundle[] {
  type Need = { kind: "item" | "mob"; id: number; name: string; count: number; quest: Quest };

  const needs: Need[] = [];
  for (const plan of planQuests(profile, quests)) {
    if (plan.blockedBy.length) continue;
    for (const item of plan.quest.needItems || []) {
      needs.push({ kind: "item", id: item.id, name: item.n, count: item.c ?? 1, quest: plan.quest });
    }
    for (const mob of plan.quest.needMobs || []) {
      needs.push({ kind: "mob", id: mob.id, name: mob.n, count: mob.c ?? 1, quest: plan.quest });
    }
  }
  if (!needs.length) return [];

  // 每個需求對應到哪些地圖
  const perMap = new Map<number, {
    spawn: number;
    quests: Map<string, Quest>;
    targets: Map<string, BundleTarget>;
  }>();

  const touch = (mapId: number, spawn: number, need: Need) => {
    let bucket = perMap.get(mapId);
    if (!bucket) {
      bucket = { spawn: 0, quests: new Map(), targets: new Map() };
      perMap.set(mapId, bucket);
    }
    bucket.spawn += spawn;
    bucket.quests.set(need.quest.id, need.quest);

    const key = `${need.kind}:${need.id}`;
    let target = bucket.targets.get(key);
    if (!target) {
      target = { kind: need.kind, id: need.id, name: need.name, total: 0, from: [] };
      bucket.targets.set(key, target);
    }
    // 同一個任務同一個目標只算一次，不要因為對應到多隻怪就重複加總
    if (!target.from.some(entry => entry.questId === need.quest.id)) {
      target.from.push({ questId: need.quest.id, questName: need.quest.n, count: need.count });
      // 討伐數是各任務同時累加的：A 要 99、B 要 999，打滿 999 兩個一起完成，不是 1098。
      // 收集品則相反，交出去就被收走，所以要相加。
      target.total = need.kind === "mob"
        ? Math.max(target.total, need.count)
        : target.total + need.count;
    }
  };

  for (const need of needs) {
    if (need.kind === "item") {
      for (const [mapId, spawn] of farming[String(need.id)] || []) touch(mapId, spawn, need);
    } else {
      const monster = monsters.get(need.id);
      for (const [mapId, count] of monster?.sp || []) touch(mapId, count, need);
    }
  }

  return [...perMap.entries()]
    .map(([map, bucket]) => {
      const list = [...bucket.quests.values()];
      const reward = { exp: 0, money: 0, pop: 0, items: 0, maybeItems: 0 };
      for (const quest of list) {
        reward.exp += quest.exp ?? 0;
        reward.money += quest.money ?? 0;
        reward.pop += quest.pop ?? 0;
        for (const item of quest.rewardItems || []) {
          if (item.rand || item.job) reward.maybeItems += 1;
          else reward.items += 1;
        }
      }
      return {
        map,
        quests: list.map(quest => ({
          id: quest.id,
          name: quest.n,
          exp: quest.exp,
          money: quest.money,
          pop: quest.pop,
        })),
        targets: [...bucket.targets.values()].sort((a, b) => b.total - a.total),
        spawn: bucket.spawn,
        reward,
      };
    })
    // 玩家在比的是「這趟划不划算」，所以先看總經驗，再看能一次推進幾個任務
    .sort((a, b) =>
      b.reward.exp - a.reward.exp
      || b.quests.length - a.quests.length
      || b.spawn - a.spawn)
    .filter(bundle => bundle.quests.length > 0)
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
