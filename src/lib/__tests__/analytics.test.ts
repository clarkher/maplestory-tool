import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GA_ID, gaEnabledFor, jobParams, track, trackSettled } from "../analytics";

type Win = { gtag?: (...args: unknown[]) => void };

describe("GA 事件（v1.32）", () => {
  let calls: unknown[][];
  beforeEach(() => {
    calls = [];
    (globalThis as unknown as { window: Win }).window = { gtag: (...args: unknown[]) => calls.push(args) };
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as unknown as { window?: Win }).window;
  });

  it("追蹤 ID 是楓谷幫手的 GA4 資源", () => {
    expect(GA_ID).toBe("G-B0T3VGC7F2");
  });

  it("只有正式網域送 GA；測試機、分支預覽、本機要帶 ?ga_debug=1 才送", () => {
    expect(gaEnabledFor("maplehelper.tw", "")).toBe(true);
    expect(gaEnabledFor("maplestory-tool-git-dev-clarkhers-projects.vercel.app", "")).toBe(false);
    expect(gaEnabledFor("localhost", "")).toBe(false);
    expect(gaEnabledFor("localhost", "?ga_debug=1")).toBe(true);
  });

  it("track 直接送事件", () => {
    track("db_open", { db: "monsters", id: "100100" });
    expect(calls).toEqual([["event", "db_open", { db: "monsters", id: "100100" }]]);
  });

  it("沒載 gtag 時不報錯", () => {
    (globalThis as unknown as { window: Win }).window = {};
    expect(() => track("share", { page: "boss" })).not.toThrow();
  });

  it("trackSettled：同一個 key 一直變只送停下來的最後一次", () => {
    trackSettled("search", "db_search", { query: "嫩" });
    trackSettled("search", "db_search", { query: "嫩寶" });
    vi.advanceTimersByTime(500);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(1500);
    expect(calls).toEqual([["event", "db_search", { query: "嫩寶" }]]);
  });

  it("trackSettled：結果跟上次送的一樣就不重送", () => {
    trackSettled("calc", "calc_result", { tool: "damage", job: 110 });
    vi.advanceTimersByTime(2000);
    trackSettled("calc", "calc_result", { tool: "damage", job: 110 });
    vi.advanceTimersByTime(2000);
    expect(calls).toHaveLength(1);
  });

  it("職業帶名字、等級帶 10 等一段的區間", () => {
    expect(jobParams(110, 35)).toEqual({ job: "狂戰士", level: 35, level_band: "31-40" });
    expect(jobParams(0, 10)).toEqual({ job: "初心者", level: 10, level_band: "1-10" });
    expect(jobParams(-1, 1)).toMatchObject({ job: "未選" });
  });
});
