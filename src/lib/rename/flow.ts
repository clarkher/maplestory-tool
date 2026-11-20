/**
 * 名字變怪物：畫面狀態機（純函式，方便測）。
 * intro（NPC 問要不要登錄，拒絕＝鬼打牆）→ sign（登記書簽名）→ running（Worker 比對＋演出）→ result（結果，可翻第 2 頁）。
 * 空的登記書按簽好了、或比對說一筆都沒有，都留在 sign 並讓 NPC 說 EMPTY_LINES。
 */
import { EMPTY_LINES, introLines, resultLines, type Seg } from "./lines";
import type { Result } from "./match";

export type Step = "intro" | "sign" | "running" | "result";

export type Action =
  | { type: "accept" }
  | { type: "decline" }
  /** segs＝切段後有幾段（0 就是空的） */
  | { type: "submit"; segs: number }
  | { type: "done"; result: Result }
  | { type: "again" }
  /** 結果對話框按［下頁］ */
  | { type: "page" };

export type Ctx = {
  declines: number;
  lines: Seg[][];
  result: Result | null;
  /** 結果對話框第幾頁（0 起） */
  page: number;
};

/** 簽名時 NPC 說的 */
export const SIGN_LINES: Seg[][] = [
  [{ t: "在下面的" }, { t: "登記書", c: "blue" }, { t: "簽上你的 " }, { t: "ID", c: "blue" }, { t: "。" }],
  [{ t: "簽好了按「簽好了」。" }],
];

/** 比對＋收筆畫演出時 NPC 說的 */
export const RUNNING_LINES: Seg[][] = [[{ t: "嗯……" }], [{ t: "多的筆畫我先" }, { t: "收著", c: "red" }, { t: "。" }]];

/** 結果第 2 頁 */
export const RESULT_PAGE2_LINES: Seg[][] = [
  [{ t: "像度是遊戲分數，不是真的準確度。" }],
  [{ t: "想換一隻，就按「再寫一次」。" }],
];

export function initialCtx(): Ctx {
  return { declines: 0, lines: introLines(0), result: null, page: 0 };
}

export function next(step: Step, action: Action, ctx: Ctx): { step: Step; ctx: Ctx } {
  const stay = { step, ctx };
  switch (step) {
    case "intro":
      if (action.type === "accept") return { step: "sign", ctx: { ...ctx, lines: SIGN_LINES } };
      if (action.type === "decline") {
        const declines = ctx.declines + 1;
        return { step: "intro", ctx: { ...ctx, declines, lines: introLines(declines) } };
      }
      return stay;
    case "sign":
      if (action.type === "submit") {
        if (action.segs <= 0) return { step: "sign", ctx: { ...ctx, lines: EMPTY_LINES } };
        return { step: "running", ctx: { ...ctx, lines: RUNNING_LINES, result: null } };
      }
      return stay;
    case "running":
      if (action.type === "done") {
        if (action.result.kind === "empty") return { step: "sign", ctx: { ...ctx, lines: EMPTY_LINES, result: null } };
        return { step: "result", ctx: { ...ctx, lines: resultLines(action.result), result: action.result, page: 0 } };
      }
      return stay;
    case "result":
      if (action.type === "again") return { step: "sign", ctx: { ...ctx, lines: SIGN_LINES, result: null, page: 0 } };
      if (action.type === "page") return { step: "result", ctx: { ...ctx, page: ctx.page + 1 } };
      return stay;
  }
}
