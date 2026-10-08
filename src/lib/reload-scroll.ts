/**
 * 重新整理、離站再返回（整頁重載）時，回到離開時的位置。
 * 瀏覽器一載入就還原位置，可是首頁、規劃頁、查資料清單的內容要等資料抓完才畫出來：還原的那一刻頁面很短，
 * 位置被截掉（任務頁 8548 → 179）；內容晚插進上面時，捲動錨定還會把位置往下推（關於頁 1952 → 2414）。
 * 所以自己記每一筆瀏覽紀錄的位置，整頁重載時頁面每長高一次，放得下了就直接跳回去；使用者一動就停手。
 * 查資料開著某一筆（?id=）也是這裡放回去：讀到卡片中段重新整理，回到中段；卡片搬了家，查資料頁叫這裡跟著挪（shift）。
 * 站內按上一頁／下一頁大多不靠這裡：React 當下就畫好那一頁，瀏覽器自己還原得回去（直接跳、不滑是 history-scroll 在管）。
 * 例外是網址帶 # 的那一筆（懶人包 #pq-moon）：Chrome 按返回回到它時不還原位置、改捲到錨點（1425 → 1281），所以也由這裡跳回記下的位置。
 */

/** 存在 sessionStorage：重新整理、離站再回來都還在，關掉分頁才清 */
const STORE = "ms-scroll";
/** 最多記幾筆：逛很久也不會越存越多，最舊的先丟 */
const LIMIT = 50;
/** 資料等太久就放棄，之後才長出來的內容照瀏覽器原本的做法 */
const GIVE_UP_MS = 20_000;
/** 使用者自己動了（點、按鍵、滾輪、手指碰到；讀螢幕軟體按連結只送 click），或按上一頁／下一頁：停手，不跟他搶 */
const HANDS_ON = ["pointerdown", "keydown", "wheel", "touchstart", "click", "popstate"];

type Store = Pick<Storage, "getItem" | "setItem">;

export type ScrollEnv = {
  /** window：捲動、離開、使用者操作都從這裡收（visibilitychange 從 document 冒泡上來） */
  events: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  /** 現在是哪一筆瀏覽紀錄 */
  key(): string;
  scrollY(): number;
  /** 現在最多捲得到哪裡 */
  maxScroll(): number;
  /** 直接跳過去，不滑 */
  jump(top: number): void;
  storage: Store | null;
  /** 頁面切到背景了沒 */
  hidden(): boolean;
  /** 頁面高度每變一次就通知（畫面更新前）；回傳停止的函式 */
  watchResize(onResize: () => void): () => void;
  wait(ms: number, then: () => void): void;
  /** 捲動錨定（內容插進上面時，瀏覽器把位置往下推、讓畫面上的東西不動）開或關 */
  scrollAnchoring(on: boolean): void;
  /** 網址現在帶不帶 #（片段） */
  hasFragment(): boolean;
  /** 站內按上一頁／下一頁、換到那一筆紀錄之後（popstate）通知；分不出是不是按上一頁的瀏覽器不通知 */
  onTraverse(then: () => void): void;
};

function readAll(storage: Store | null): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(STORE) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    // 存壞了、瀏覽器不讓讀：當作沒記過
    return {};
  }
}

/** 這次記到的位置併進去（之前那幾次載入存的留著）；剛動到的排最後，超過上限從最舊的丟 */
function writeAll(storage: Store | null, recorded: Map<string, number>) {
  if (!storage || recorded.size === 0) return;
  const all = readAll(storage);
  for (const [key, top] of recorded) {
    delete all[key];
    all[key] = top;
  }
  const keys = Object.keys(all);
  for (const key of keys.slice(0, Math.max(0, keys.length - LIMIT))) delete all[key];
  try {
    storage.setItem(STORE, JSON.stringify(all));
  } catch {
    // 寫不進去（隱私模式、空間滿了）：只是重新整理後回不到原位
  }
}

/** 這次整頁重載的還原：查資料頁用來決定要不要自己跳卡片、卡片搬家時叫它跟著挪 */
export type ReloadRestore = {
  /** 還在把位置放回去：整頁重載、這一筆記過位置、使用者還沒動、還是同一筆紀錄、還沒等太久 */
  restoring(): boolean;
  /**
   * 頁面上的東西比離開時搬了 by px（查資料重新整理後清單只剩前 60 筆，卡片從清單中間搬到最上面）：
   * 要跳回去的位置＝記下的位置＋by，放得下就馬上跳。照記下的位置算，每次畫面更新都叫也不會越挪越多
   */
  shift(by: number): void;
};

/**
 * 記住每一筆瀏覽紀錄捲到哪；restore（這次是整頁重載）時，頁面長高、放得下了就跳回記下的位置。
 * 跳回去的這段時間，瀏覽器截掉、錨定推動造成的捲動都不記，連按兩次重新整理也回得去。
 */
export function keepScrollAcrossReloads(env: ScrollEnv, { restore }: { restore: boolean }): ReloadRestore {
  // 這次載入動到的位置，離開時才併進 sessionStorage
  const recorded = new Map<string, number>();
  // 正在放回去的那一段（同時只有一段）；放的這段時間，瀏覽器截掉、錨定推動、捲到錨點造成的捲動都不記
  let current: PutBack | null = null;

  const record = () => {
    if (!current?.active()) recorded.set(env.key(), Math.round(env.scrollY()));
  };
  // 進到這一頁後一次都沒捲也要記：離開時一律記下現在的位置
  const save = () => {
    record();
    writeAll(env.storage, recorded);
    recorded.clear();
  };
  env.events.addEventListener("scroll", record, { passive: true });
  env.events.addEventListener("pagehide", save);
  // 手機切到背景之後可能直接被系統關掉，沒有 pagehide
  env.events.addEventListener("visibilitychange", () => {
    if (env.hidden()) save();
  });

  /**
   * 把 key 那一筆放回 top：頁面每長高一次（盯上之後瀏覽器在下一次畫面前也會先通知一次），放得下了就直接跳。
   * 使用者一動、換到別筆紀錄、等太久就停手。handsOn：哪些事算「動了」
   */
  const putBack = (key: string, top: number, handsOn: readonly string[]): PutBack => {
    current?.stop();
    let target = top;
    let on = true;
    let unwatch = () => {};
    const stop = () => {
      if (!on) return;
      on = false;
      unwatch();
      env.scrollAnchoring(true);
      for (const type of handsOn) env.events.removeEventListener(type, stop, true);
    };
    // 還沒停手、也還是同一筆紀錄。已經換到別筆紀錄（程式換的網址、又按了返回）就停手：不把這一頁的位置套過去，新的那一筆照常記
    const active = () => {
      if (on && env.key() !== key) stop();
      return on;
    };
    const place = () => {
      if (!active()) return;
      // 還放不下（資料還沒畫出來）：先不動，等下一次長高
      if (env.maxScroll() + 1 < target) return;
      if (Math.abs(env.scrollY() - target) > 1) env.jump(target);
    };
    // 記下的位置就是內容全部長出來之後的位置：這段時間內容插進上面，位置本來就該留在原處，不用瀏覽器幫忙往下推
    env.scrollAnchoring(false);
    for (const type of handsOn) env.events.addEventListener(type, stop, { capture: true, passive: true });
    env.wait(GIVE_UP_MS, stop);
    unwatch = env.watchResize(place);
    current = {
      active,
      stop,
      moveTo: next => {
        if (!active()) return;
        target = next;
        // 離開時記挪過的位置（放回去的這段時間捲動不記）：還沒動又按一次重新整理，回到同一個地方
        recorded.set(key, target);
        place();
      },
    };
    return current;
  };

  // 站內按返回回到網址帶 # 的那一筆：Chrome 捲到錨點、不還原位置，改由這裡跳回這一筆記下的位置（離開時在頂端也算）。
  // 按返回的那個 popstate 不能讓自己停手；之後又按了返回，換了紀錄就停（active 會發現）
  env.onTraverse(() => {
    if (!env.hasFragment()) return;
    const key = env.key();
    const top = recorded.has(key) ? recorded.get(key) : readAll(env.storage)[key];
    if (typeof top !== "number" || !Number.isFinite(top) || top < 0) return;
    putBack(key, top, HANDS_ON.filter(type => type !== "popstate"));
  });

  if (!restore) return { restoring: () => false, shift: () => {} };
  const startKey = env.key();
  const saved = readAll(env.storage)[startKey];
  const savedTop = typeof saved === "number" && Number.isFinite(saved) && saved > 0 ? saved : 0;
  if (savedTop === 0) return { restoring: () => false, shift: () => {} };
  const reload = putBack(startKey, savedTop, HANDS_ON);
  return {
    restoring: reload.active,
    shift: by => reload.moveTo(Math.max(0, savedTop + by)),
  };
}

/** 正在放回去的那一段 */
type PutBack = {
  /** 還在放：使用者還沒動、還是同一筆紀錄、還沒等太久 */
  active(): boolean;
  stop(): void;
  /** 改放到別的位置（放得下就馬上跳），也記成這一筆離開時的位置 */
  moveTo(top: number): void;
};

/** 這個分頁這次載入裝上的還原（installReloadScroll）；裝不起來是 null */
let installed: ReloadRestore | null = null;

/** 查資料頁問：位置是不是有人在放回去（是的話不自己跳到卡片），卡片搬家時叫它跟著挪 */
export function reloadRestore(): ReloadRestore | null {
  return installed;
}

/** 這次是不是整頁重載：重新整理、或離站再按返回但瀏覽器沒留住頁面（一載入瀏覽器就在還原位置） */
export function isFullReload(performance: { getEntriesByType?(kind: string): readonly object[] } | undefined): boolean {
  const entry = performance?.getEntriesByType?.("navigation")[0] as { type?: string } | undefined;
  return entry?.type === "reload" || entry?.type === "back_forward";
}

type BrowserWindow = Window &
  typeof globalThis & {
    /**
     * Navigation API：瀏覽器分得出現在是上一頁清單裡的哪一筆，重新整理、整頁重載的返回都還是同一個 key；
     * 每次換紀錄先發 navigate，看得出是不是按上一頁／下一頁（traverse）
     */
    navigation?: { currentEntry?: { key?: string } | null } & Partial<Pick<EventTarget, "addEventListener">>;
  };

function sessionStorageOf(win: BrowserWindow): Store | null {
  try {
    return win.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** 裝到這個分頁上（layout 的 HistoryScrollJump 一載入就裝，不等畫面出來） */
export function installReloadScroll(win: BrowserWindow, doc: Document) {
  installed = null;
  try {
    const root = doc.documentElement;
    installed = keepScrollAcrossReloads(
      {
        events: win,
        // 分得出是哪一筆紀錄就照紀錄記（同一個網址在上一頁清單裡出現兩次也分得開），不然照網址（不含 #）
        key: () => win.navigation?.currentEntry?.key ?? `${win.location.pathname}${win.location.search}`,
        scrollY: () => win.scrollY,
        maxScroll: () => root.scrollHeight - root.clientHeight,
        // instant：全站開了平滑捲動，不指定會一路滑過去
        jump: top => win.scrollTo({ top, behavior: "instant" }),
        storage: sessionStorageOf(win),
        hidden: () => doc.visibilityState === "hidden",
        watchResize: onResize => {
          if (typeof win.ResizeObserver !== "function") return () => {};
          const observer = new win.ResizeObserver(() => onResize());
          observer.observe(root);
          return () => observer.disconnect();
        },
        wait: (ms, then) => void win.setTimeout(then, ms),
        // 整頁的捲動錨定看 <html> 的 overflow-anchor
        scrollAnchoring: on => {
          root.style.overflowAnchor = on ? "" : "none";
        },
        hasFragment: () => (win.location.hash ?? "").length > 1,
        onTraverse: then => {
          const navigation = win.navigation;
          // 沒有 Navigation API：點頁內錨點也會發 popstate，分不出是不是按上一頁，照瀏覽器原本的做法
          if (typeof navigation?.addEventListener !== "function") return;
          // 按上一頁／下一頁先發 navigate（traverse），同一份文件的話接著發 popstate；中間 Next 會 replaceState（replace），不算換了一次
          let traversing = false;
          navigation.addEventListener("navigate", event => {
            const type = (event as Event & { navigationType?: string }).navigationType;
            if (type !== "replace") traversing = type === "traverse";
          });
          win.addEventListener("popstate", () => {
            if (!traversing) return;
            traversing = false;
            then();
          });
        },
      },
      { restore: isFullReload(win.performance) },
    );
  } catch {
    // 回到原位只是加分：瀏覽器少了什麼功能，也不能拖垮整頁
  }
}
