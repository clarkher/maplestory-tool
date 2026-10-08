/**
 * 首頁的推算記在這次瀏覽裡：離開首頁再回來（元件重新掛上、useMemo 全部清空），資料跟角色沒變就直接拿上次算好的。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type MemoModule = typeof import("@/lib/session-memo");

let memo: MemoModule;
beforeEach(async () => {
  // 每個測試一份全新的模組，記住的結果不會互相影響
  vi.resetModules();
  memo = await import("@/lib/session-memo");
});

describe("記在這次瀏覽裡的推算", () => {
  it("資料跟角色都沒變：直接拿上次的結果，不重算", () => {
    const quests = [{ id: 1000 }];
    const compute = vi.fn(() => ({ pick: "遺跡之墓Ⅰ" }));
    const first = memo.sessionMemo("home:plan", [quests, 45, 110], compute);
    const again = memo.sessionMemo("home:plan", [quests, 45, 110], compute);
    expect(again).toBe(first);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("等級換了：重算", () => {
    const quests = [{ id: 1000 }];
    const compute = vi.fn((level: number) => ({ level }));
    memo.sessionMemo("home:plan", [quests, 45, 110], () => compute(45));
    const next = memo.sessionMemo("home:plan", [quests, 46, 110], () => compute(46));
    expect(next).toEqual({ level: 46 });
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("資料換了一份（內容一樣也算）：重算，不會拿舊資料算的結果", () => {
    const compute = vi.fn(() => ({}));
    memo.sessionMemo("home:effective", [[{ id: 1000 }]], compute);
    memo.sessionMemo("home:effective", [[{ id: 1000 }]], compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("不同的推算各記各的，不會互相蓋掉", () => {
    const quests = [{ id: 1000 }];
    const effective = memo.sessionMemo("home:effective", [quests], () => new Map([["1000", 12]]));
    memo.sessionMemo("home:plan", [quests, 45, 110], () => ({ pick: "遺跡之墓Ⅰ" }));
    expect(memo.sessionMemo("home:effective", [quests], () => new Map())).toBe(effective);
  });

  it("連續換來換去（45 → 46 → 46 → 45）：記住的是最新那一組，回到 45 會重算出 45 的結果，不會拿到 46 的", () => {
    const quests = [{ id: 1000 }];
    const compute = vi.fn((level: number) => ({ level }));
    const plan = (level: number) => memo.sessionMemo("home:plan", [quests, level, 110], () => compute(level));
    plan(45);
    const at46 = plan(46);
    expect(plan(46)).toBe(at46);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(plan(45)).toEqual({ level: 45 });
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it("依賴的個數不一樣：當作變了，重算", () => {
    const compute = vi.fn(() => ({}));
    memo.sessionMemo("home:plan", [1, 2], compute);
    memo.sessionMemo("home:plan", [1, 2, 3], compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
