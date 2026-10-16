// src/lib/speed/read-job.ts
import { inkMask } from "./ink";
import { rankText, type SpeedNames } from "./names";
import type { Frame, Rect } from "./frame";
import { BASE_BAR_H, type StatusBar } from "./status-bar";

/**
 * 狀態列左下的職業名（客戶端字串表 json_a2909… 裡的寫法，2026-10-13 抽過）→ 站上的職業代碼。
 * 狀態列寫「巫師(冰、雷)」，另一份清單寫「巫師(冰/雷)」，兩種都放。
 */
export const JOB_TEXT: Array<[number, string[]]> = [
  [0, ["初心者"]],
  [100, ["劍士"]], [110, ["狂戰士"]], [111, ["十字軍"]], [120, ["見習騎士"]], [121, ["騎士"]], [130, ["槍騎兵"]], [131, ["龍騎士"]],
  [200, ["法師"]], [210, ["巫師(火、毒)", "巫師(火/毒)"]], [211, ["魔導士(火、毒)", "魔導士(火/毒)"]],
  [220, ["巫師(冰、雷)", "巫師(冰/雷)"]], [221, ["魔導士(冰、雷)", "魔導士(冰/雷)"]], [230, ["僧侶"]], [231, ["祭司"]],
  [300, ["弓箭手"]], [310, ["獵人"]], [311, ["遊俠"]], [320, ["弩弓手"]], [321, ["狙擊手"]],
  [400, ["盜賊"]], [410, ["刺客"]], [411, ["暗殺者"]], [420, ["俠盜"]], [421, ["神偷"]],
  [500, ["海盜"]], [510, ["打手"]], [511, ["格鬥家"]], [520, ["槍手"]], [521, ["神槍手"]],
];

const JOB_OF = new Map(JOB_TEXT.flatMap(([id, texts]) => texts.map(text => [text, id] as const)));

/**
 * 職業那一行：基準截圖在 HP 條左邊 355～256px，字佔 y 767～778（EXP 條上緣 778）。
 * 上面 y 761 是 UI 的白線、下面 y 781 起是角色名，所以框在兩者中間：上緣往上 13.5px、下緣往下 2.5px（都乘 scale）。
 * 下緣一定要超過條的上緣：括號的尾巴垂到上緣下面一點，切在上緣會把字切掉一截，
 * 跟樣板的高度對不上（差 0.03 以上，最像跟第二像分不開）。
 * 單位用 scale × 基準條高（18），不用 bottom - top：條高的邊在非 1 倍時會暈開、偏大 11～17%，scale 才準。
 */
export function jobRect(bar: StatusBar): Rect {
  const unit = bar.scale * BASE_BAR_H;
  const above = 0.75 * unit;
  return { x: bar.hp[0] - 20.3 * unit, y: bar.top - above, w: 6.1 * unit, h: above + 2.5 * bar.scale };
}

/** 最像的比第二像的（不同職業）差夠多才認，不然回 null（頁面改用「我的路線」選的職業） */
export function readJob(frame: Frame, bar: StatusBar, names: SpeedNames): number | null {
  const mask = inkMask(frame, jobRect(bar), false, 0.99);
  if (!mask) return null;
  const ranked = rankText(mask, names.jobs, names.gh);
  const best = ranked[0];
  if (!best || best.d > 0.08) return null;
  const id = JOB_OF.get(best.text)!;
  const runnerUp = ranked.find(row => JOB_OF.get(row.text) !== id);
  return !runnerUp || runnerUp.d - best.d >= 0.008 ? id : null;
}
