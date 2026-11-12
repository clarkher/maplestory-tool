import { dangerPenalty } from "@/lib/planner";
import { belowGate } from "@/lib/route";
import type { MapRecord, Monster, TrainingRow } from "@/lib/types";

/**
 * 去哪打楓葉商會硬幣（v2.18 使用者要的「輸入等級推薦打幣地圖跟怪」）。
 * 台服公告：10 等以上打「自己等級 -10～+10」的怪才掉；角色 65 等以上，55 級以上的怪都算。一天上限 100 枚。
 * 上限固定，所以比的是「打得快、會掉幣的怪多」：會掉幣的刷怪點 ÷ 回生秒數，怪比你低的打得快加分，高的扣分。
 */

export const COIN_MIN_LEVEL = 10;

/** 這個等級打這隻怪會不會掉幣 */
export function dropsCoin(level: number, monsterLevel: number): boolean {
  if (level < COIN_MIN_LEVEL) return false;
  if (level >= 65 && monsterLevel >= 55) return true;
  return Math.abs(monsterLevel - level) <= 10;
}

/** 畫面上寫的掉幣範圍 */
export function coinRange(level: number): [number, number | null] | null {
  if (level < COIN_MIN_LEVEL) return null;
  if (level >= 65) return [55, null];
  return [Math.max(1, level - 10), level + 10];
}

export type FarmPick = {
  row: TrainingRow;
  /** 會掉幣的怪：[怪物 id, 刷怪點數]，刷怪點多的在前 */
  coinMobs: [number, number][];
  /** 會掉幣的刷怪點 */
  coinSp: number;
  score: number;
};

export function planCoinFarm(
  level: number,
  training: TrainingRow[],
  monsters: Map<number, Monster>,
  maps: Record<string, MapRecord>,
  limit = 6,
): FarmPick[] {
  if (level < COIN_MIN_LEVEL) return [];
  const picks: FarmPick[] = [];
  for (const row of training) {
    if (belowGate(maps[String(row.m)], level)) continue;
    const coinMobs: [number, number][] = [];
    let coinSp = 0;
    for (const [id, count] of row.mobs) {
      const monster = monsters.get(id);
      if (!monster || monster.lv === null || !dropsCoin(level, monster.lv)) continue;
      coinMobs.push([id, count]);
      coinSp += count;
    }
    // 大半的怪不掉幣、或圖上站著打不動的怪：不推
    if (coinSp < 4 || coinSp / row.sp < 0.7) continue;
    const danger = dangerPenalty(level, row.lvMax);
    if (danger < 1) continue;
    const coinLv = coinMobs.reduce((sum, [id, count]) => sum + (monsters.get(id)!.lv ?? 0) * count, 0) / coinSp;
    const ease = coinLv <= level ? 1 : Math.max(0.3, 1 - (coinLv - level) / 8);
    picks.push({ row, coinMobs, coinSp, score: (coinSp / Math.max(row.resp, 1)) * ease });
  }
  picks.sort((a, b) => b.score - a.score);
  return picks.slice(0, limit);
}
