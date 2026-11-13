import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GA_ID, gaEnabledFor, gaOptOut, jobParams, linkClick, track, trackSettled } from "../analytics";

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

describe("自己人不算流量、單獨頁點去工具（v2.08）", () => {
  it("網址帶過一次 ?ga_off=1 的瀏覽器一直不送；?ga_off=0 解除", () => {
    expect(gaOptOut("", null)).toBe(false);
    expect(gaOptOut("?ga_off=1", null)).toBe(true);
    expect(gaOptOut("", "1")).toBe(true);
    expect(gaOptOut("?ga_off=0", "1")).toBe(false);
  });
  it("單獨頁底下那顆工具按鈕：記從哪一類頁、點去哪、按鈕字", () => {
    expect(linkClick("tool", "/db/monsters/100100", "/go?to=104040000", "一鍵帶路到刷怪點")).toEqual({
      name: "tool_click",
      params: { from: "db/monsters", page: "/db/monsters/100100", to: "/go", label: "一鍵帶路到刷怪點" },
    });
    expect(linkClick("tool", "/jobs/410", "/", "填等級，看我現在去哪練")?.params).toMatchObject({ from: "jobs", to: "/" });
  });
  it("查資料卡片底下連到單獨頁那行", () => {
    expect(linkClick("detail_page", "/db/monsters", "/db/monsters/100100", "看完整刷怪點與相關任務")).toEqual({
      name: "detail_page_click",
      params: { from: "db/monsters", page: "/db/monsters", to: "/db/monsters/100100", label: "看完整刷怪點與相關任務" },
    });
  });
  it("贊助連結（v2.22）：記在哪點的，method=page；位置不認得不送", () => {
    expect(linkClick("donate", "/guides/hunter-31-50", "/support", "贊助", "guide_end")).toEqual({
      name: "donate_click",
      params: { placement: "guide_end", method: "page" },
    });
    expect(linkClick("donate", "/", "/support", "贊助楓谷幫手", "footer")?.params).toEqual({ placement: "footer", method: "page" });
    expect(linkClick("donate", "/", "/support", "x", "home")).toBeNull();
    expect(linkClick("donate", "/", "/support", "x")).toBeNull();
  });
  it("沒標的連結不送", () => {
    expect(linkClick(undefined, "/", "/db", "x")).toBeNull();
    expect(linkClick("other", "/", "/db", "x")).toBeNull();
  });
});
