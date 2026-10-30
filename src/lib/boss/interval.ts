// src/lib/boss/interval.ts
// 回收間隔：同頻道連續兩次「打死」之間的秒數，用來累積實測重生時間
import type { BossEvent } from "./types";

const MIN_SEC = 600; // 10 分
const MAX_SEC = 21600; // 6 小時

/**
 * 兩筆都是 kill、同伺服器同王同頻道，且間隔 10 分～6 小時（含頭尾）才回傳秒數（整數），
 * 否則 null（重複點擊、跨日、換頻道都不算）。
 */
export function intervalOnKill(prev: BossEvent | undefined, next: BossEvent): number | null {
  if (!prev || prev.kind !== "kill" || next.kind !== "kill") return null;
  if (prev.server !== next.server || prev.boss !== next.boss || prev.ch !== next.ch) return null;
  const sec = Math.round((next.at - prev.at) / 1000);
  return sec >= MIN_SEC && sec <= MAX_SEC ? sec : null;
}

/** 秒數中位數，四捨五入到整數分；偶數個取中間兩個平均 */
export function medianMinutes(seconds: number[]): number {
  const s = [...seconds].sort((a, b) => a - b);
  const n = s.length;
  const mid = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  return Math.round(mid / 60);
}
