// src/lib/boss/state.ts
// 頻道狀態計算：純函式，不碰 React、不碰時鐘（now 由呼叫端傳入）
import type { BossDef, BossEvent, ChannelState, ServerKey } from "./types";

/** 紀錄超過 12 小時就不顯示 */
export const EXPIRE_MS = 12 * 3600_000;

/**
 * 每個頻道只留最新一筆（kill／empty）。
 * 被 retract 指到的紀錄先拿掉；超過 12 小時的丟掉；比 at，同 at 看陣列順序（後面的贏）。
 */
export function latestByChannel(
  events: BossEvent[],
  server: ServerKey,
  boss: number,
  now: number,
): Map<number, BossEvent> {
  const retracted = new Set<string>();
  for (const e of events) {
    if (e.kind === "retract" && e.server === server && e.boss === boss) retracted.add(e.target);
  }
  const out = new Map<number, BossEvent>();
  for (const e of events) {
    if (e.kind === "retract") continue;
    if (e.server !== server || e.boss !== boss) continue;
    if (retracted.has(e.id)) continue;
    if (now - e.at > EXPIRE_MS) continue;
    const cur = out.get(e.ch);
    if (!cur || e.at >= cur.at) out.set(e.ch, e);
  }
  return out;
}

/** 算一個頻道現在的狀態與要顯示的字 */
export function channelState(
  ch: number,
  latest: BossEvent | undefined,
  boss: BossDef,
  now: number,
): ChannelState {
  if (!latest || latest.kind === "retract") {
    return { ch, kind: "none", minutes: 0, label: "沒記錄" };
  }
  // 未來的時間（手機時鐘差）當 0
  const ms = Math.max(0, now - latest.at);
  const t = ms / 60000;
  if (latest.kind === "empty") {
    return { ch, kind: "empty", minutes: t, label: `沒王 ${Math.floor(t)} 分前`, event: latest };
  }
  if (boss.min === null || boss.max === null) {
    return { ch, kind: "since", minutes: t, label: `打死 ${Math.floor(t)} 分了`, event: latest };
  }
  // 邊界用毫秒比，避免小數誤差
  if (ms < boss.min * 60000) {
    return { ch, kind: "wait", minutes: t, label: `還要 ${Math.ceil(boss.min - t)} 分`, event: latest };
  }
  if (ms <= boss.max * 60000) {
    return { ch, kind: "maybe", minutes: t, label: "可能出了", event: latest };
  }
  return { ch, kind: "sure", minutes: t, label: "一定出了", event: latest };
}

const ORDER: Record<ChannelState["kind"], number> = {
  sure: 0,
  maybe: 1,
  wait: 2,
  since: 3,
  empty: 4,
  none: 5,
};

/** 「下一個去這裡」排序：只含有紀錄的；各組都是經過越久越前（wait 即剩越少越前） */
export function rankNext(states: ChannelState[]): ChannelState[] {
  return states
    .filter((s) => s.kind !== "none")
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || b.minutes - a.minutes || a.ch - b.ch);
}
