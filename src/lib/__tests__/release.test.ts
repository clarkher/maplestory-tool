import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { V002_OPEN_DATE, V002_OPEN_TIME, beforeV002, onV002Open, opensOn, useBeforeV002 } from "@/lib/release";

/** 官方開機時刻：10/15 台灣時間 14:00（例行維護結束；官方公告還沒出來前先用這個） */
const OPEN = Date.parse("2026-10-15T14:00:00+08:00");
const BEFORE = OPEN - 60 * 1000;
const AFTER = OPEN;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 跟查資料頁、首頁一樣，用 useBeforeV002() 決定要不要畫「10/15 開放」 */
function Label() {
  return createElement("span", null, useBeforeV002() ? "10/15 開放" : "已開放");
}

describe("opensOn：某個開放日，現在算不算還沒到那天的開機時刻", () => {
  it("還沒到那天開機：還沒開放", () => {
    expect(opensOn(V002_OPEN_DATE, BEFORE)).toBe(true);
  });

  it("到了那天開機時刻：已經開放（不再標）", () => {
    expect(opensOn(V002_OPEN_DATE, AFTER)).toBe(false);
  });

  it("沒有開放日：不是這次新開放的內容，不算「還沒開放」", () => {
    expect(opensOn(undefined, BEFORE)).toBe(false);
  });
});

describe("beforeV002：V002 新內容（三轉、Lv.120、天空之城／冰原雪域／廢礦區）現在算不算還沒開放", () => {
  it("開放日還是 2026-10-15，當天官方開機時刻先用 14:00（例行維護結束）", () => {
    expect(V002_OPEN_DATE).toBe("2026-10-15");
    expect(V002_OPEN_TIME).toBe("14:00");
  });

  it("10/15 00:00 過了還沒開放：凌晨遊戲還是舊版、早上 8 點起維護，維護完開機才真的能玩", () => {
    expect(beforeV002(Date.parse("2026-10-15T00:00:00+08:00"))).toBe(true);
    expect(beforeV002(Date.parse("2026-10-15T08:00:00+08:00"))).toBe(true);
  });

  it("開機前一毫秒還在，14:00 整就收：畫面上的「10/15 開放」標示自動消失", () => {
    expect(beforeV002(OPEN - 1)).toBe(true);
    expect(beforeV002(OPEN)).toBe(false);
  });
});

describe("useBeforeV002 的伺服器畫面：建置靜態頁跟瀏覽器 hydration 用同一個值，兩邊才對得上", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("開機前建置（10/15 早上維護中也算）：靜態頁先畫好標示；就算打開時已經開機也照建置時畫（hydration 完再收掉）", () => {
    vi.stubEnv("MAPLEBOOK_BUILD_TIME", String(Date.parse("2026-10-15T10:00:00+08:00")));
    vi.useFakeTimers({ now: AFTER });
    expect(renderToString(createElement(Label))).toBe("<span>10/15 開放</span>");
  });

  it("開機後建置：靜態頁不畫標示，就算使用者手機時間還停在開機前", () => {
    vi.stubEnv("MAPLEBOOK_BUILD_TIME", String(AFTER));
    vi.useFakeTimers({ now: BEFORE });
    expect(renderToString(createElement(Label))).toBe("<span>已開放</span>");
  });

  it("沒有建置時間（沒經過 next 建置）：一律當作已開放，不拿現在時間算（伺服器和瀏覽器的現在時間對不上）", () => {
    vi.stubEnv("MAPLEBOOK_BUILD_TIME", undefined);
    vi.useFakeTimers({ now: BEFORE });
    expect(renderToString(createElement(Label))).toBe("<span>已開放</span>");
  });
});

describe("onV002Open：頁面開著跨過開機時刻，所有「10/15 開放」同一刻收掉，不用重新整理", () => {
  const offs: Array<() => void> = [];
  const watch = (listener: () => void) => offs.push(onV002Open(listener));
  afterEach(() => {
    for (const off of offs.splice(0)) off();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("剛好在 10/15 開機時刻（14:00）通知，早一毫秒都不會", () => {
    vi.useFakeTimers({ now: BEFORE });
    const listener = vi.fn();
    watch(listener);
    vi.advanceTimersByTime(59_999);
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("10/15 凌晨就開著的頁面：跨過 00:00 不收，一路等到開機才通知", () => {
    vi.useFakeTimers({ now: Date.parse("2026-10-14T23:59:00+08:00") });
    const notifiedAt: number[] = [];
    watch(() => notifiedAt.push(Date.now()));
    vi.advanceTimersByTime(2 * MINUTE);
    expect(notifiedAt).toEqual([]);
    for (let step = 0; step < 1_000 && notifiedAt.length === 0; step++) vi.advanceTimersToNextTimer();
    expect(notifiedAt).toEqual([OPEN]);
  });

  it("清單、細節卡好幾個地方同時在等：在 React 重畫前全部通知到，標示同一格一起消失", async () => {
    vi.useFakeTimers({ now: BEFORE });
    const notified: string[] = [];
    let allNotifiedBeforeRender = false;
    watch(() => {
      notified.push("清單");
      // React 收到通知後，是排在 microtask 才重畫；那時其他地方也要已經收到通知，才會一起畫
      void Promise.resolve().then(() => (allNotifiedBeforeRender = notified.length === 2));
    });
    watch(() => notified.push("細節卡"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(notified).toEqual(["清單", "細節卡"]);
    expect(allNotifiedBeforeRender).toBe(true);
  });

  it("先換頁離開的畫面不再通知；還留在畫面上的照樣通知", () => {
    vi.useFakeTimers({ now: BEFORE });
    const stays = vi.fn();
    const leaves = vi.fn();
    watch(stays);
    const leave = onV002Open(leaves);
    leave();
    vi.advanceTimersByTime(60_000);
    expect(leaves).not.toHaveBeenCalled();
    expect(stays).toHaveBeenCalledTimes(1);
  });

  it("離開機還超過 24.8 天（setTimeout 一次最多等這麼久，超過會立刻觸發）：一路等到開機才通知", () => {
    vi.useFakeTimers({ now: AFTER - 30 * DAY });
    const notifiedAt: number[] = [];
    watch(() => notifiedAt.push(Date.now()));
    // 一次只往前推到下一個計時器、而且有次數上限：計時器要是變成每毫秒空轉，這裡會直接失敗，不會把測試卡死
    for (let step = 0; step < 20_000 && notifiedAt.length === 0; step++) vi.advanceTimersToNextTimer();
    expect(notifiedAt).toEqual([AFTER]);
  });

  it("等開放的時候每 1～5 分鐘醒來對一次時間：不會空轉，也不會一睡好幾天", () => {
    vi.useFakeTimers({ now: AFTER - 30 * DAY });
    watch(vi.fn());
    const before = Date.now();
    vi.advanceTimersToNextTimer();
    const gap = Date.now() - before;
    expect(gap).toBeGreaterThanOrEqual(MINUTE);
    expect(gap).toBeLessThanOrEqual(5 * MINUTE);
  });

  it("電腦睡著跨過開機時刻（計時器停住沒跑）：一切回這個分頁就通知", () => {
    vi.useFakeTimers({ now: BEFORE });
    const page = new EventTarget();
    vi.stubGlobal("document", page);
    const listener = vi.fn();
    watch(listener);
    vi.setSystemTime(AFTER + 6 * HOUR); // 睡到晚上 8 點：時鐘往前跳，計時器一格都沒跑
    expect(listener).not.toHaveBeenCalled();
    page.dispatchEvent(new Event("visibilitychange"));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("開機前闔上筆電、開機後打開，分頁一直在前景（沒有切分頁）：醒來 5 分鐘內收掉", () => {
    vi.useFakeTimers({ now: AFTER - 4 * HOUR });
    const listener = vi.fn();
    watch(listener);
    vi.setSystemTime(AFTER + 9 * HOUR); // 時鐘往前跳 13 小時，睡著時計時器沒走（假時鐘會把還沒到的計時器一起往後移）
    vi.advanceTimersByTime(5 * MINUTE);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("用到標示的畫面全部離開：計時器停掉，之後切分頁也不會再排", () => {
    vi.useFakeTimers({ now: BEFORE });
    const page = new EventTarget();
    vi.stubGlobal("document", page);
    const leave = onV002Open(vi.fn());
    leave();
    expect(vi.getTimerCount()).toBe(0);
    page.dispatchEvent(new Event("visibilitychange"));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("開機之後才打開頁面：沒有要等的，不通知，也不留計時器在背景跑", () => {
    vi.useFakeTimers({ now: AFTER });
    const listener = vi.fn();
    watch(listener);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(30 * DAY);
    expect(listener).not.toHaveBeenCalled();
  });
});
