// src/lib/speed/hp.ts
import { rgbAt, type Frame } from "./frame";
import type { StatusBar } from "./status-bar";

/** HP 掉到這個比例以下響一次 */
export const LOW_HP = 0.3;
/** 回到這個比例以上才會再響（遲滯，避免在門檻附近一直叫） */
export const RESET_HP = 0.5;

export type LowHp = { armed: boolean };

/** 紅色填滿：比 findStatusBar 的紅鬆一點（條下半部的暗紅 r 只有 140～160），但 g、b 一定遠小於 r */
const isFill = (r: number, g: number, b: number) => r > 110 && g < r * 0.45 && b < r * 0.45;

/**
 * 讀 HP 比例：在 HP 條中線附近取五列，每列從左到右數「紅色填滿」的長度，取中位數再除以條內寬。
 * 條上的白色「[現在/最大]」文字會把紅色切成一小段一小段：紅色之間的空隙只要不超過 textGap（字的筆畫＋字距，
 * 照縮放算），就當作文字、接著算；空隙超過就是真的空條（灰色）了，在那裡收尾。
 * 條內寬＝條寬扣掉左右各一圈邊框；整列都沒有紅色的列不算，五列都讀不到回 null。
 */
export function hpRatio(frame: Frame, bar: StatusBar): number | null {
  const [x0, x1] = bar.hp;
  const border = Math.max(1, Math.round(bar.scale));
  const inner0 = x0 + border;
  const inner1 = x1 - border;
  const innerW = inner1 - inner0;
  if (innerW < 20) return null;
  const textGap = Math.max(3, Math.round(4 * bar.scale));
  const mid = Math.floor((bar.top + bar.bottom) / 2);
  const reach = Math.max(2, Math.round(2 * bar.scale));
  const lengths: number[] = [];
  for (let y = mid - reach; y <= mid + reach; y++) {
    if (y < 0 || y >= frame.height) continue;
    let end = -1;
    let gap = 0;
    for (let x = inner0; x < inner1; x++) {
      const [r, g, b] = rgbAt(frame, x, y);
      if (isFill(r, g, b)) {
        end = x;
        gap = 0;
      } else if (++gap > textGap && end >= 0) {
        break;
      }
    }
    if (end >= 0) lengths.push(end + 1 - inner0);
  }
  if (lengths.length === 0) return null;
  lengths.sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)];
  return Math.min(1, median / innerW);
}

/** 低血提醒的下一步：armed 且比例低於 LOW_HP → 響一次並收起來；回到 RESET_HP 以上才再裝上；讀不到（null）不變 */
export function nextLowHp(s: LowHp, ratio: number | null): { s: LowHp; beep: boolean } {
  if (ratio === null) return { s, beep: false };
  if (s.armed && ratio < LOW_HP) return { s: { armed: false }, beep: true };
  if (!s.armed && ratio >= RESET_HP) return { s: { armed: true }, beep: false };
  return { s, beep: false };
}
