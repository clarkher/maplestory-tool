import { equipStatLabel, equipStatValue } from "./format";
import { baseJob, jobOption } from "./jobs";
import type { Item, Profile } from "./types";

/** 「穿戴條件」那一組，照遊戲說明框的順序：等級、職業、力敏智幸 */
const REQUIREMENT_KEYS = ["reqLevel", "reqJob", "reqSTR", "reqDEX", "reqINT", "reqLUK"];

/**
 * 這個職業能不能用：reqJob 跟 format.ts 的需求職業是同一套位元（1 劍士、2 法師、4 弓箭手、8 盜賊、16 海盜），
 * 職業代碼的百位數就是第幾個位元（100 劍士 → 1、200 法師 → 2…）。
 * 沒寫或 0 誰都能用；-1 只有初心者（職業 0）能用；初心者不能用有職業限制的。認不得的值回 null，不猜。
 */
export function canJobUse(reqJob: number | undefined, job: number): boolean | null {
  if (!reqJob) return true;
  if (reqJob === -1) return job === 0;
  if (reqJob < 0 || reqJob >= 32) return null;
  if (job === 0) return false;
  if (!jobOption(job)) return null;
  return (reqJob & (1 << (baseJob(job) / 100 - 1))) !== 0;
}

export type JobFit = { tone: "sky" | "gold" | "maple"; text: string };

/**
 * 穿戴條件旁的小標籤：對照角色列的職業和等級（藍：能用、金：還差幾級、紅：職業不能用）。
 * 力量這類能力值網站不知道，不判斷；時裝、消耗品這些不是「裝備」的不顯示。
 */
export function jobFit(item: Item, profile: Profile): JobFit | null {
  if (item.c !== "裝備" || !item.eq || profile.job < 0 || profile.level <= 0) return null;
  const name = profile.job === 0 ? "初心者" : jobOption(profile.job)?.name;
  const reqJob = item.eq.reqJob;
  if (!name || (reqJob !== undefined && typeof reqJob !== "number")) return null;
  const usable = canJobUse(reqJob, profile.job);
  if (usable === null) return null;
  if (!usable) return { tone: "maple", text: `${name}不能用` };
  const short = Number(item.eq.reqLevel ?? 0) - profile.level;
  return short > 0 ? { tone: "gold", text: `${name}還差 ${short} 級` } : { tone: "sky", text: `${name}能用` };
}

export type StatRow = [string, string];

/** 一格數值；equipStatValue 回 null（只佔一格的裝備欄位，標題已經寫了）就不給這格 */
function statRows(key: string, value: number | string): StatRow[] {
  const text = equipStatValue(key, value);
  return text === null ? [] : [[equipStatLabel(key), text]];
}

/**
 * 道具卡的數值拆兩組：「穿戴條件」（等級、職業、力敏智幸，固定順序）跟「裝備數值」（其餘照資料順序）。
 * 「裝備」沒寫職業限制就補一格「不限職業」，玩家才知道誰都能用；時裝不補。
 */
export function equipGroups(item: Item): { requirements: StatRow[]; stats: StatRow[] } {
  const eq = item.eq;
  if (!eq) return { requirements: [], stats: [] };
  const requirements: StatRow[] = [];
  for (const key of REQUIREMENT_KEYS) {
    const value = key === "reqJob" && eq.reqJob === undefined && item.c === "裝備" ? 0 : eq[key];
    if (value !== undefined) requirements.push(...statRows(key, value));
  }
  const stats = Object.entries(eq)
    .filter(([key]) => !REQUIREMENT_KEYS.includes(key))
    .flatMap(([key, value]) => statRows(key, value));
  return { requirements, stats };
}
