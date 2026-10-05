/**
 * 首頁「現在做這些」的排法：主推去哪、先解哪些任務、哪些是長線。
 * 規則：docs/superpowers/specs/2026-10-05-now-plan-design.md。全部是純函式，測試在 __tests__/now-plan.test.ts。
 */
import { jobFit, type JobFit } from "./job-rules";
import { JOB_LINES, advancementLevel, baseJob, stageJob } from "./jobs";
import { jobLineage, planTraining, questEligible } from "./planner";
import { findRoute, suggestStart } from "./route";
import {
  VERIFIED_RANK, groupQuests, isIslandMap, levelFraction, longRunQuests, mustDoIndex, onIsland, questReachable, shortName, spawnIndex,
  trainingForBand, withoutLongRun,
} from "./route-planner";
import type {
  GuideCommon, GuideJob, GuideMustDo, GuidePq, GuideTrain, MapRecord, Monster, PortalEdge, Quest, QuestNpc, QuestReward, TrainingRow,
} from "./types";

/** 同一道具累計、或單一任務同一隻怪要打到這個數量以上，就算長線（告示牌 999 隻、詛咒娃娃 2,300 個） */
export const LONG_RUN_MIN = 200;

/* ------------------------------------------------------------------ 實際等級 */

/**
 * 任務實際上幾等才做得動。遊戲資料有 67 個給經驗的任務沒有等級門檻（例如鱷魚王 18 萬經驗），
 * 只看門檻會推給 Lv.7 的初心者。取下列最高者：門檻；攻略建議等級（有寫就信攻略）；
 * 沒攻略時「要打的怪」與「要交道具的最低等掉落怪」的等級 −5；前置任務的實際等級。
 */
export function effectiveLevels(quests: Quest[], monsters: Monster[], common: GuideCommon): Map<string, number> {
  const recs = mustDoIndex(common);
  const index = new Map(monsters.map(monster => [monster.id, monster]));
  const droppers = new Map<number, number[]>();
  for (const monster of monsters) {
    for (const item of monster.drops) {
      const list = droppers.get(item);
      if (list) list.push(monster.id);
      else droppers.set(item, [monster.id]);
    }
  }
  const byId = new Map(quests.map(quest => [quest.id, quest]));
  const memo = new Map<string, number>();

  function levelOf(quest: Quest, visiting: Set<string>): number {
    const known = memo.get(quest.id);
    if (known !== undefined) return known;
    if (visiting.has(quest.id)) return 0;
    visiting.add(quest.id);
    const recLevel = recs.get(quest.id)?.lv.match(/\d+/);
    const mobLevel = Math.max(0, ...(quest.needMobs ?? []).map(mob => index.get(mob.id)?.lv ?? 0));
    const itemLevel = Math.max(0, ...(quest.needItems ?? []).map(item => {
      const levels = (droppers.get(item.id) ?? []).map(id => index.get(id)?.lv ?? 0).filter(level => level > 0);
      return levels.length ? Math.min(...levels) : 0;
    }));
    const fromMobs = Math.max(mobLevel, itemLevel);
    const pres = (quest.pre ?? []).map(id => byId.get(id)).filter((pre): pre is Quest => Boolean(pre));
    const fromPre = Math.max(0, ...pres.map(pre => levelOf(pre, visiting)));
    const value = Math.max(quest.minLv ?? 0, recLevel ? Number(recLevel[0]) : fromMobs > 0 ? fromMobs - 5 : 0, fromPre);
    memo.set(quest.id, value);
    return value;
  }

  for (const quest of quests) levelOf(quest, new Set());
  return memo;
}

/* ------------------------------------------------------------------ 先解 */

export type NowQuest = {
  key: string;
  title: string;
  /** 現在做得到的那幾段 */
  quests: Quest[];
  /** 整條任務線幾段；現在做得到的是第幾到第幾段（1 起算） */
  totalParts: number;
  firstPart: number;
  lastPart: number;
  exp: number;
  /** 用現在等級換算的「約幾級」 */
  fraction: number;
  /** 關鍵獎勵標籤（研究檔 reward.label） */
  reward?: string;
  /** 放圖用的獎勵道具 id；對不到這個職業拿得到的就不放 */
  rewardItem?: number;
  rec?: GuideMustDo;
  npc?: QuestNpc;
};

const JOB_FLAG: Record<number, number> = { 0: 1, 100: 2, 200: 4, 300: 8, 400: 16, 500: 32 };

/** 任務獎勵的 job 欄位是職業旗標（劍士 2、法師 4、弓箭手 8、盜賊 16、海盜 32），不是職業代碼 */
export function rewardFitsJob(reward: Pick<QuestReward, "job">, job: number): boolean {
  if (reward.job === undefined) return true;
  return (reward.job & (JOB_FLAG[baseJob(job)] ?? 1)) !== 0;
}

function rewardItemFor(rec: GuideMustDo | undefined, quests: Quest[], job: number): number | undefined {
  const wanted = rec?.reward?.items ?? [];
  if (!wanted.length) return undefined;
  const given = quests.flatMap(quest => quest.rewardItems ?? []).filter(item => wanted.includes(item.id));
  return given.find(item => rewardFitsJob(item, job))?.id ?? (wanted.length === 1 ? wanted[0] : undefined);
}

/**
 * 攻略建議等級的上限，過了上限 +5 就不推（Lv35 手套推給 Lv.82 沒意義）。
 * 「15–25」取 25；寫「30+」「10 起」的沒有上限；其他取最大的數字 +15。
 */
export function recUpperLevel(rec: GuideMustDo | undefined): number | undefined {
  if (!rec) return undefined;
  const text = rec.lv.replace(/（[^）]*）/g, "");
  const range = text.match(/^\s*(\d+)\s*[–~～-]\s*(\d+)/);
  if (range) return Number(range[2]);
  if (/[+＋]|起/.test(text)) return undefined;
  const numbers = text.match(/\d+/g)?.map(Number) ?? [];
  return numbers.length ? Math.max(...numbers) + 15 : undefined;
}

function isLongKill(quest: Quest, min = LONG_RUN_MIN): boolean {
  return (quest.needMobs ?? []).some(mob => (mob.c ?? 0) >= min);
}

export function nowQuests(args: {
  level: number;
  job: number;
  quests: Quest[];
  monsters: Monster[];
  common: GuideCommon;
  maps: Record<string, Pick<MapRecord, "zh">>;
  effective: Map<string, number>;
  limit?: number;
}): NowQuest[] {
  // 不設上限：關鍵獎勵任務可能超過 5 個，一個都不能藏；畫面先顯示 5 條、其餘展開（TodoList）
  const { level, job, quests, monsters, common, maps, effective, limit } = args;
  const stage = stageJob(job, level);
  const lineage = new Set(jobLineage(stage));
  const recs = mustDoIndex(common);
  const toNext = common.expTable.toNext;
  const levelOf = (quest: Quest) => effective.get(quest.id) ?? quest.minLv ?? 0;

  // 這個職業做得到的全部任務（不看等級）：拿來算「第幾段／共幾段」
  const forJob = quests.filter(quest =>
    (!quest.jobs?.length || quest.jobs.some(code => lineage.has(code)))
    && quest.cat !== "組隊任務"
    && questReachable(quest, maps));
  // 一筆攻略推薦（mustDo）就是一條任務線，即使它涵蓋的幾段前置串不起來（例：伊卡路斯任務鏈）；沒有推薦的照前置任務分
  const lineOf = new Map<string, string>();
  for (const group of groupQuests(forJob)) {
    for (const quest of group.quests) {
      const rec = recs.get(quest.id);
      lineOf.set(quest.id, rec ? `rec:${rec.q}` : group.key);
    }
  }
  const lines = new Map<string, Quest[]>();
  for (const quest of forJob) {
    const key = lineOf.get(quest.id) as string;
    lines.set(key, [...(lines.get(key) ?? []), quest]);
  }
  for (const members of lines.values()) members.sort((a, b) => levelOf(a) - levelOf(b) || a.id.localeCompare(b.id));

  const doable = withoutLongRun(
    forJob.filter(quest => questEligible(quest, { level, job: stage }, lineage) && levelOf(quest) <= level && !isLongKill(quest)),
    monsters,
  ).filter(quest => (quest.exp ?? 0) > 0 || recs.has(quest.id));

  const byLine = new Map<string, Quest[]>();
  for (const quest of doable) {
    const key = lineOf.get(quest.id) ?? `chain:${quest.id}`;
    byLine.set(key, [...(byLine.get(key) ?? []), quest]);
  }

  const scored: Array<{ item: NowQuest; score: number }> = [];
  for (const [key, members] of byLine) {
    const line = lines.get(key) ?? members;
    const parts = line.filter(quest => members.includes(quest));
    const rec = parts.map(quest => recs.get(quest.id)).find((value): value is GuideMustDo => Boolean(value));
    const upper = recUpperLevel(rec);
    if (upper !== undefined && level > upper + 5) continue;
    const exp = parts.reduce((sum, quest) => sum + (quest.exp ?? 0), 0);
    const fraction = levelFraction(exp, level, toNext);
    const reward = rec?.reward?.label;
    if (!reward && fraction < 0.25 && !(rec && fraction >= 0.08)) continue;
    const positions = parts.map(quest => line.indexOf(quest) + 1);
    const title = rec
      ? rec.name.replace(/（[^（）]*）\s*$/, "")
      : key.startsWith("line:") ? key.slice(5) : [...parts].sort((a, b) => (b.exp ?? 0) - (a.exp ?? 0))[0].n;
    scored.push({
      item: {
        key,
        title,
        quests: parts,
        totalParts: line.length,
        firstPart: Math.min(...positions),
        lastPart: Math.max(...positions),
        exp,
        fraction,
        reward,
        rewardItem: rewardItemFor(rec, parts, job),
        rec,
        npc: parts[0].sNpc,
      },
      score: fraction + (rec ? 0.2 : 0),
    });
  }
  // 有關鍵獎勵的一律排在沒有的前面；同一組裡比約幾級（玩家推薦加 0.2）
  const sorted = scored.sort((a, b) => Number(Boolean(b.item.reward)) - Number(Boolean(a.item.reward)) || b.score - a.score);
  return (limit === undefined ? sorted : sorted.slice(0, limit)).map(entry => entry.item);
}

/* ------------------------------------------------------------------ 長線 */

export type LongRunTask = { kind: "item" | "kill"; id: number; n: string; c: number; quests: string[]; exp: number; droppers: number[] };

/** 長線：同一道具累計 200 個以上（例：詛咒娃娃）；單一任務同一隻怪要打 200 隻以上（例：告示牌 999 隻） */
export function longRunTasks(quests: Quest[], monsters: Monster[], min = LONG_RUN_MIN): LongRunTask[] {
  const items = longRunQuests(quests, monsters, min).map((entry): LongRunTask => ({
    kind: "item", id: entry.id, n: entry.n, c: entry.c, quests: entry.quests, exp: entry.exp, droppers: entry.droppers,
  }));
  const kills = new Map<number, LongRunTask>();
  for (const quest of quests) {
    for (const mob of quest.needMobs ?? []) {
      if ((mob.c ?? 0) < min) continue;
      const entry: LongRunTask = kills.get(mob.id) ?? { kind: "kill", id: mob.id, n: mob.n, c: 0, quests: [], exp: 0, droppers: [mob.id] };
      entry.c += mob.c ?? 0;
      if (!entry.quests.includes(quest.id)) {
        entry.quests.push(quest.id);
        entry.exp += quest.exp ?? 0;
      }
      kills.set(mob.id, entry);
    }
  }
  return [...items, ...kills.values()].sort((a, b) => b.c - a.c);
}

/* ------------------------------------------------------------------ 主推大卡 */

/** 刷怪點這麼少的是王圖（巴洛古整張圖 1 隻），不進練功推薦 */
const BOSS_SPAWN_MAX = 3;
/** 從最近城鎮要走這麼多張圖以上，排序打七折 */
const FAR_HOPS = 8;

export type TrainOption = {
  map: number;
  title: string;
  party: boolean;
  source: "guide" | "data";
  guide?: GuideTrain;
  row?: TrainingRow;
  /** [怪物 id, 刷怪點數]，多的在前 */
  mobs: Array<[number, number]>;
  fit: JobFit;
  /** 從最近城鎮走幾張圖 */
  hops?: number;
  town?: number;
};

export type Instructor = { job: number; line: string; npcId: number; npcName: string; map: number; level: number };

export type MainPick =
  | { kind: "advance"; instructors: Instructor[] }
  | { kind: "pq"; pq: GuidePq; window: [number, number]; alt?: TrainOption }
  | { kind: "map"; option: TrainOption; alt?: TrainOption; ceiling?: number };

/**
 * 轉職教官站的地圖（遊戲資料裡教官任務的起訖地圖）。
 * 海盜教官卡伊琳站在隱藏的訓練場，帶去她回城的鯨魚號航海室。
 */
export const INSTRUCTOR_MAPS: Record<number, number> = {
  100: 102000003, // 勇士聖殿
  200: 101000003, // 魔法森林圖書館
  300: 100000201, // 弓箭手培訓中心
  400: 103000003, // 墮落城市酒吧
  500: 120000101, // 鯨魚號航海室
};

export function instructors(): Instructor[] {
  return JOB_LINES.map(line => ({
    job: line.base,
    line: line.line,
    npcId: line.npcId,
    npcName: line.npcName,
    map: INSTRUCTOR_MAPS[line.base],
    level: advancementLevel(line.base),
  }));
}

/** 等級在這個職業的組隊任務範圍內就主推組隊；同時落在兩個範圍，選起始等級高的（比較貼近現在） */
export function pqFor(common: GuideCommon, job: number, level: number): { pq: GuidePq; window: [number, number] } | undefined {
  const keys = [...new Set([stageJob(job, level), baseJob(job)])].filter(code => code > 0).map(String);
  const hits = (common.pq ?? []).flatMap(pq => {
    const window = keys.map(key => pq.byJob[key]).find((value): value is [number, number] => Boolean(value));
    return window && level >= window[0] && level <= window[1] ? [{ pq, window }] : [];
  });
  return hits.sort((a, b) => b.window[0] - a.window[0])[0];
}

function routeFrom(
  map: number,
  graph: Record<string, PortalEdge[]>,
  maps: Record<string, MapRecord>,
  nearestTown: Record<string, [number, number]>,
): { town?: number; hops?: number } {
  const town = suggestStart(graph, maps, nearestTown, map);
  if (!town) return {};
  const route = findRoute(graph, town, map);
  return route.ok ? { town, hops: route.hops } : {};
}

/** 攻略段落的排序：跨 15 級以上的排後面 → 單人優先 → 台服實測優先 → 越窄越前面 */
function byGuidePreference(a: GuideTrain, b: GuideTrain): number {
  // 「跨 15 級以上」含 15
  const wide = (segment: GuideTrain) => Number(segment.to - segment.from >= 15);
  return wide(a) - wide(b)
    || Number(a.kind === "party") - Number(b.kind === "party")
    || VERIFIED_RANK[a.v] - VERIFIED_RANK[b.v]
    || (a.to - a.from) - (b.to - b.from);
}

export function mainPick(args: {
  level: number;
  job: number;
  /** 這個等級實際那一轉的攻略 */
  guide?: GuideJob;
  common: GuideCommon;
  training: TrainingRow[];
  monsters: Monster[];
  maps: Record<string, MapRecord>;
  graph: Record<string, PortalEdge[]>;
  nearestTown: Record<string, [number, number]>;
}): MainPick | undefined {
  const { level, job, guide, common, monsters, maps, graph, nearestTown } = args;
  if (job === 0 && level >= 8) return { kind: "advance", instructors: instructors() };

  const stage = stageJob(job, level);
  const index = new Map(monsters.map(monster => [monster.id, monster]));
  const spawns = spawnIndex(monsters);
  const island = onIsland(job, level);
  const reachable = (map: number) => isIslandMap(map) === island && Boolean(maps[String(map)]?.zh);
  const training = args.training.filter(row => reachable(row.m) && row.sp > BOSS_SPAWN_MAX);
  const rows = new Map(training.map(row => [row.m, row]));
  const mobsOf = (map: number): Array<[number, number]> => spawns.get(map) ?? [];

  const options: TrainOption[] = [];
  const segments = guide ? trainingForBand({ from: level, to: level + 1 }, guide.train) : [];
  for (const segment of [...segments].sort(byGuidePreference)) {
    if (segment.pq || segment.map === null || !reachable(segment.map)) continue;
    const map = segment.map;
    const mobs = mobsOf(map);
    const fit = jobFit(stage, level, mobs, index);
    if (!fit.ok) continue;
    options.push({
      map,
      title: maps[String(map)]?.zh ?? shortName(segment.name),
      party: segment.kind === "party",
      source: "guide",
      guide: segment,
      row: rows.get(map),
      mobs,
      fit,
      ...routeFrom(map, graph, maps, nearestTown),
    });
  }

  const ranked = planTraining({ level, job: stage }, training, index, 40)
    .filter(pick => !options.some(option => option.map === pick.row.m))
    .map(pick => ({ pick, mobs: mobsOf(pick.row.m), fit: jobFit(stage, level, mobsOf(pick.row.m), index) }))
    .filter(entry => entry.fit.ok)
    .slice(0, 8)
    .map(entry => {
      const route = routeFrom(entry.pick.row.m, graph, maps, nearestTown);
      const far = route.hops !== undefined && route.hops >= FAR_HOPS ? 0.7 : 1;
      return { ...entry, route, score: entry.pick.score * entry.fit.factor * far };
    })
    .sort((a, b) => b.score - a.score);
  for (const entry of ranked) {
    options.push({
      map: entry.pick.row.m,
      title: maps[String(entry.pick.row.m)]?.zh ?? String(entry.pick.row.m),
      party: false,
      source: "data",
      row: entry.pick.row,
      mobs: entry.mobs,
      fit: entry.fit,
      ...entry.route,
    });
  }

  const pq = pqFor(common, job, level);
  if (pq) return { kind: "pq", ...pq, alt: options.find(option => !option.party) ?? options[0] };

  const main = options[0];
  if (!main) return undefined;
  const alt = options.slice(1).find(option => option.party !== main.party) ?? options[1];
  // 「最高到 Lv.N」只看這個職業能練的圖：僧侶的最高圖不是一般圖的最高圖，否則會跟推薦的圖自相矛盾
  const fitLevels = training.filter(row => jobFit(stage, level, mobsOf(row.m), index).ok).map(row => row.lv);
  const ceiling = main.row && level - main.row.lv >= 10 ? Math.max(...fitLevels) : undefined;
  return { kind: "map", option: main, alt, ceiling };
}
