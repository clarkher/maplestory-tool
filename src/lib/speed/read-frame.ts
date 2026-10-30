// src/lib/speed/read-frame.ts
import type { Frame } from "./frame";
import type { SpeedNames } from "./names";
import { parseExp, readExpText, type ExpReading } from "./read-exp";
import { readJob } from "./read-job";
import { readTitle, type TitleReading } from "./read-map";
import { findStatusBar, type StatusBar } from "./status-bar";

export type ReaderInit = { toNext: number[]; names: SpeedNames };
/** 組隊人數不由畫面讀（玩家自己填），所以這裡沒有 party */
export type FrameReading = { bar: boolean; exp: ExpReading | null; job: number | null; title: TitleReading | null };

/** hints：已經知道的等級（現在這級、下一級），讓 % 很小的時候也認得出等級 */
export function readFrame(frame: Frame, init: ReaderInit, hints: number[]): FrameReading {
  return readFrameWithBar(frame, init, hints).reading;
}

/** 跟 readFrame 一樣，另外把找到的狀態列交出來（讀 HP、快捷鍵的不用再找一次） */
export function readFrameWithBar(frame: Frame, init: ReaderInit, hints: number[]): { reading: FrameReading; bar: StatusBar | null } {
  const bar = findStatusBar(frame);
  if (!bar) return { reading: { bar: false, exp: null, job: null, title: null }, bar: null };
  return {
    reading: {
      bar: true,
      exp: parseExp(readExpText(frame, bar), init.toNext, hints),
      job: readJob(frame, bar, init.names),
      title: readTitle(frame, init.names),
    },
    bar,
  };
}
