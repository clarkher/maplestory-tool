import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootGa, GA_ID, gaEnabledFor, gaOptOut, gaPageLocation, jobParams, linkClick, track, trackSettled } from "../analytics";

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

describe("GA 網址不帶 #（v2.44：名字變怪物的分享連結把結果放在 #r=，不能送進 GA）", () => {
  type Loc = { origin: string; pathname: string; search: string; hash: string; hostname: string };
  function fakeWindow(href: string) {
    const u = new URL(href);
    const loc: Loc = { origin: u.origin, pathname: u.pathname, search: u.search, hash: u.hash, hostname: u.hostname };
    const listeners: Record<string, (() => void)[]> = {};
    const calls: unknown[][] = [];
    const go = (url: string) => {
      const n = new URL(url, loc.origin + loc.pathname);
      Object.assign(loc, { pathname: n.pathname, search: n.search, hash: n.hash });
    };
    const w = {
      location: loc,
      history: {
        pushState: (_s: unknown, _t: string, url?: string | URL | null) => url != null && go(String(url)),
        replaceState: (_s: unknown, _t: string, url?: string | URL | null) => url != null && go(String(url)),
      },
      addEventListener: (type: string, fn: () => void) => (listeners[type] ??= []).push(fn),
      removeEventListener: (type: string, fn: () => void) => (listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn)),
      gtag: (...args: unknown[]) => calls.push(args),
    };
    return { w, calls, go, fire: (type: string) => (listeners[type] ?? []).forEach((f) => f()) };
  }
  const sentLocations = (calls: unknown[][]) =>
    calls.flatMap((c) => (c[0] === "set" || c[0] === "config" ? [(c[c.length - 1] as { page_location?: string }).page_location] : [])).filter(Boolean);

  it("gaPageLocation 只留網域＋路徑＋查詢字串", () => {
    expect(gaPageLocation({ origin: "https://maplehelper.tw", pathname: "/plan/rename/m/123", search: "?a=1" })).toBe("https://maplehelper.tw/plan/rename/m/123?a=1");
  });
  it("開頁送出的 page_location 沒有 #", () => {
    const { w, calls } = fakeWindow("https://maplehelper.tw/plan/rename/m/123#r=abc");
    bootGa(w);
    const sent = sentLocations(calls);
    expect(sent.length).toBeGreaterThan(0);
    for (const s of sent) expect(s).toBe("https://maplehelper.tw/plan/rename/m/123");
    expect(calls.some((c) => c[0] === "config" && c[1] === GA_ID)).toBe(true);
  });
  it("站內換頁（pushState、replaceState、上一頁、改 #）也跟著換、一樣不帶 #", () => {
    const { w, calls, go, fire } = fakeWindow("https://maplehelper.tw/");
    const stop = bootGa(w);
    w.history.pushState(null, "", "/plan/rename/m/9#r=xyz");
    w.history.replaceState(null, "", "/plan/rename?x=1#r=q");
    go("/db#frag");
    fire("popstate");
    go("/db#other");
    fire("hashchange");
    const sent = sentLocations(calls);
    expect(sent).toContain("https://maplehelper.tw/plan/rename/m/9");
    expect(sent).toContain("https://maplehelper.tw/plan/rename?x=1");
    expect(sent).toContain("https://maplehelper.tw/db");
    for (const s of sent) expect(s).not.toContain("#");
    stop();
  });
  it("正式網域不開 debug_mode，其他網域開", () => {
    const a = fakeWindow("https://maplehelper.tw/x#y");
    bootGa(a.w);
    expect(a.calls.find((c) => c[0] === "config")?.[2]).not.toHaveProperty("debug_mode");
    const b = fakeWindow("https://dev.example.com/x?ga_debug=1#y");
    bootGa(b.w);
    expect(b.calls.find((c) => c[0] === "config")?.[2]).toMatchObject({ debug_mode: true, page_location: "https://dev.example.com/x?ga_debug=1" });
  });
});
