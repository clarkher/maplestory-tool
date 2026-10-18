// src/lib/speed/status-bar.ts
import { rgbAt, type Frame } from "./frame";

/** 下方狀態列的 HP、MP、EXP 三條（x 範圍，右不含）、條的上下緣、跟基準截圖比的縮放 */
export type StatusBar = { hp: [number, number]; mp: [number, number]; exp: [number, number]; top: number; bottom: number; scale: number };

/** 基準截圖（1364×799 視窗）裡 EXP 條的高度（含上下的亮邊） */
export const BASE_BAR_H = 18;

/** 基準截圖裡 EXP 條的寬度（x 809～976）；縮放比例拿它算（縮放後條高的邊會暈開、偏大，條寬的誤差小很多） */
export const BASE_EXP_W = 167;

const isRed = (r: number, g: number, b: number) => r > 150 && g < 90 && b < 90;
const isBlue = (r: number, g: number, b: number) => b > 150 && r < 110;
const isLime = (r: number, g: number, b: number) => g > 180 && b < 130 && r > 100;

/** 一段「夠長的亮段」至少這麼長（像素）。條寬 167×縮放，最小支援 0.9 倍＝150；不用畫面寬的比例算，4K 畫面上原尺寸的條只佔 4% */
const MIN_RUN = 60;
/** 一列的紅＋藍＋黃綠少於這個數就不用試 */
const MIN_COLORED = 20;

type Run = [number, number];

/**
 * 找 HP、MP、EXP 三條。畫面下面兩成，每一列數紅（HP）藍（MP）黃綠（EXP）的點，從最多的那列開始試，
 * 那一列找得到「三條」就是它，找不到就換下一列（下面有一大片藍天、紅色場景時，最多的那列不是狀態列）。
 *
 * 「三條」＝那一列裡連續三段夠長的亮段：寬度差不多（最寬不超過最窄 1.35 倍）、彼此靠很近（空隙不到條寬兩成半），
 * 第一段開頭一截有紅（HP 只要還活著就從左邊開始紅），而且第二段開頭有藍或第三段開頭有黃綠（MP、EXP 有一條不是 0）。
 * 2026-10-18 以前是「從最左邊數前三段」：遊戲開 1920×1080 時狀態列不放大、置中，左右是場景，
 * 使用者在天空之城，左邊的亮色磚地被當成 HP、MP，一直認不到。
 *
 * HP、MP 中間只有 1px 的暗縫，縮放後縫會被抹亮過門檻、兩條黏成一段：一段裡左邊有紅、右邊有藍，就在它中央找最暗的那一格切開。
 * 上下緣：從 EXP 條左邊往內 3px 那一欄，往上往下走到黑框為止（barEdge）。scale 用 EXP 條寬 ÷ BASE_EXP_W 算；top、bottom 還是看條高。
 */
export function findStatusBar(frame: Frame): StatusBar | null {
  const { width, height } = frame;
  const rows: Array<[number, number]> = [];
  for (let y = Math.floor(height * 0.8); y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = rgbAt(frame, x, y);
      if (isRed(r, g, b) || isBlue(r, g, b) || isLime(r, g, b)) count++;
    }
    if (count >= MIN_COLORED) rows.push([y, count]);
  }
  rows.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  for (const [row] of rows) {
    const bars = barsOnRow(frame, row);
    if (!bars) continue;
    const [hp, mp, exp] = bars;
    const reach = Math.round(0.13 * (exp[1] - exp[0]));
    const top = barEdge(frame, exp[0] + 3, row, -1, reach);
    const bottom = barEdge(frame, exp[0] + 3, row, 1, reach);
    if (bottom - top < 6) continue;
    return { hp, mp, exp, top, bottom, scale: (exp[1] - exp[0]) / BASE_EXP_W };
  }
  return null;
}

/**
 * 條的上緣（step -1）或下緣（step 1，右不含）：從 row（條裡面）沿著 x 那一欄往外走，
 * 停在第一個「比條裡暗一半以上、而且再往外就變亮」的那一列（黑框；原尺寸是 4～7，畫面被縮放、壓縮過會糊成 50～70）。
 * 最多走 reach 列（條高大約是條寬的一成，最多色的那列在條裡面，往外走 0.13 倍條寬一定走得到框）；
 * 都沒有就用這段裡最暗的那一列。不能只認「暗於 40」：框糊掉時會跳過它、停在更外面那行字的縫，條高量成一倍多。
 */
function barEdge(frame: Frame, x: number, row: number, step: 1 | -1, reach: number): number {
  const value = (y: number) => (y < 0 || y >= frame.height ? -1 : Math.max(...rgbAt(frame, x, y)));
  const dark = Math.max(40, 0.5 * value(row));
  let darkest = row;
  let darkestValue = Infinity;
  for (let k = 1; k <= reach; k++) {
    const y = row + step * k;
    const v = value(y);
    if (v < 0) break;
    const outside = value(y + step);
    if (v < dark && (outside < 0 || outside >= v)) return step < 0 ? y + 1 : y;
    if (v < darkestValue) {
      darkestValue = v;
      darkest = y;
    }
  }
  return step < 0 ? darkest + 1 : darkest;
}

/** 一段裡某種顏色的點有幾個（只看 [from, to)） */
function countColor(frame: Frame, row: number, from: number, to: number, test: (r: number, g: number, b: number) => boolean): number {
  let count = 0;
  for (let x = from; x < to; x++) if (test(...rgbAt(frame, x, row))) count++;
  return count;
}

/** 一列裡的 HP、MP、EXP 三段；找不到回 null */
function barsOnRow(frame: Frame, row: number): [Run, Run, Run] | null {
  const runs: Run[] = [];
  let start = -1;
  for (let x = 0; x <= frame.width; x++) {
    const bright = x < frame.width && Math.max(...rgbAt(frame, x, row)) >= 100;
    if (bright && start < 0) start = x;
    if (!bright && start >= 0) {
      if (x - start >= MIN_RUN) runs.push(...splitHpMp(frame, row, [start, x]));
      start = -1;
    }
  }
  const head = (run: Run) => run[0] + Math.max(3, Math.round((run[1] - run[0]) * 0.15));
  for (let i = 0; i + 2 < runs.length; i++) {
    const trio: [Run, Run, Run] = [runs[i], runs[i + 1], runs[i + 2]];
    const widths = trio.map(([a, b]) => b - a);
    const shortest = Math.min(...widths);
    if (Math.max(...widths) > shortest * 1.35) continue;
    if (trio[1][0] - trio[0][1] > 0.25 * shortest || trio[2][0] - trio[1][1] > 0.25 * shortest) continue;
    const [hp, mp, exp] = trio;
    if (countColor(frame, row, hp[0], head(hp), isRed) < 2) continue;
    if (countColor(frame, row, mp[0], head(mp), isBlue) < 2 && countColor(frame, row, exp[0], head(exp), isLime) < 2) continue;
    return trio;
  }
  return null;
}

/** 左半有紅、右半有藍的一段＝HP、MP 黏在一起：在中間 35%～65% 找最暗的那一格切開；不是就原樣回傳 */
function splitHpMp(frame: Frame, row: number, [a, b]: Run): Run[] {
  const middle = Math.round((a + b) / 2);
  if (countColor(frame, row, a, middle, isRed) < 2 || countColor(frame, row, middle, b, isBlue) < 2) return [[a, b]];
  const lo = Math.floor(a + (b - a) * 0.35);
  const hi = Math.ceil(a + (b - a) * 0.65);
  let seam = lo;
  let dimmest = Infinity;
  for (let x = lo; x < hi; x++) {
    const v = Math.max(...rgbAt(frame, x, row));
    if (v < dimmest) {
      dimmest = v;
      seam = x;
    }
  }
  return [
    [a, seam],
    [seam + 1, b],
  ];
}
