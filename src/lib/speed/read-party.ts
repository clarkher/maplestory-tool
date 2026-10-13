import { rgbAt, type Frame } from "./frame";
import type { StatusBar } from "./status-bar";

type Bar = { x0: number; x1: number; y0: number; y1: number };

const isRed = (r: number, g: number, b: number) => r > 170 && g < 80 && b < 80;

/**
 * 隊伍欄在畫面右側：每個隊友一列，名字＋血條。在同一張圖的隊友血條是紅的，不在線（或不在這張圖）的是灰的。
 * 做法：右邊四分之一、狀態列以上，找寬 40～90px（照縮放）、高 3～10px 的紅條；
 * 左緣對齊（差 4px 內）、上下間距 12～30px 的一串才是隊伍欄，人數＝這串有幾條。找不到＝單練（1）。
 * 2026-10-13 截圖：自己那條紅（x 1298–1360、y 570–575），兩個不在線的隊友灰。
 */
export function readParty(frame: Frame, bar: StatusBar): number {
  const s = bar.scale;
  const x0 = Math.floor(frame.width * 0.75);
  const y0 = Math.floor(frame.height * 0.3);
  const y1 = Math.floor(bar.top - 2 * (bar.bottom - bar.top));
  const bars: Bar[] = [];
  for (let y = y0; y < y1; y++) {
    let start = -1;
    for (let x = x0; x <= frame.width; x++) {
      const red = x < frame.width && isRed(...rgbAt(frame, x, y));
      if (red && start < 0) start = x;
      if (!red && start >= 0) {
        if (x - start >= 30 * s) {
          const open = bars.find(item => item.y1 === y && Math.abs(item.x0 - start) <= 3 * s);
          if (open) open.y1 = y + 1;
          else bars.push({ x0: start, x1: x, y0: y, y1: y + 1 });
        }
        start = -1;
      }
    }
  }
  const sized = bars.filter(item => {
    const w = item.x1 - item.x0;
    const h = item.y1 - item.y0;
    return w >= 40 * s && w <= 90 * s && h >= 3 * s && h <= 10 * s;
  });
  let best = 1;
  for (const first of sized) {
    const column = sized.filter(item => Math.abs(item.x0 - first.x0) <= 4 * s).sort((a, b) => a.y0 - b.y0);
    let run = 1;
    for (let i = 1; i < column.length; i++) {
      const gap = column[i].y0 - column[i - 1].y0;
      run = gap >= 12 * s && gap <= 30 * s ? run + 1 : 1;
      best = Math.max(best, run);
    }
  }
  return best;
}
