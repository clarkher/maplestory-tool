// src/lib/speed/curve.ts
/**
 * 每分鐘經驗曲線（v1.20）。純函式：每秒拿目前這段（Segment）的累計經驗進來，
 * 把增加的量記到「開始後第幾分鐘」。換一段就重開；累計不會變小，變小或不變都不加。
 */
import type { Segment } from "./tracker";

export type Curve = { startedAt: number; lastGained: number; minutes: number[] };
export type Bar = { value: number; low: boolean };

const MINUTE_MS = 60000;
const BAR_COUNT = 60;

export function nextCurve(prev: Curve | null, seg: Segment | null, now: number): Curve | null {
  if (!seg) return null;
  const base: Curve = prev && prev.startedAt === seg.startedAt ? prev : { startedAt: seg.startedAt, lastGained: 0, minutes: [] };
  const delta = seg.gained - base.lastGained;
  if (delta <= 0) return base === prev ? prev : { ...base, minutes: [...base.minutes] };
  const index = Math.max(0, Math.floor((now - base.startedAt) / MINUTE_MS));
  const minutes = base.minutes.slice();
  while (minutes.length <= index) minutes.push(0); // 中間沒資料的分鐘補 0
  minutes[index] += delta;
  return { startedAt: base.startedAt, lastGained: seg.gained, minutes };
}

/** 最後 60 根；低於全部分鐘平均（只算 >0 的分鐘）一半的標 low */
export function curveBars(c: Curve): Bar[] {
  const positive = c.minutes.filter((v) => v > 0);
  const avg = positive.length ? positive.reduce((a, b) => a + b, 0) / positive.length : 0;
  return c.minutes.slice(-BAR_COUNT).map((value) => ({ value, low: avg > 0 && value < avg / 2 }));
}

/** 最近一段連續 low 的分鐘（從 1 起算、以整段為基準），沒有就 null */
export function lowRunText(bars: Bar[], totalMinutes: number): string | null {
  const offset = totalMinutes - bars.length;
  let end = bars.length - 1;
  while (end >= 0 && !bars[end].low) end--;
  if (end < 0) return null;
  let start = end;
  while (start > 0 && bars[start - 1].low) start--;
  const from = offset + start + 1;
  const to = offset + end + 1;
  const range = from === to ? `第 ${from} 分鐘` : `第 ${from}～${to} 分鐘`;
  return `${range}掉很多（可能死了或在補藥）`;
}
