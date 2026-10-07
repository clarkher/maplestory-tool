/**
 * 全站開了平滑捲動（globals.css），瀏覽器還原捲動位置時也會跟著滑：按上一頁／下一頁、重新整理，
 * 長頁面要從頂端一路滑一秒多才回到原位。還原的那一下要直接跳；使用者自己操作之後，頁內的平滑捲動照舊。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { jumpWhenRestoring, restoreScrollBootstrap } from "@/lib/history-scroll";

/** <html> 的替身：記 inline 的 scroll-behavior，跟被逼著馬上套用樣式幾次 */
function fakeRoot(scrollBehavior = "") {
  const root = {
    style: { scrollBehavior },
    forced: 0,
    getClientRects() {
      root.forced += 1;
      return [];
    },
  };
  return root;
}

/** 在假的 performance／document 上跑 <head> 那段程式，回傳跑完 <html> 的 inline scroll-behavior */
function runBootstrap(performance: unknown) {
  const root = { style: { scrollBehavior: "" } };
  new Function("performance", "document", restoreScrollBootstrap)(performance, { documentElement: root });
  return root.style.scrollBehavior;
}
const navigationOf = (type: string) => ({
  getEntriesByType: (kind: string) => (kind === "navigation" ? [{ type }] : []),
});

describe("按上一頁／下一頁：還原位置直接跳", () => {
  it("按下去的那一下關掉平滑捲動，而且馬上套用（瀏覽器緊接著就還原位置）", () => {
    const target = new EventTarget();
    const root = fakeRoot();
    jumpWhenRestoring(target, root);
    target.dispatchEvent(new Event("popstate"));
    expect(root.style.scrollBehavior).toBe("auto");
    expect(root.forced).toBe(1);
  });

  it("之後使用者自己點、按鍵、讀螢幕軟體按連結：恢復平滑捲動，頁內捲動照舊", () => {
    for (const type of ["pointerdown", "keydown", "click"]) {
      const target = new EventTarget();
      const root = fakeRoot();
      jumpWhenRestoring(target, root);
      target.dispatchEvent(new Event("popstate"));
      target.dispatchEvent(new Event(type));
      expect(root.style.scrollBehavior, type).toBe("");
    }
  });

  it("沒按上一頁時，平常的點擊不去動它（Next 換頁捲回頂端時會自己暫時改）", () => {
    const target = new EventTarget();
    const root = fakeRoot("auto");
    jumpWhenRestoring(target, root);
    target.dispatchEvent(new Event("pointerdown"));
    expect(root.style.scrollBehavior).toBe("auto");
  });
});

describe("重新整理、整頁重載的返回：一載入瀏覽器就在還原位置", () => {
  it("<head> 那段程式：重新整理、按返回整頁重載時，畫面出來前先關掉平滑捲動", () => {
    expect(runBootstrap(navigationOf("reload"))).toBe("auto");
    expect(runBootstrap(navigationOf("back_forward"))).toBe("auto");
  });

  it("<head> 那段程式：一般點連結、打網址進來不動", () => {
    expect(runBootstrap(navigationOf("navigate"))).toBe("");
    expect(runBootstrap({ getEntriesByType: () => [] })).toBe("");
  });

  it("<head> 那段程式：瀏覽器太舊沒有 getEntriesByType，不出錯、不動", () => {
    expect(runBootstrap({})).toBe("");
    expect(runBootstrap(undefined)).toBe("");
  });

  it("一開始就算在還原：保持直接跳，使用者第一次自己操作才恢復平滑", () => {
    const target = new EventTarget();
    const root = fakeRoot("auto");
    jumpWhenRestoring(target, root, { restoring: true });
    expect(root.style.scrollBehavior).toBe("auto");
    target.dispatchEvent(new Event("keydown"));
    expect(root.style.scrollBehavior).toBe("");
  });
});

describe("全站元件 HistoryScrollJump", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function load(scrollBehavior: string) {
    const win = new EventTarget();
    const root = fakeRoot(scrollBehavior);
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", { documentElement: root });
    vi.resetModules();
    await import("@/components/HistoryScrollJump");
    return { win, root };
  }

  it("一載入就裝好：不用等畫面出來，按上一頁就直接跳", async () => {
    const { win, root } = await load("");
    win.dispatchEvent(new Event("popstate"));
    expect(root.style.scrollBehavior).toBe("auto");
    win.dispatchEvent(new Event("pointerdown"));
    expect(root.style.scrollBehavior).toBe("");
  });

  it("重新整理進來（<head> 已經關掉平滑）：使用者第一次自己操作就恢復", async () => {
    const { win, root } = await load("auto");
    win.dispatchEvent(new Event("click"));
    expect(root.style.scrollBehavior).toBe("");
  });

  it("一般進來不算在還原：之後 Next 換頁暫時改成 auto，點擊不去動它", async () => {
    const { win, root } = await load("");
    root.style.scrollBehavior = "auto";
    win.dispatchEvent(new Event("pointerdown"));
    expect(root.style.scrollBehavior).toBe("auto");
  });
});
