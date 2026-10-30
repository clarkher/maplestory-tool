// src/lib/boss/remind.ts
// 提醒判斷：純函式，now 與已提醒清單由呼叫端傳入
import { latestByChannel } from "./state";
import { BOSSES, type BossDef, type BossEvent, type ServerKey } from "./types";

/** 最短重生時間前幾分鐘提醒 */
export const REMIND_BEFORE_MIN = 3;

/**
 * 該提醒的頻道：有實測時間的王、頻道最新一筆是 kill、
 * 已到「最短 - 3 分」、還沒超過最長、且沒提醒過（fired 放 eventId）。
 */
export function dueReminders(
  events: BossEvent[],
  server: ServerKey,
  now: number,
  fired: Set<string>,
): { eventId: string; boss: BossDef; ch: number }[] {
  const out: { eventId: string; boss: BossDef; ch: number }[] = [];
  for (const boss of BOSSES) {
    if (boss.min === null || boss.max === null) continue;
    for (const [ch, e] of latestByChannel(events, server, boss.id, now)) {
      if (e.kind !== "kill" || fired.has(e.id)) continue;
      const ms = now - e.at;
      if (ms >= (boss.min - REMIND_BEFORE_MIN) * 60000 && ms <= boss.max * 60000) {
        out.push({ eventId: e.id, boss, ch });
      }
    }
  }
  return out;
}
