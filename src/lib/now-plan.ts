/**
 * 首頁「現在做這些」的排法：主推去哪、先解哪些任務、哪些是長線。
 * 規則：docs/superpowers/specs/2026-10-05-now-plan-design.md。全部是純函式，測試在 __tests__/now-plan.test.ts。
 */
import { baseJob, stageJob } from "./jobs";
import { jobLineage, questEligible } from "./planner";
import { groupQuests, levelFraction, longRunQuests, mustDoIndex, questReachable, withoutLongRun } from "./route-planner";
import type { GuideCommon, GuideMustDo, MapRecord, Monster, Quest, QuestNpc, QuestReward } from "./types";

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
  const lines = new Map<string, Quest[]>();
  const lineOf = new Map<string, string>();
  for (const group of groupQuests(forJob)) {
    const ordered = [...group.quests].sort((a, b) => levelOf(a) - levelOf(b) || a.id.localeCompare(b.id));
    lines.set(group.key, ordered);
    for (const quest of ordered) lineOf.set(quest.id, group.key);
  }

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
