import { describe, expect, it } from "vitest";
import { initialCtx, next, RUNNING_LINES, SIGN_LINES, type Ctx } from "@/lib/rename/flow";
import { EMPTY_LINES, introLines, resultLines } from "@/lib/rename/lines";
import type { Result } from "@/lib/rename/match";

const monster: Result = { kind: "monster", id: 210100, n: "綠水靈", kept: [0, 2], score: 81, xf: { sx: 1, sy: 1, dx: 0, dy: 0 } };
const poop: Result = { kind: "poop", score: 30 };

describe("flow.next", () => {
  it("開場：intro、拒絕 0 次、開場台詞", () => {
    const c = initialCtx();
    expect(c.declines).toBe(0);
    expect(c.lines).toEqual(introLines(0));
    expect(c.result).toBeNull();
  });

  it("intro + accept → sign", () => {
    const r = next("intro", { type: "accept" }, initialCtx());
    expect(r.step).toBe("sign");
    expect(r.ctx.lines).toEqual(SIGN_LINES);
  });

  it("intro + decline → intro 且 declines+1，台詞換句話（鬼打牆）", () => {
    let s = next("intro", { type: "decline" }, initialCtx());
    expect(s.step).toBe("intro");
    expect(s.ctx.declines).toBe(1);
    expect(s.ctx.lines).toEqual(introLines(1));
    s = next(s.step, { type: "decline" }, s.ctx);
    expect(s.ctx.declines).toBe(2);
    expect(s.ctx.lines).toEqual(introLines(2));
  });

  it("sign + submit 空筆畫 → 留在 sign、顯示 EMPTY_LINES", () => {
    const sign = next("intro", { type: "accept" }, initialCtx());
    const r = next(sign.step, { type: "submit", segs: 0 }, sign.ctx);
    expect(r.step).toBe("sign");
    expect(r.ctx.lines).toEqual(EMPTY_LINES);
  });

  it("sign + submit → running", () => {
    const sign = next("intro", { type: "accept" }, initialCtx());
    const r = next(sign.step, { type: "submit", segs: 5 }, sign.ctx);
    expect(r.step).toBe("running");
    expect(r.ctx.lines).toEqual(RUNNING_LINES);
  });

  it("running + done → result，台詞＝resultLines、記住結果、回第 1 頁", () => {
    const ctx: Ctx = { ...initialCtx(), lines: RUNNING_LINES, page: 1 };
    const r = next("running", { type: "done", result: monster }, ctx);
    expect(r.step).toBe("result");
    expect(r.ctx.result).toBe(monster);
    expect(r.ctx.lines).toEqual(resultLines(monster));
    expect(r.ctx.page).toBe(0);
    const p = next("running", { type: "done", result: poop }, ctx);
    expect(p.step).toBe("result");
    expect(p.ctx.lines).toEqual(resultLines(poop));
  });

  it("running + done 但比對說是空的 → 回 sign、顯示 EMPTY_LINES", () => {
    const r = next("running", { type: "done", result: { kind: "empty" } }, initialCtx());
    expect(r.step).toBe("sign");
    expect(r.ctx.lines).toEqual(EMPTY_LINES);
    expect(r.ctx.result).toBeNull();
  });

  it("result + again → sign，清掉結果", () => {
    const res = next("running", { type: "done", result: monster }, initialCtx());
    const r = next(res.step, { type: "again" }, res.ctx);
    expect(r.step).toBe("sign");
    expect(r.ctx.result).toBeNull();
    expect(r.ctx.lines).toEqual(SIGN_LINES);
  });

  it("result + page → 翻到第 2 頁", () => {
    const res = next("running", { type: "done", result: monster }, initialCtx());
    const r = next(res.step, { type: "page" }, res.ctx);
    expect(r.step).toBe("result");
    expect(r.ctx.page).toBe(1);
  });

  it("不合這一步的動作不改狀態", () => {
    const c = initialCtx();
    expect(next("intro", { type: "submit", segs: 3 }, c)).toEqual({ step: "intro", ctx: c });
    expect(next("running", { type: "accept" }, c)).toEqual({ step: "running", ctx: c });
    expect(next("sign", { type: "again" }, c)).toEqual({ step: "sign", ctx: c });
  });
});
