// src/lib/speed/status-bar.ts
import { rgbAt, type Frame } from "./frame";

/** 下方狀態列的 HP、MP、EXP 三條（x 範圍，右不含）、條的上下緣、跟基準截圖比的縮放 */
export type StatusBar = { hp: [number, number]; mp: [number, number]; exp: [number, number]; top: number; bottom: number; scale: number };

/** 基準截圖（1364×799 視窗）裡 EXP 條的高度（含上下的亮邊） */
export const BASE_BAR_H = 18;

const isRed = (r: number, g: number, b: number) => r > 150 && g < 90 && b < 90;
const isBlue = (r: number, g: number, b: number) => b > 150 && r < 110;
const isLime = (r: number, g: number, b: number) => g > 180 && b < 130 && r > 100;

/**
 * 畫面下面兩成裡，紅（HP）藍（MP）黃綠（EXP）最多的那一列就是三條的中間；
 * 那一列從左到右「夠長的亮段」前三段依序是 HP、MP、EXP（長度要差不多，不然當成認錯）。
 * 上下緣：從 EXP 條左邊往內 3px 那一欄，往上往下走到黑框為止。
 */
export function findStatusBar(frame: Frame): StatusBar | null {
  const { width, height } = frame;
  let row = -1;
  let most = 0;
  for (let y = Math.floor(height * 0.8); y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = rgbAt(frame, x, y);
      if (isRed(r, g, b) || isBlue(r, g, b) || isLime(r, g, b)) count++;
    }
    if (count > most) {
      most = count;
      row = y;
    }
  }
  if (row < 0 || most < width * 0.02) return null;

  const runs: [number, number][] = [];
  let start = -1;
  for (let x = 0; x <= width; x++) {
    const bright = x < width && Math.max(...rgbAt(frame, x, row)) >= 100;
    if (bright && start < 0) start = x;
    if (!bright && start >= 0) {
      if (x - start >= width * 0.05) runs.push([start, x]);
      start = -1;
    }
  }
  if (runs.length < 3) return null;
  const [hp, mp, exp] = runs;
  const widths = [hp, mp, exp].map(([a, b]) => b - a);
  if (Math.max(...widths) > Math.min(...widths) * 1.35) return null;

  const probe = exp[0] + 3;
  let top = row;
  let bottom = row;
  while (top > 0 && Math.max(...rgbAt(frame, probe, top - 1)) >= 40) top--;
  while (bottom < height - 1 && Math.max(...rgbAt(frame, probe, bottom + 1)) >= 40) bottom++;
  const barH = bottom + 1 - top;
  if (barH < 6) return null;
  return { hp, mp, exp, top, bottom: bottom + 1, scale: barH / BASE_BAR_H };
}
