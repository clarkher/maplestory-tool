/**
 * 任務頁清單：排序用的等級（沒寫需求等級的用首頁同一套推算的建議等級），
 * 跟「只看我現在接得到的」的分段、排序、小字（做完的不列、前置還沒做的排後面）。
 */
import { jobLineage, questBucket, questEligible, type QuestBucket } from "./planner";
import type { Profile, Quest } from "./types";

export type ListLevel = { level: number; suggested: boolean } | null;

/** 有需求等級用需求等級；沒寫的用推算的建議等級（effectiveLevels：要打的怪、要收的道具誰掉、前置任務、玩家推薦）；推不出來是 null */
export function listLevel(quest: Quest, effective: ReadonlyMap<string, number>): ListLevel {
  if (quest.minLv) return { level: quest.minLv, suggested: false };
  const level = effective.get(quest.id) ?? 0;
  return level > 0 ? { level, suggested: true } : null;
}

/** 等級由低到高，推不出來的排最後 */
export function compareListLevel(a: ListLevel, b: ListLevel): number {
  if (!a || !b) return Number(!a) - Number(!b);
  return a.level - b.level;
}

export function levelNote(quest: Quest, level: ListLevel): string {
  if (!level) return quest.cat;
  return level.suggested ? `建議 Lv.${level.level}` : `Lv.${level.level}`;
}

export type BoardRow = { quest: Quest; bucket: QuestBucket; levelsLeft?: number; missingPre: Quest[] };

const RANK: Record<QuestBucket, number> = { expiring: 0, fresh: 1, backlog: 2 };

/** 這個角色還接得到這個前置嗎：過了等級上限、楓之島（離島回不去）、別的職業的，都當作已經接不到 */
function stillOpen(quest: Quest, profile: Profile, lineage: ReadonlySet<number>): boolean {
  if (quest.maxLv !== undefined && profile.level > quest.maxLv) return false;
  if (quest.island && profile.job !== 0) return false;
  if (quest.jobs?.length && !quest.jobs.some(job => lineage.has(job))) return false;
  return true;
}

/**
 * 「只看我現在接得到的」：接得到的（questEligible）、沒打勾做完的，
 * 分快過期／剛解鎖／隨時可以補；同一段裡能直接接的在前、前置還沒打勾的在後，
 * 再來快過期的照剩幾級、新解鎖的（需求等級高的）在前、經驗多的在前。
 * 前置還沒打勾、而且這個角色還接得到那個前置，才算「要先做」；接不到了的前置不擋（多半早就做過，網站不知道）。
 *
 * keepId＝卡片開著的那一筆：照沒打勾算——留在清單裡，別列的「要先做」也照舊。
 * 在卡片上打勾、取消打勾，清單的順序都不動（免得一按，原本要先做它的那些列跳到它前面、把它連卡片往下擠），收起後才照打勾重排。
 */
export function questBoard(quests: Quest[], profile: Profile, done: ReadonlySet<string>, keepId: string | null = null): BoardRow[] {
  const lineage = new Set(jobLineage(profile.job));
  const byId = new Map(quests.map(quest => [quest.id, quest]));
  const boardDone = keepId && done.has(keepId) ? new Set([...done].filter(id => id !== keepId)) : done;
  return quests
    .filter(quest => questEligible(quest, profile, lineage) && !boardDone.has(quest.id))
    .map(quest => {
      const missingPre = (quest.pre ?? [])
        .map(id => byId.get(id))
        .filter((pre): pre is Quest => Boolean(pre) && !boardDone.has(pre!.id) && stillOpen(pre!, profile, lineage));
      return { quest, ...questBucket(quest, profile), missingPre };
    })
    .sort((a, b) =>
      RANK[a.bucket] - RANK[b.bucket]
      || Number(a.missingPre.length > 0) - Number(b.missingPre.length > 0)
      || (a.levelsLeft ?? 99) - (b.levelsLeft ?? 99)
      || (b.quest.minLv ?? 0) - (a.quest.minLv ?? 0)
      || (b.quest.exp ?? 0) - (a.quest.exp ?? 0));
}

/**
 * 「接得到的」小字，三種寫法，都不是回 null：
 * - 快過期、前置也還沒做：「再 N 級接不到 · 要先做前置」兩件都寫（升 N 級後超過等級上限；前置的名字卡片裡有，手機一列放不下）
 * - 只有前置還沒做：「要先做：〇〇」，兩個以上加「等 N 個」
 * - 只有快過期：「再 N 級接不到」
 */
export function boardNote(row: BoardRow): string | null {
  const [first, ...others] = row.missingPre;
  const { bucket, levelsLeft } = row;
  if (bucket === "expiring" && levelsLeft !== undefined) {
    const expiring = `再 ${levelsLeft + 1} 級接不到`;
    return first ? `${expiring} · 要先做前置` : expiring;
  }
  if (first) return others.length ? `要先做：${first.n} 等 ${others.length + 1} 個` : `要先做：${first.n}`;
  return null;
}
