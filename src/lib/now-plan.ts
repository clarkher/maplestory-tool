/**
 * 首頁「現在做這些」的排法：主推去哪、先解哪些任務、哪些是長線。
 * 規則：docs/superpowers/specs/2026-10-05-now-plan-design.md。全部是純函式，測試在 __tests__/now-plan.test.ts。
 */
import { jobFit, type JobFit } from "./job-rules";
import { JOB_LINES, advancementLevel, baseJob, stageJob } from "./jobs";
import { jobLineage, planTraining, questEligible } from "./planner";
import { boatNote, findRoute, suggestStart, victoriaReach } from "./route";
import {
  VERIFIED_RANK, groupQuests, isIslandBand, isIslandMap, levelFraction, longRunQuests, mustDoIndex, onIsland, questReachable, shortName, spawnIndex,
  trainingForBand, withoutLongRun, type Band,
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

/** 寫「30+」「10 起」這種開放式建議等級的任務，過了最大數字這麼多級也算過期（2026-10-05 final review P7 裁定） */
const OPEN_ENDED_SPAN = 40;

/**
 * 攻略建議等級的上限，過了上限 +5 就不推（Lv35 手套推給 Lv.82 沒意義）。
 * 「15–25」取 25；寫「30+」「10 起」的取最大的數字 +40；其他取最大的數字 +15。
 * 永久有用的獎勵（冒險家的戒指，reward.permanent）不管上限，nowQuests 那邊另外放行。
 */
export function recUpperLevel(rec: GuideMustDo | undefined): number | undefined {
  if (!rec) return undefined;
  const text = rec.lv.replace(/（[^）]*）/g, "");
  const range = text.match(/^\s*(\d+)\s*[–~～-]\s*(\d+)/);
  if (range) return Number(range[2]);
  const numbers = text.match(/\d+/g)?.map(Number) ?? [];
  if (!numbers.length) return undefined;
  return Math.max(...numbers) + (/[+＋]|起/.test(text) ? OPEN_ENDED_SPAN : 15);
}

/** 攻略建議等級過期了沒（過了上限 +5）；永久有用的獎勵不過期 */
function recExpired(rec: GuideMustDo | undefined, level: number): boolean {
  const upper = recUpperLevel(rec);
  return upper !== undefined && level > upper + 5 && !rec?.reward?.permanent;
}

/** 先解「留下」的門檻：用現在等級換算，經驗約幾級 */
const WORTH_LEVELS = 0.25;
/** 玩家推薦的任務，經驗到這麼多級就留下 */
const WORTH_LEVELS_RECOMMENDED = 0.08;

/**
 * 值不值得列（先解與長線同一條規則）：有關鍵獎勵；經驗 ≥ 0.25 級；玩家推薦且經驗 ≥ 0.08 級。
 * recs 是這一列涵蓋的任務各自的攻略推薦（沒有推薦就是 undefined）。
 */
function worthListing(fraction: number, recs: Array<GuideMustDo | undefined>): boolean {
  const found = recs.filter((rec): rec is GuideMustDo => Boolean(rec));
  return found.some(rec => Boolean(rec.reward?.label)) || fraction >= WORTH_LEVELS || (found.length > 0 && fraction >= WORTH_LEVELS_RECOMMENDED);
}

function isLongKill(quest: Quest, min = LONG_RUN_MIN): boolean {
  return (quest.needMobs ?? []).some(mob => (mob.c ?? 0) >= min);
}

/** 起始 NPC 站在楓之島（離島後回不去，這種任務離島後不列、也不給「去」） */
function npcOnIsland(quest: Quest): boolean {
  return quest.sNpc?.map !== undefined && isIslandMap(quest.sNpc.map);
}

type QuestLines = {
  stage: number;
  lineage: Set<number>;
  recs: Map<string, GuideMustDo>;
  /** 這個職業做得到的全部任務（不看等級）：拿來算「第幾段／共幾段」 */
  forJob: Quest[];
  lineOf: Map<string, string>;
  /** 一條線的全部任務，照實際等級排好 */
  lines: Map<string, Quest[]>;
};

/**
 * 先解跟升級路線的必解共用的任務線：一筆攻略推薦（mustDo）就是一條線（`rec:任務 id`），
 * 即使它涵蓋的幾段前置串不起來（例：伊卡路斯任務鏈）；沒有推薦的照前置任務分（groupQuests）。
 * 所以前置有推薦、自己沒有的任務是另一條線，不會掛上別的任務的「為什麼」。
 */
function questLines(stage: number, quests: Quest[], common: GuideCommon, maps: Record<string, Pick<MapRecord, "zh">>, effective: Map<string, number>): QuestLines {
  const lineage = new Set(jobLineage(stage));
  const recs = mustDoIndex(common);
  const levelOf = (quest: Quest) => effective.get(quest.id) ?? quest.minLv ?? 0;
  const forJob = quests.filter(quest =>
    (!quest.jobs?.length || quest.jobs.some(code => lineage.has(code)))
    && quest.cat !== "組隊任務"
    && questReachable(quest, maps));
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
  return { stage, lineage, recs, forJob, lineOf, lines };
}

/** 這批任務裡長線那種的：要打 200 隻以上；同一道具在這批任務裡累計 200 個以上（它們放在長線，不算先解、必解） */
function longRunIds(candidates: Quest[], monsters: Monster[]): Set<string> {
  const kept = new Set(withoutLongRun(candidates.filter(quest => !isLongKill(quest)), monsters).map(quest => quest.id));
  return new Set(candidates.filter(quest => !kept.has(quest.id)).map(quest => quest.id));
}

/** 現在接得到、做得動的任務（先解的候選）：職業、等級上下限、實際等級 ≤ 現在等級；離開楓之島後不算島上的 */
function doableNow(shared: QuestLines, level: number, effective: Map<string, number>, island: boolean): Quest[] {
  return shared.forJob.filter(quest =>
    questEligible(quest, { level, job: shared.stage }, shared.lineage)
    && (effective.get(quest.id) ?? quest.minLv ?? 0) <= level
    && (island || !npcOnIsland(quest)));
}

/** 拿掉長線那種（long）；沒有經驗又沒有攻略推薦的也不算 */
function withoutLongParts(candidates: Quest[], long: Set<string>, recs: Map<string, GuideMustDo>): Quest[] {
  return candidates.filter(quest => !long.has(quest.id) && ((quest.exp ?? 0) > 0 || recs.has(quest.id)));
}

/**
 * 把一批任務照任務線收成一行一行：標題（有推薦用推薦的名字）、第幾段／共幾段（整條線）、經驗、
 * 約幾級（用 levelFor 回傳的等級換算；拿到的是這條線這次列出的那幾段，照實際等級排好）。值不值得（worthListing）、過期由呼叫端決定要不要套。
 */
function lineItems(
  candidates: Quest[],
  shared: QuestLines,
  levelFor: (parts: Quest[]) => number,
  toNext: number[],
  job: number,
  keep: (rec: GuideMustDo | undefined, fraction: number) => boolean,
): Array<{ item: NowQuest; score: number }> {
  const { lineOf, lines, recs } = shared;
  const byLine = new Map<string, Quest[]>();
  for (const quest of candidates) {
    const key = lineOf.get(quest.id) ?? `chain:${quest.id}`;
    byLine.set(key, [...(byLine.get(key) ?? []), quest]);
  }
  const scored: Array<{ item: NowQuest; score: number }> = [];
  for (const [key, members] of byLine) {
    const line = lines.get(key) ?? members;
    const parts = line.filter(quest => members.includes(quest));
    const rec = parts.map(quest => recs.get(quest.id)).find((value): value is GuideMustDo => Boolean(value));
    const exp = parts.reduce((sum, quest) => sum + (quest.exp ?? 0), 0);
    const fraction = levelFraction(exp, levelFor(parts), toNext);
    if (!keep(rec, fraction)) continue;
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
        reward: rec?.reward?.label,
        rewardItem: rewardItemFor(rec, parts, job),
        rec,
        npc: parts[0].sNpc,
      },
      score: fraction + (rec ? 0.2 : 0),
    });
  }
  // 有關鍵獎勵的一律排在沒有的前面；同一組裡比約幾級（玩家推薦加 0.2）
  return scored.sort((a, b) => Number(Boolean(b.item.reward)) - Number(Boolean(a.item.reward)) || b.score - a.score);
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
  const shared = questLines(stageJob(job, level), quests, common, maps, effective);
  const candidates = doableNow(shared, level, effective, onIsland(job, level));
  const doable = withoutLongParts(candidates, longRunIds(candidates, monsters), shared.recs);
  const sorted = lineItems(doable, shared, () => level, common.expTable.toNext, job, (rec, fraction) => !recExpired(rec, level) && worthListing(fraction, [rec]));
  return (limit === undefined ? sorted : sorted.slice(0, limit)).map(entry => entry.item);
}

/** 「第 a–b 段／共 N 段」：整條線只有一段時不寫（先解跟升級路線的必解同一個寫法） */
export function partsText(item: Pick<NowQuest, "firstPart" | "lastPart" | "totalParts">): string | null {
  if (item.totalParts <= 1) return null;
  const range = item.firstPart === item.lastPart ? String(item.firstPart) : `${item.firstPart}–${item.lastPart}`;
  return `第 ${range} 段／共 ${item.totalParts} 段`;
}

/** 升級路線的必解一行：先解的一行，加上這條線在這段最早幾等能接 */
export type BandQuest = NowQuest & { level: number };

/** 研究裡的建議等級是文字（「15 起接，25／35／40 各解一段」），取第一個數字 */
function recommendedLevel(rec: GuideMustDo | undefined): number | undefined {
  const match = rec?.lv.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

/**
 * 升級路線某一段的必解：在這段解鎖的任務（門檻等級，沒有門檻用攻略建議等級），規則跟先解同一套——
 * 同一條任務線、同一個標題、長線那種拿掉、同一條值不值得的門檻；第幾段／共幾段算整條線。
 * 長線那種：現在就做得動的任務用先解那一批判斷（同一條線兩邊拿掉的段一樣，經驗才會是同一個數字，
 * 冒險家的戒指不會一邊 +630,000、一邊 +660,000）；還做不動的，在這段裡自己判斷（詛咒娃娃 2,300 個）。
 * 約幾級用接得到那條線的等級算（這段列出的第一段的實際等級）：你在的這段跟之前的段取它跟你現在的等級較高的
 * （現在就做得到的就是現在等級，跟先解同一個數字），之後的段取它跟那段起點較高的——法師 8 看 20 等的任務不會寫約 4.1 級。
 * 離開楓之島之後，NPC 站在島上的任務不列。
 */
export function bandQuests(args: {
  band: Band;
  level: number;
  job: number;
  quests: Quest[];
  monsters: Monster[];
  common: GuideCommon;
  maps: Record<string, Pick<MapRecord, "zh">>;
  effective: Map<string, number>;
  limit?: number;
}): BandQuest[] {
  const { band, level, job, quests, monsters, common, maps, effective, limit = 4 } = args;
  const shared = questLines(isIslandBand(band) ? 0 : stageJob(job, band.from), quests, common, maps, effective);
  const island = onIsland(job, level);
  const unlockOf = (quest: Quest) => quest.minLv ?? recommendedLevel(shared.recs.get(quest.id));
  const inBand = shared.forJob.filter(quest => {
    const unlock = unlockOf(quest);
    return unlock !== undefined && unlock >= band.from && unlock < band.to
      && (!quest.island || isIslandBand(band))
      && (island || !npcOnIsland(quest));
  });
  const now = doableNow(questLines(stageJob(job, level), quests, common, maps, effective), level, effective, island);
  const nowIds = new Set(now.map(quest => quest.id));
  const longNow = longRunIds(now, monsters);
  const longLater = longRunIds(inBand.filter(quest => !nowIds.has(quest.id)), monsters);
  const long = new Set(inBand.filter(quest => (nowIds.has(quest.id) ? longNow : longLater).has(quest.id)).map(quest => quest.id));
  const floor = band.from > level ? band.from : level;
  const levelFor = (parts: Quest[]) => Math.max(floor, effective.get(parts[0].id) ?? parts[0].minLv ?? 0);
  const rows = lineItems(withoutLongParts(inBand, long, shared.recs), shared, levelFor, common.expTable.toNext, job, (rec, fraction) => worthListing(fraction, [rec]));
  return rows.slice(0, limit).map(({ item }) => ({ ...item, level: Math.min(...item.quests.map(quest => unlockOf(quest) ?? band.from)) }));
}

/**
 * 先解列的「帶我去」終點：NPC 站的圖走得到就去那裡；站在隱藏地圖（例：海盜教官卡伊琳的訓練場）
 * 就帶去那張圖的回城點（航海室），按鈕要寫出那張圖的名字（viaReturn）。都走不到就不給按鈕。
 */
export function npcGoTarget(
  npcMap: number | undefined,
  maps: Record<string, Pick<MapRecord, "zh" | "ret">>,
  routable: Set<number>,
): { map: number; viaReturn: boolean } | undefined {
  if (npcMap === undefined) return undefined;
  if (routable.has(npcMap)) return { map: npcMap, viaReturn: false };
  const back = maps[String(npcMap)]?.ret;
  return back !== undefined && routable.has(back) ? { map: back, viaReturn: true } : undefined;
}

/* ------------------------------------------------------------------ 長線 */

export type LongRunTask = { kind: "item" | "kill"; id: number; n: string; c: number; quests: string[]; exp: number; droppers: number[] };

/**
 * 首頁的長線：先解候選裡要打／收 200 以上的那些，所以跟先解用同一套「現在接得到」——
 * 職業、等級上下限、實際等級 ≤ 現在等級、起始 NPC 在開放地圖、不是組隊任務、攻略建議等級沒過期；
 * 也用同一條值不值得的門檻（有關鍵獎勵、經驗 ≥ 0.25 級、玩家推薦且 ≥ 0.08 級），Lv.82 不會再看到石面怪人 ×300。
 * 還在楓之島的不列（島上沒有長線任務，離島後回不去）。
 */
export function longRunNow(args: {
  level: number;
  job: number;
  quests: Quest[];
  monsters: Monster[];
  common: GuideCommon;
  maps: Record<string, Pick<MapRecord, "zh">>;
  effective: Map<string, number>;
}): LongRunTask[] {
  const { level, job, quests, monsters, common, maps, effective } = args;
  if (onIsland(job, level)) return [];
  const stage = stageJob(job, level);
  const lineage = new Set(jobLineage(stage));
  const recs = mustDoIndex(common);
  const candidates = quests.filter(quest =>
    quest.cat !== "組隊任務"
    && questReachable(quest, maps)
    && questEligible(quest, { level, job: stage }, lineage)
    && (effective.get(quest.id) ?? quest.minLv ?? 0) <= level
    && !recExpired(recs.get(quest.id), level));
  const toNext = common.expTable.toNext;
  return longRunTasks(candidates, monsters)
    .filter(entry => worthListing(levelFraction(entry.exp, level, toNext), entry.quests.map(id => recs.get(id))));
}

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

/** 刷怪點這麼少的是王圖（巴洛古整張圖 1 隻），不進練功推薦（主推卡、升級路線的遊戲資料替代都用這個） */
export const BOSS_SPAWN_MAX = 3;
/** 從最近城鎮要走這麼多張圖以上，排序打七折 */
const FAR_HOPS = 8;
/** 攻略圖比參考等級（現在等級與能練的最高圖取小）低這麼多級以上算過期，排在遊戲資料後面 */
const STALE_GAP = 10;
/** 現在等級比能練的最高圖高這麼多級以上才加封頂提示 */
const CEILING_GAP = 10;
/** 主推圖跟能練的最高圖差這麼多級以內，封頂提示才說「這張已經是你能去最好的」 */
const BEST_GAP = 5;
/**
 * 能練的最高圖 ≤ 你的等級 + 這麼多級才算練得動（跟遊戲資料的等級適配一樣：同級到高 5 級），排在過期攻略前面；
 * 比這個還高就排最後、不當備案（只有它一張圖時才會變主推）
 */
const CAP_REACH = 5;

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
  /** 這張圖的等級：練功資料的平均等級，沒有就取出怪的最高等級；都不知道就沒有 */
  level?: number;
  /** 從最近城鎮走幾張圖；沒有代表城鎮走不到（不給「帶我去」） */
  hops?: number;
  town?: number;
  /** 出發的城鎮跟維多利亞島的城鎮之間沒有傳送門（黃金海灘），要自己搭船或搭車過去（route.ts boatNote 的 region） */
  boat?: boolean;
};

/**
 * 封頂提示。level：能練的最高圖的地圖等級（拿來比較）；top：那張圖上最高等的怪幾等（畫面上寫的數字，
 * 跟卡上的怪「骷髏指揮官 Lv73」同一種寫法，不會寫「最高到 Lv.71」旁邊卻擺 Lv73 的怪）；
 * best＝主推圖已經是能去最好的（跟最高圖差 5 級以內）。
 */
export type Ceiling = { level: number; top: number; best: boolean };

/** 封頂提示的文字（用戶 10/05 定的寫法，最好的版本中間用逗號） */
export function ceilingText(ceiling: Ceiling): string {
  return ceiling.best
    ? `目前開放的練功圖最高到 Lv.${ceiling.top}，這張已經是你能去最好的。`
    : `目前開放的練功圖最高到 Lv.${ceiling.top}。`;
}

export type Instructor = { job: number; line: string; npcId: number; npcName: string; map: number; level: number };

export type MainPick =
  | { kind: "advance"; instructors: Instructor[] }
  /** job：寫這個範圍的攻略職業（可能是一轉） */
  | { kind: "pq"; pq: GuidePq; window: [number, number]; job: number; alt?: TrainOption }
  | { kind: "map"; option: TrainOption; alt?: TrainOption; ceiling?: Ceiling };

/** 備案前綴：主推單人、備案組隊才寫「有隊友：」；其他（主推組隊、兩張都單人）寫「人多時：」 */
export function altPrefix(main: TrainOption, alt: TrainOption): string {
  return !main.party && alt.party ? "有隊友：" : "人多時：";
}

/** 「帶我去」要有從城鎮走得到的路線（跟 /go 同一個條件），不然點進去只會看到「找不到可以走過去的起點」 */
export function canGo(option: TrainOption): boolean {
  return option.hops !== undefined;
}

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

/** 轉職卡標題：8–9 等只有法師能轉（其他職業 10 等），不寫「可以轉職了」騙想當劍士的人 */
export function advanceTitle(level: number): string {
  return `Lv.${level}・${level < 10 ? "可以轉法師了" : "可以轉職了"}`;
}

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

/**
 * 等級在這個職業的組隊任務範圍內就主推組隊；同時落在兩個範圍，選起始等級高的（比較貼近現在）。
 * job 是寫這個範圍的攻略職業：二轉玩家用到一轉攻略的範圍時（俠盜 30 等用盜賊的 21–30），卡片要寫「盜賊玩家推薦」。
 */
export function pqFor(common: GuideCommon, job: number, level: number): { pq: GuidePq; window: [number, number]; job: number } | undefined {
  const keys = pqKeys(job, level);
  const hits = (common.pq ?? []).flatMap(pq => {
    const key = keys.find(code => pq.byJob[String(code)]);
    const window = key === undefined ? undefined : pq.byJob[String(key)];
    return key !== undefined && window && level >= window[0] && level <= window[1] ? [{ pq, window, job: key }] : [];
  });
  return hits.sort((a, b) => b.window[0] - a.window[0])[0];
}

/** 組隊任務範圍要看哪幾個職業的攻略：這個等級實際那一轉，再加一轉（二轉玩家也用得到一轉攻略的範圍） */
function pqKeys(job: number, level: number): number[] {
  return [...new Set([stageJob(job, level), baseJob(job)])].filter(code => code > 0);
}

/** 組隊任務剛過遊戲上限後，主推卡多寫一行的那幾級（上限 +1 到 +5） */
const PQ_CLOSED_SPAN = 5;

/**
 * 組隊任務剛過遊戲的等級上限：這個職業本來有它的範圍、現在沒有組隊任務可打、等級在上限 +1～+5 → 回傳那個組隊任務跟上限
 * （狂戰士 31 等：超綠只開放到 30 等）。只看遊戲任務有上限的（第一次同行 30）；月妙沒有上限，不會出現。
 */
export function pqJustClosed(
  common: GuideCommon,
  job: number,
  level: number,
  quests: Array<Pick<Quest, "id" | "maxLv">>,
): { pq: GuidePq; maxLv: number } | undefined {
  if (pqFor(common, job, level)) return undefined;
  const keys = pqKeys(job, level);
  for (const pq of common.pq ?? []) {
    if (!pq.quest || !keys.some(code => pq.byJob[String(code)])) continue;
    const maxLv = quests.find(quest => quest.id === pq.quest)?.maxLv;
    if (maxLv !== undefined && level > maxLv && level <= maxLv + PQ_CLOSED_SPAN) return { pq, maxLv };
  }
  return undefined;
}

export function pqClosedText(closed: { pq: GuidePq; maxLv: number }): string {
  return `${closed.pq.name}只開放到 ${closed.maxLv} 等。`;
}

/** 攻略圖的怪：段落自己點名、這張圖真的有出的排前面（刷怪點多的先），其他照刷怪點數接在後面——卡上的怪才對得上理由 */
export function namedMobsFirst(mobs: Array<[number, number]>, named: number[]): Array<[number, number]> {
  const wanted = new Set(named);
  return [...mobs.filter(([id]) => wanted.has(id)), ...mobs.filter(([id]) => !wanted.has(id))];
}

/**
 * 從最近的城鎮走到這張圖：幾張圖、哪個城鎮、那個城鎮要不要自己搭船或搭車（跟 /go 同一套）。
 * 城鎮走不到就是空的，不給「帶我去」。
 */
export function townRoute(
  map: number,
  graph: Record<string, PortalEdge[]>,
  maps: Record<string, MapRecord>,
  nearestTown: Record<string, [number, number]>,
  island = false,
): { town?: number; hops?: number; boat?: boolean } {
  const town = suggestStart(graph, maps, nearestTown, map);
  if (!town) return {};
  const route = findRoute(graph, town, map);
  return route.ok ? { town, hops: route.hops, boat: boatNote(town, victoriaReach(graph), island) === "region" } : {};
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

/**
 * 主推大卡。一套設計（final review F1／F4／I1）：
 * - 能練的最高圖（cap）：通過職業規則、不是王圖、走得到、有城鎮路線的練功圖裡等級最高的。
 * - 參考等級＝現在等級與 cap 取小；攻略圖的等級比參考等級低 10 級以上算過期。
 * - 排序：沒過期的攻略圖 → 遊戲資料（城鎮走不到的不推）→ cap 那張圖 → 過期的攻略圖。高等級遊戲資料排不出來時
 *   主推就是 cap 圖、過期攻略當備案（多升一級主推不會從 Lv.71 掉到 Lv.49）。cap 圖 ≤ 你的等級 + 5 才這樣排；
 *   比這個還高（冰雷 50 看 Lv.67）就排最後，也不當備案。
 *   同一張圖只列一次，備案不會跟主推同一張。
 * - 封頂提示：現在等級比 cap 高 10 級以上才出；主推圖跟 cap 差 5 級以內才說「這張已經是你能去最好的」。
 */
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
  const anyRow = new Map(args.training.map(row => [row.m, row]));
  const mobsOf = (map: number): Array<[number, number]> => spawns.get(map) ?? [];
  const fitOf = (map: number) => jobFit(stage, level, mobsOf(map), index);
  const routes = new Map<number, { town?: number; hops?: number; boat?: boolean }>();
  const route = (map: number) => {
    if (!routes.has(map)) routes.set(map, townRoute(map, graph, maps, nearestTown, island));
    return routes.get(map) as { town?: number; hops?: number; boat?: boolean };
  };
  // 這張圖上最高等的怪幾等（卡上的怪、封頂提示都用這個寫法）
  const topMobLevel = (map: number): number | undefined => {
    const levels = mobsOf(map).map(([id]) => index.get(id)?.lv ?? 0).filter(value => value > 0);
    return levels.length ? Math.max(...levels) : undefined;
  };
  // 地圖等級：練功資料的平均等級；沒有練功資料就取出怪的最高等級；都沒有就是不知道
  const levelOf = (map: number): number | undefined => anyRow.get(map)?.lv ?? topMobLevel(map);

  // 能練的最高圖：由高往低找（同等級先看效率高的），碰到第一張有城鎮路線的就停，不用每張都算路線
  const capRow = training
    .filter(row => fitOf(row.m).ok)
    .sort((a, b) => b.lv - a.lv || b.eff - a.eff)
    .find(row => route(row.m).hops !== undefined);
  const cap = capRow?.lv;
  const reference = cap === undefined ? level : Math.min(level, cap);
  const isStale = (map: number) => {
    const mapLevel = levelOf(map);
    return mapLevel !== undefined && mapLevel <= reference - STALE_GAP;
  };

  const fresh: TrainOption[] = [];
  const stale: TrainOption[] = [];
  const segments = guide ? trainingForBand({ from: level, to: level + 1 }, guide.train) : [];
  for (const segment of [...segments].sort(byGuidePreference)) {
    if (segment.pq || segment.map === null || !reachable(segment.map)) continue;
    const map = segment.map;
    const fit = fitOf(map);
    if (!fit.ok) continue;
    const option: TrainOption = {
      map,
      title: maps[String(map)]?.zh ?? shortName(segment.name),
      party: segment.kind === "party",
      source: "guide",
      guide: segment,
      row: rows.get(map),
      mobs: namedMobsFirst(mobsOf(map), segment.mobs),
      fit,
      level: levelOf(map),
      ...route(map),
    };
    (isStale(map) ? stale : fresh).push(option);
  }

  // 遊戲資料：攻略已經寫到的圖不重複；城鎮走不到的不推（帶我去會找不到起點）；走 8 張圖以上打七折
  const guideMaps = new Set([...fresh, ...stale].map(option => option.map));
  const data: Array<{ option: TrainOption; score: number }> = [];
  for (const pick of planTraining({ level, job: stage }, training, index, 40)) {
    if (data.length >= 8) break;
    const map = pick.row.m;
    if (guideMaps.has(map)) continue;
    const fit = fitOf(map);
    if (!fit.ok) continue;
    const found = route(map);
    if (found.hops === undefined) continue;
    const far = found.hops >= FAR_HOPS ? 0.7 : 1;
    data.push({
      option: {
        map,
        title: maps[String(map)]?.zh ?? String(map),
        party: false,
        source: "data",
        row: pick.row,
        mobs: mobsOf(map),
        fit,
        level: pick.row.lv,
        ...found,
      },
      score: pick.score * fit.factor * far,
    });
  }
  data.sort((a, b) => b.score - a.score);

  const capOption: TrainOption[] = capRow ? [{
    map: capRow.m,
    title: maps[String(capRow.m)]?.zh ?? String(capRow.m),
    party: false,
    source: "data",
    row: capRow,
    mobs: mobsOf(capRow.m),
    fit: fitOf(capRow.m),
    level: capRow.lv,
    ...route(capRow.m),
  }] : [];
  // 能練的最高圖排在過期攻略前面：多升一級，主推不會從 Lv.71 掉回 Lv.49 的舊攻略圖。
  // 只在你練得動時（最高圖 ≤ 你的等級 + CAP_REACH）才往前排；比這個還高時（冰雷 50 看 Lv.67）排最後，
  // 而且不當備案（下面 altPool 拿掉它）；只有它一張圖時才會變主推
  const capFirst = capRow !== undefined && capRow.lv <= level + CAP_REACH;
  const ordered = [...fresh, ...data.map(entry => entry.option), ...(capFirst ? capOption : []), ...stale, ...(capFirst ? [] : capOption)];
  const options: TrainOption[] = [];
  for (const option of ordered) {
    if (!options.some(existing => existing.map === option.map)) options.push(option);
  }
  const altPool = (list: TrainOption[]) => list.filter(option => capFirst || capRow === undefined || option.map !== capRow.m);

  const pq = pqFor(common, job, level);
  if (pq) {
    const pool = altPool(options);
    return { kind: "pq", ...pq, alt: pool.find(option => !option.party) ?? pool[0] };
  }

  const main = options[0];
  if (!main) return undefined;
  const others = altPool(options.slice(1));
  const alt = others.find(option => option.party !== main.party) ?? others[0];
  // 封頂提示：比較用地圖等級，畫面上寫那張圖最高等的怪（跟卡上的怪同一種寫法）
  const ceiling = capRow !== undefined && cap !== undefined && level - cap >= CEILING_GAP
    ? { level: cap, top: topMobLevel(capRow.m) ?? cap, best: main.level !== undefined && main.level >= cap - BEST_GAP }
    : undefined;
  return { kind: "map", option: main, alt, ceiling };
}
