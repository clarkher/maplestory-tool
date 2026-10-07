/**
 * 重新整理、離站再返回（整頁重載）時，瀏覽器一載入就還原位置；可是首頁、規劃頁、查資料清單的內容要等資料抓完才畫出來，
 * 還原的那一刻頁面很短，位置被截掉（任務頁 8548 → 179）。所以自己記位置，頁面長高、放得下了再直接跳回去。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { installReloadScroll, isFullReload, keepScrollAcrossReloads, reloadRestore, type ScrollEnv } from "@/lib/reload-scroll";

const STORE = "ms-scroll";

/** 一頁的替身：手機 812 高的畫面、記在 sessionStorage 的位置、頁面長高（ResizeObserver）、計時器 */
function fakePage({ key = "entry-quest", height = 991, saved }: { key?: string; height?: number; saved?: Record<string, unknown> } = {}) {
  const events = new EventTarget();
  const store = new Map<string, string>();
  if (saved) store.set(STORE, JSON.stringify(saved));
  const page = {
    key,
    y: 0,
    height,
    viewport: 812,
    hidden: false,
    jumps: [] as number[],
    /** 捲動錨定開著嗎（瀏覽器預設開） */
    anchoring: true,
    onResize: null as null | (() => void),
    timers: [] as Array<() => void>,
  };
  const env: ScrollEnv = {
    events,
    key: () => page.key,
    scrollY: () => page.y,
    maxScroll: () => page.height - page.viewport,
    jump: top => {
      page.jumps.push(top);
      page.y = Math.max(0, Math.min(top, page.height - page.viewport));
    },
    storage: { getItem: name => store.get(name) ?? null, setItem: (name, value) => void store.set(name, value) },
    hidden: () => page.hidden,
    watchResize: onResize => {
      page.onResize = onResize;
      return () => {
        page.onResize = null;
      };
    },
    wait: (_ms, then) => void page.timers.push(then),
    scrollAnchoring: on => {
      page.anchoring = on;
    },
  };
  const fire = (type: string) => events.dispatchEvent(new Event(type));
  return {
    page,
    env,
    fire,
    /** 存在 sessionStorage 裡的位置 */
    saved: () => JSON.parse(store.get(STORE) ?? "{}") as Record<string, number>,
    /** 頁面長高（資料畫出來）：瀏覽器在下一次畫面前通知 */
    grow(next: number) {
      page.height = next;
      page.y = Math.min(page.y, Math.max(0, next - page.viewport));
      page.onResize?.();
    },
    /** 捲到某處（使用者自己捲、瀏覽器還原、捲動錨定都會發 scroll） */
    scrollTo(y: number) {
      page.y = y;
      fire("scroll");
    },
  };
}

describe("記位置：每一筆瀏覽紀錄各記各的", () => {
  it("捲到一半重新整理：離開前把這一筆的位置存起來", () => {
    const t = fakePage();
    keepScrollAcrossReloads(t.env, { restore: false });
    t.scrollTo(8548);
    t.fire("pagehide");
    expect(t.saved()).toEqual({ "entry-quest": 8548 });
  });

  it("手機切到背景（之後可能被系統關掉）也存；切回來不用存", () => {
    const t = fakePage();
    keepScrollAcrossReloads(t.env, { restore: false });
    t.scrollTo(4568);
    t.fire("visibilitychange");
    expect(t.saved()).toEqual({});
    t.page.hidden = true;
    t.fire("visibilitychange");
    expect(t.saved()).toEqual({ "entry-quest": 4568 });
  });

  it("站內換頁之後，前一頁離開時的位置也留著（之後按返回整頁重載回到它時要用）", () => {
    const t = fakePage({ key: "entry-home" });
    keepScrollAcrossReloads(t.env, { restore: false });
    t.scrollTo(2525);
    // 點連結換到任務頁：新的一筆，Next 捲回頂端
    t.page.key = "entry-quest";
    t.scrollTo(0);
    t.scrollTo(3000);
    t.fire("pagehide");
    expect(t.saved()).toEqual({ "entry-home": 2525, "entry-quest": 3000 });
  });

  it("進到這一頁之後一次都沒捲：離開時照樣記下現在的位置，不留之前的舊位置", () => {
    const t = fakePage({ saved: { "entry-quest": 5000 } });
    keepScrollAcrossReloads(t.env, { restore: false });
    t.fire("pagehide");
    expect(t.saved()).toEqual({ "entry-quest": 0 });
  });

  it("別的網頁（之前那次載入）存的位置留著，只蓋掉這次動到的", () => {
    const t = fakePage({ key: "entry-about", saved: { "entry-home": 2525, "entry-about": 100 } });
    keepScrollAcrossReloads(t.env, { restore: false });
    t.scrollTo(1952);
    t.fire("pagehide");
    expect(t.saved()).toEqual({ "entry-home": 2525, "entry-about": 1952 });
  });

  it("離開時瀏覽器留住了這一頁、之後又回來：再離開只寫這段期間動到的，不拿舊的蓋掉別次載入存的", () => {
    const t = fakePage({ key: "entry-home" });
    keepScrollAcrossReloads(t.env, { restore: false });
    t.scrollTo(2525);
    t.page.key = "entry-quest";
    t.scrollTo(0);
    t.fire("pagehide");
    // 這段期間別次載入把首頁那一筆改成 900
    t.env.storage?.setItem(STORE, JSON.stringify({ ...t.saved(), "entry-home": 900 }));
    t.fire("pageshow");
    t.scrollTo(40);
    t.fire("pagehide");
    expect(t.saved()).toEqual({ "entry-home": 900, "entry-quest": 40 });
  });

  it("逛很久也不會越存越多：太舊的先丟，最近的留著（剛又捲過的那一筆算最新，就算它很久以前就記過）", () => {
    const old = Object.fromEntries([["entry-new", 1], ...Array.from({ length: 300 }, (_, i) => [`old-${i}`, i + 1])]);
    const t = fakePage({ key: "entry-new", saved: old });
    keepScrollAcrossReloads(t.env, { restore: false });
    t.scrollTo(700);
    t.fire("pagehide");
    const kept = t.saved();
    expect(Object.keys(kept).length).toBeLessThanOrEqual(100);
    expect(kept["entry-new"]).toBe(700);
    expect(kept["old-299"]).toBe(300);
    expect(kept["old-0"]).toBeUndefined();
  });

  it("存壞了、或瀏覽器不讓存（隱私模式、空間滿了）：不出錯", () => {
    const broken = fakePage({ key: "entry-a" });
    broken.env.storage = { getItem: () => "{壞掉", setItem: () => void 0 };
    keepScrollAcrossReloads(broken.env, { restore: true });
    broken.scrollTo(10);
    expect(() => broken.fire("pagehide")).not.toThrow();

    const denied = fakePage();
    denied.env.storage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    keepScrollAcrossReloads(denied.env, { restore: true });
    denied.scrollTo(10);
    expect(() => denied.fire("pagehide")).not.toThrow();

    const none = fakePage();
    none.env.storage = null;
    keepScrollAcrossReloads(none.env, { restore: true });
    expect(() => none.fire("pagehide")).not.toThrow();
  });
});

describe("整頁重載：內容晚出現，放得下了再直接跳回原位", () => {
  it("任務頁：一載入只有讀取中，放不下就先不動；任務畫出來、頁面夠高了才跳回 8548", () => {
    const t = fakePage({ saved: { "entry-quest": 8548 } });
    keepScrollAcrossReloads(t.env, { restore: true });
    t.grow(991);
    expect(t.page.jumps).toEqual([]);
    t.grow(14247);
    expect(t.page.jumps).toEqual([8548]);
    expect(t.page.y).toBe(8548);
  });

  it("關於頁：上面晚插進兩塊，捲動錨定把位置往下推到 2414——頁面一變就拉回 1952", () => {
    const t = fakePage({ key: "entry-about", height: 2234, saved: { "entry-about": 1952 } });
    keepScrollAcrossReloads(t.env, { restore: true });
    t.grow(2234);
    expect(t.page.jumps).toEqual([]);
    // 資料到了：頁面變 3253，錨定把位置推到 2414（瀏覽器在通知我們之前就推了）
    t.page.y = 2414;
    t.grow(3253);
    expect(t.page.y).toBe(1952);
  });

  it("首頁：路線、攻略、裝備卡分好幾次長出來，每次都留在原位", () => {
    const t = fakePage({ key: "entry-home", height: 812, saved: { "entry-home": 2525 } });
    keepScrollAcrossReloads(t.env, { restore: true });
    t.grow(1494);
    t.grow(3900);
    expect(t.page.y).toBe(2525);
    // 攻略到了，上面多一條技能：錨定往下推
    t.page.y = 2700;
    t.grow(4100);
    expect(t.page.y).toBe(2525);
    t.grow(4208);
    expect(t.page.y).toBe(2525);
  });

  it("跳回去的這段時間關掉捲動錨定：內容插進上面時，位置不會先被推走、下一格才拉回來", () => {
    const t = fakePage({ key: "entry-home", height: 812, saved: { "entry-home": 2525 } });
    keepScrollAcrossReloads(t.env, { restore: true });
    expect(t.page.anchoring).toBe(false);
  });

  it("一般進來、或這一筆沒記過位置：捲動錨定照舊開著", () => {
    for (const [restore, saved] of [[false, { "entry-quest": 8548 }], [true, {}]] as const) {
      const t = fakePage({ saved });
      keepScrollAcrossReloads(t.env, { restore });
      t.grow(14247);
      expect(t.page.anchoring, `${restore}`).toBe(true);
    }
  });

  it("已經在原位就不再跳一次（瀏覽器自己還原成功的頁面，例如懶人包）", () => {
    const t = fakePage({ key: "entry-guide", height: 2848, saved: { "entry-guide": 1709 } });
    keepScrollAcrossReloads(t.env, { restore: true });
    t.page.y = 1709;
    t.grow(2848);
    expect(t.page.jumps).toEqual([]);
  });

  it("還原的這段時間，瀏覽器截掉、錨定推動造成的捲動不記：連按兩次重新整理，還是回到 8548", () => {
    const t = fakePage({ saved: { "entry-quest": 8548 } });
    keepScrollAcrossReloads(t.env, { restore: true });
    t.scrollTo(179);
    t.fire("pagehide");
    expect(t.saved()).toEqual({ "entry-quest": 8548 });
  });

  it("一般點連結、打網址進來（不是整頁重載）：不跳", () => {
    const t = fakePage({ saved: { "entry-quest": 8548 } });
    keepScrollAcrossReloads(t.env, { restore: false });
    t.grow(14247);
    expect(t.page.jumps).toEqual([]);
  });

  it("這一筆沒記過位置、或記的是頂端：不用管", () => {
    for (const saved of [{}, { "entry-quest": 0 }, { "entry-quest": "壞掉" }]) {
      const t = fakePage({ saved });
      keepScrollAcrossReloads(t.env, { restore: true });
      t.grow(14247);
      expect(t.page.jumps, JSON.stringify(saved)).toEqual([]);
      expect(t.page.onResize, JSON.stringify(saved)).toBeNull();
    }
  });
});

describe("整頁重載：使用者一動就停手，不跟他搶", () => {
  it("點、按鍵、滾輪、手指碰到、讀螢幕軟體按連結：之後頁面再長高也不跳", () => {
    for (const type of ["pointerdown", "keydown", "wheel", "touchstart", "click"]) {
      const t = fakePage({ saved: { "entry-quest": 8548 } });
      keepScrollAcrossReloads(t.env, { restore: true });
      t.fire(type);
      t.grow(14247);
      expect(t.page.jumps, type).toEqual([]);
      expect(t.page.onResize, type).toBeNull();
      // 交還給瀏覽器：之後內容插進上面，照常幫他把位置往下推
      expect(t.page.anchoring, type).toBe(true);
    }
  });

  it("停手之後自己捲的位置照記", () => {
    const t = fakePage({ saved: { "entry-quest": 8548 } });
    keepScrollAcrossReloads(t.env, { restore: true });
    t.fire("pointerdown");
    t.grow(14247);
    t.scrollTo(300);
    t.fire("pagehide");
    expect(t.saved()).toEqual({ "entry-quest": 300 });
  });

  it("按上一頁／下一頁：交給瀏覽器還原那一筆，這裡不再跳（照網址記的瀏覽器，同一頁的 #錨點 也是同一個網址）", () => {
    const t = fakePage({ saved: { "entry-quest": 8548 } });
    keepScrollAcrossReloads(t.env, { restore: true });
    t.fire("popstate");
    t.grow(14247);
    expect(t.page.jumps).toEqual([]);
  });

  it("沒有操作、但已經換到別筆紀錄（程式換的網址）：不把這一頁的位置套到別頁", () => {
    const t = fakePage({ saved: { "entry-quest": 8548 } });
    keepScrollAcrossReloads(t.env, { restore: true });
    t.page.key = "entry-farm";
    t.grow(14247);
    expect(t.page.jumps).toEqual([]);
    expect(t.page.anchoring).toBe(true);
  });

  it("等太久（資料一直沒來）就放棄：之後頁面才長高也不跳", () => {
    const t = fakePage({ saved: { "entry-quest": 8548 } });
    keepScrollAcrossReloads(t.env, { restore: true });
    expect(t.page.timers).toHaveLength(1);
    t.page.timers[0]();
    t.grow(14247);
    expect(t.page.jumps).toEqual([]);
    expect(t.page.onResize).toBeNull();
    expect(t.page.anchoring).toBe(true);
  });
});

// 白狼人開在怪物清單第 121 筆（卡片離頁面頂端 6000），讀到卡片中段（9000）重新整理。
// 重新整理後清單只剩前 60 筆，卡片從清單中間搬到最上面（357），往上搬了 5643
describe("查資料卡片搬家：要跳回去的位置跟著卡片挪，一樣停在卡片裡讀到的那一段", () => {
  it("卡片往上搬了 5643：跳到 9000 − 5643 = 3357", () => {
    const t = fakePage({ key: "entry-wolf", height: 812, saved: { "entry-wolf": 9000 } });
    const restore = keepScrollAcrossReloads(t.env, { restore: true });
    // 清單先照記住的筆數畫出來（卡片還在第 121 筆）：放得下，跳回 9000
    t.grow(14000);
    expect(t.page.y).toBe(9000);
    // 接著只剩前 60 筆，卡片搬到最上面：頁面變短，瀏覽器把位置截到底
    t.grow(6200);
    restore.shift(-5643);
    expect(t.page.y).toBe(3357);
    expect(t.page.jumps).toEqual([9000, 3357]);
  });

  it("挪的時候還放不下：先記著，頁面長高、放得下了再跳到挪過的位置", () => {
    const t = fakePage({ key: "entry-wolf", height: 812, saved: { "entry-wolf": 9000 } });
    const restore = keepScrollAcrossReloads(t.env, { restore: true });
    restore.shift(-5643);
    expect(t.page.jumps).toEqual([]);
    t.grow(6200);
    expect(t.page.jumps).toEqual([3357]);
  });

  it("每次畫面更新都可以再對一次：照離開時記的位置算，重複叫不會越挪越多", () => {
    const t = fakePage({ key: "entry-wolf", height: 6200, saved: { "entry-wolf": 9000 } });
    const restore = keepScrollAcrossReloads(t.env, { restore: true });
    restore.shift(-5643);
    restore.shift(-5643);
    expect(t.page.y).toBe(3357);
    // 卡片又回到離開時的地方（例如清單又長回去）：回到記下的 9000
    t.grow(14000);
    restore.shift(0);
    expect(t.page.y).toBe(9000);
  });

  it("挪過的位置也記下來：還沒動又按一次重新整理，回到挪過的地方", () => {
    const t = fakePage({ key: "entry-wolf", height: 6200, saved: { "entry-wolf": 9000 } });
    const restore = keepScrollAcrossReloads(t.env, { restore: true });
    restore.shift(-5643);
    t.fire("pagehide");
    expect(t.saved()).toEqual({ "entry-wolf": 3357 });
  });

  it("挪到頂端以上（離開時在卡片上方、卡片又往上搬）：停在頂端", () => {
    const t = fakePage({ key: "entry-wolf", height: 14000, saved: { "entry-wolf": 2000 } });
    const restore = keepScrollAcrossReloads(t.env, { restore: true });
    t.grow(14000);
    expect(t.page.y).toBe(2000);
    restore.shift(-5643);
    expect(t.page.y).toBe(0);
  });

  it("還在還原就說 restoring：查資料頁這時不自己跳到卡片", () => {
    const t = fakePage({ key: "entry-wolf", height: 812, saved: { "entry-wolf": 9000 } });
    const restore = keepScrollAcrossReloads(t.env, { restore: true });
    expect(restore.restoring()).toBe(true);
    t.grow(14000);
    // 已經跳回去了也還算：使用者還沒動，之後清單變短、卡片搬家還要跟著挪
    expect(restore.restoring()).toBe(true);
  });

  it("使用者動過、等太久、換到別筆紀錄：不再挪，restoring 變 false（查資料頁照舊跳到卡片）", () => {
    const cases: Array<[string, (t: ReturnType<typeof fakePage>) => void]> = [
      ["點了", t => t.fire("pointerdown")],
      ["等太久", t => t.page.timers[0]()],
      ["換到別筆紀錄", t => void (t.page.key = "entry-other")],
    ];
    for (const [name, act] of cases) {
      const t = fakePage({ key: "entry-wolf", height: 6200, saved: { "entry-wolf": 9000 } });
      const restore = keepScrollAcrossReloads(t.env, { restore: true });
      act(t);
      expect(restore.restoring(), name).toBe(false);
      restore.shift(-5643);
      expect(t.page.jumps, name).toEqual([]);
    }
  });

  it("不是整頁重載、或這一筆沒記過位置：restoring 是 false，挪也不跳", () => {
    for (const [restore, saved] of [[false, { "entry-wolf": 9000 }], [true, {}], [true, { "entry-wolf": 0 }]] as const) {
      const t = fakePage({ key: "entry-wolf", height: 6200, saved });
      const control = keepScrollAcrossReloads(t.env, { restore });
      expect(control.restoring(), JSON.stringify([restore, saved])).toBe(false);
      control.shift(-5643);
      expect(t.page.jumps, JSON.stringify([restore, saved])).toEqual([]);
    }
  });
});

describe("哪些載入要還原", () => {
  const navigationOf = (type: string) => ({
    getEntriesByType: (kind: string) => (kind === "navigation" ? [{ type }] : []),
  });

  it("重新整理、離站再返回（整頁重載）才算；點連結、打網址、預先載入不算", () => {
    expect(isFullReload(navigationOf("reload"))).toBe(true);
    expect(isFullReload(navigationOf("back_forward"))).toBe(true);
    expect(isFullReload(navigationOf("navigate"))).toBe(false);
    expect(isFullReload(navigationOf("prerender"))).toBe(false);
  });

  it("瀏覽器太舊、拿不到載入方式：當作不是，不出錯", () => {
    expect(isFullReload({ getEntriesByType: () => [] })).toBe(false);
    expect(isFullReload({} as never)).toBe(false);
    expect(isFullReload(undefined)).toBe(false);
  });
});

/** 瀏覽器的替身：只放這支程式會用到的東西（<html> 也帶著 HistoryScrollJump 要的 inline style） */
function fakeBrowser({
  type = "reload",
  pathname = "/plan/quest",
  search = "",
  navigationKey,
  saved,
}: { type?: string; pathname?: string; search?: string; navigationKey?: string; saved?: Record<string, number> } = {}) {
  const store = new Map<string, string>();
  if (saved) store.set(STORE, JSON.stringify(saved));
  const observers: Array<{ callback: () => void; observed: unknown[]; disconnected: boolean }> = [];
  const scrolls: unknown[] = [];
  const root = {
    scrollHeight: 991,
    clientHeight: 812,
    style: { scrollBehavior: type === "navigate" ? "" : "auto", overflowAnchor: "" },
    getClientRects: () => [],
  };
  const win = Object.assign(new EventTarget(), {
    scrollY: 0,
    location: { pathname, search },
    performance: { getEntriesByType: (kind: string) => (kind === "navigation" ? [{ type }] : []) },
    sessionStorage: { getItem: (name: string) => store.get(name) ?? null, setItem: (name: string, value: string) => void store.set(name, value) },
    navigation: navigationKey ? { currentEntry: { key: navigationKey } } : undefined,
    scrollTo(options: ScrollToOptions) {
      scrolls.push(options);
    },
    setTimeout: () => 0,
    ResizeObserver: class {
      entry = { callback: () => {}, observed: [] as unknown[], disconnected: false };
      constructor(callback: () => void) {
        this.entry.callback = callback;
        observers.push(this.entry);
      }
      observe(target: unknown) {
        this.entry.observed.push(target);
      }
      disconnect() {
        this.entry.disconnected = true;
      }
    },
  });
  const doc = { documentElement: root, visibilityState: "visible" };
  return { win, doc, root, store, observers, scrolls };
}

describe("裝到真的瀏覽器上（window、document、sessionStorage、ResizeObserver）", () => {
  it("重新整理進來：盯著整頁的高度，放得下就用 instant 跳回去（不管全站的平滑捲動）", () => {
    const b = fakeBrowser({ saved: { "/plan/quest": 8548 } });
    installReloadScroll(b.win as never, b.doc as never);
    expect(b.observers).toHaveLength(1);
    expect(b.observers[0].observed).toEqual([b.root]);
    b.root.scrollHeight = 14247;
    b.observers[0].callback();
    expect(b.scrolls).toEqual([{ top: 8548, behavior: "instant" }]);
  });

  it("跳回去的這段時間 <html> 關掉捲動錨定（overflow-anchor: none），使用者一動就拿掉、交還給瀏覽器", () => {
    const b = fakeBrowser({ saved: { "/plan/quest": 8548 } });
    installReloadScroll(b.win as never, b.doc as never);
    expect(b.root.style.overflowAnchor).toBe("none");
    b.win.dispatchEvent(new Event("pointerdown"));
    expect(b.root.style.overflowAnchor).toBe("");
  });

  it("瀏覽器分得出是哪一筆紀錄（navigation.currentEntry.key）就照紀錄記，同一個網址出現兩次也分得開", () => {
    const b = fakeBrowser({ navigationKey: "k-2", saved: { "/plan/quest": 100, "k-2": 8548 } });
    installReloadScroll(b.win as never, b.doc as never);
    b.root.scrollHeight = 14247;
    b.observers[0].callback();
    expect(b.scrolls).toEqual([{ top: 8548, behavior: "instant" }]);
  });

  it("沒有 navigation 的瀏覽器照網址記（不含 #）", () => {
    const b = fakeBrowser({ type: "navigate", pathname: "/db/monsters", search: "?id=100100" });
    Object.assign(b.win.location, { hash: "#main" });
    installReloadScroll(b.win as never, b.doc as never);
    b.win.scrollY = 4001;
    b.win.dispatchEvent(new Event("scroll"));
    b.win.dispatchEvent(new Event("pagehide"));
    expect(JSON.parse(b.store.get(STORE) ?? "{}")).toEqual({ "/db/monsters?id=100100": 4001 });
  });

  it("查資料開著某一筆重新整理：一樣盯著，放得下就跳回卡片裡讀到的地方（4001，不是卡片頂端）", () => {
    const b = fakeBrowser({ pathname: "/db/monsters", search: "?id=100100", saved: { "/db/monsters?id=100100": 4001 } });
    installReloadScroll(b.win as never, b.doc as never);
    expect(b.observers).toHaveLength(1);
    b.root.scrollHeight = 6700;
    b.observers[0].callback();
    expect(b.scrolls).toEqual([{ top: 4001, behavior: "instant" }]);
  });

  it("查資料頁拿得到這次的還原（reloadRestore）：還在還原就不自己跳卡片，卡片搬家時叫它跟著挪", () => {
    const b = fakeBrowser({ navigationKey: "k-wolf", pathname: "/db/monsters", search: "?id=8140000", saved: { "k-wolf": 9000 } });
    installReloadScroll(b.win as never, b.doc as never);
    expect(reloadRestore()?.restoring()).toBe(true);
    b.root.scrollHeight = 6200;
    reloadRestore()?.shift(-5643);
    expect(b.scrolls).toEqual([{ top: 3357, behavior: "instant" }]);
  });

  it("一般點連結進來：reloadRestore 說沒在還原（查資料頁照舊跳到卡片）", () => {
    const b = fakeBrowser({ type: "navigate", pathname: "/db/monsters", search: "?id=100100", saved: { "/db/monsters?id=100100": 4001 } });
    installReloadScroll(b.win as never, b.doc as never);
    expect(reloadRestore()?.restoring()).toBe(false);
  });

  it("瀏覽器少了哪個功能（沒有 ResizeObserver、sessionStorage、performance）都不出錯，頁面照常", () => {
    const b = fakeBrowser({ saved: { "/plan/quest": 8548 } });
    const bare = Object.assign(new EventTarget(), { location: b.win.location, scrollY: 0, scrollTo: b.win.scrollTo });
    expect(() => installReloadScroll(bare as never, b.doc as never)).not.toThrow();
    expect(() => installReloadScroll(new EventTarget() as never, {} as never)).not.toThrow();
  });
});

describe("全站元件 HistoryScrollJump：一載入就裝好，不等畫面出來", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function load(browser: ReturnType<typeof fakeBrowser>) {
    vi.stubGlobal("window", browser.win);
    vi.stubGlobal("document", browser.doc);
    vi.resetModules();
    await import("@/components/HistoryScrollJump");
  }

  it("重新整理進來：layout 一載入就開始盯頁面高度，任務畫出來就跳回 8548", async () => {
    const b = fakeBrowser({ saved: { "/plan/quest": 8548 } });
    await load(b);
    expect(b.observers).toHaveLength(1);
    b.root.scrollHeight = 14247;
    b.observers[0].callback();
    expect(b.scrolls).toEqual([{ top: 8548, behavior: "instant" }]);
  });

  it("一般點連結進來：只記位置，不盯", async () => {
    const b = fakeBrowser({ type: "navigate", saved: { "/plan/quest": 8548 } });
    await load(b);
    expect(b.observers).toHaveLength(0);
    b.win.scrollY = 120;
    b.win.dispatchEvent(new Event("pagehide"));
    expect(JSON.parse(b.store.get(STORE) ?? "{}")).toEqual({ "/plan/quest": 120 });
  });
});
