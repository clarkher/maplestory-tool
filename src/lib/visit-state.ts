"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type SetStateAction } from "react";

/**
 * 展開／收起記在「這一筆瀏覽紀錄」上，記到關掉分頁為止（sessionStorage `ms-open`）。
 * 展開的東西重新整理後收回去，頁面變短，捲動位置（reload-scroll 記的像素）就對到別段內容；
 * 所以重新整理、離站再回來、站內按返回，卡片一畫出來就是離開時的樣子，頁面一樣長，跳回去才對到同一段。
 * 從選單、連結新點進來是新的一筆紀錄：全部照預設，跟捲動位置同一套規則（2026-10-07 使用者選的）。
 */

/** 存在 sessionStorage：重新整理、離站再回來都還在，關掉分頁才清 */
const STORE = "ms-open";
/** 最多記幾筆紀錄（跟記捲動位置一樣）：逛很久也不會越存越多，最久沒動的先丟 */
const LIMIT = 50;

type Store = Pick<Storage, "getItem" | "setItem">;
/** 每一筆紀錄 → 這筆紀錄裡跟預設不一樣的展開狀態 */
type Saved = Record<string, Record<string, unknown>>;

export type VisitEnv = {
  storage: Store | null;
  /** 現在是哪一筆瀏覽紀錄 */
  entry(): string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** sessionStorage 記的全部紀錄；沒有 sessionStorage、瀏覽器不讓讀回 null，存壞了當作沒記過 */
function readStore(storage: Store | null): Saved | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(STORE);
  } catch {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw ?? "{}");
    return isRecord(parsed) ? (parsed as Saved) : {};
  } catch {
    return {};
  }
}

/** 一個分頁的記憶：sessionStorage 讀一次，之後讀都先過這份（sessionStorage 不能用時，這次載入裡站內按返回也還記得） */
export function visitMemory(env: VisitEnv) {
  let saved: Saved | null = null;
  const load = () => (saved ??= readStore(env.storage) ?? {});
  const recall = <T,>(key: string, fallback: T): T => {
    const record = load()[env.entry()];
    return isRecord(record) && Object.prototype.hasOwnProperty.call(record, key) ? (record[key] as T) : fallback;
  };
  const remember = (key: string, value: unknown, initial: unknown) => {
    // 寫之前重讀：同一個分頁的另一份頁面（離站前那份從返回快取回來）可能剛寫過別筆紀錄，不能用這份的舊記憶蓋掉
    const all = readStore(env.storage) ?? load();
    saved = all;
    const entry = env.entry();
    const record = isRecord(all[entry]) ? { ...all[entry] } : {};
    if (JSON.stringify(value) === JSON.stringify(initial)) delete record[key];
    else record[key] = value;
    // 剛動到的那筆排最後；超過上限從最久沒動的丟
    delete all[entry];
    if (Object.keys(record).length) all[entry] = record;
    const entries = Object.keys(all);
    for (const old of entries.slice(0, Math.max(0, entries.length - LIMIT))) delete all[old];
    try {
      env.storage?.setItem(STORE, JSON.stringify(all));
    } catch {
      // 寫不進去（隱私模式、空間滿了）：這次載入照樣記得，只是重新整理後就沒了
    }
  };
  return {
    /** 這一筆紀錄記下的值；沒記過用預設值 */
    recall,
    /** 記到這一筆紀錄上；跟預設一樣就不記（整筆都是預設就拿掉，不佔名額） */
    remember,
    /** 這一筆紀錄第一次走到這裡才回 true，之後（重新整理、按返回）回 false：給「從連結帶 # 進來自動展開」這種只做一次的事 */
    claim(key: string): boolean {
      if (recall(key, false)) return false;
      remember(key, true, false);
      return true;
    },
  };
}

type Where = {
  /** Navigation API：分得出是上一頁清單裡的哪一筆，重新整理、整頁重載的返回都還是同一個 key */
  navigation?: { currentEntry?: { key?: string } | null };
  location: Pick<Location, "pathname" | "search">;
};

/**
 * 現在是哪一筆瀏覽紀錄：分得出紀錄就照紀錄（跟 reload-scroll 記捲動位置同一把 key），不然照網址（不含 #）。
 * 沒有 Navigation API 的瀏覽器只能照網址：同一個網址從選單重新點進來，也會拿到上次在這個網址記的展開（跟 reload-scroll 同一個限制）。
 */
export function entryKeyOf({ navigation, location }: Where): string {
  return navigation?.currentEntry?.key ?? `${location.pathname}${location.search}`;
}

function sessionStorageOrNull(): Store | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

let shared: ReturnType<typeof visitMemory> | null = null;
const memory = () => (shared ??= visitMemory({ storage: sessionStorageOrNull(), entry: () => entryKeyOf(globalThis as unknown as Where) }));

// useSyncExternalStore 的三個函式放外面：每次畫都換新的，React 每次都要多排一次檢查
const noSubscribe = () => () => {};
const inBrowser = () => false;
const onServer = () => true;

/** 這一筆紀錄第一次走到這裡才回 true（重新整理、按返回再來回 false）；只在瀏覽器上、effect 裡呼叫 */
export function claimVisit(key: string): boolean {
  return memory().claim(key);
}

/**
 * 用法跟 useState 一樣，只是值記在這一筆瀏覽紀錄上：重新整理、離站再回來、站內按返回，從記下的值開始。
 * key 要分得出哪一頁的哪一個（"quest:card:101"）；元件掛著時 key 不換——要換就讓上一層用 React key 換一個新元件。
 * initial 用布林、字串、數字、null 這種值（物件、陣列每次畫都是新的，點過之後每次畫都會再寫一次）。
 * 使用者自己點了才記：卡片剛掛上去不寫，從選單點進來的新紀錄也不會被寫進預設值。
 */
export function useVisitState<T>(key: string, initial: T) {
  // 伺服器上、接手伺服器畫好的頁（hydration）時拿不到記下的值，要畫得跟伺服器一樣（懶人包），接手完馬上換成記下的；
  // 資料到了才掛上去的卡片（首頁、規劃頁）不是接手，一畫出來就是記下的樣子
  const fromServer = useSyncExternalStore(noSubscribe, inBrowser, onServer);
  const [value, setValue] = useState<T>(() => (fromServer ? initial : memory().recall(key, initial)));
  const restoreAfterHydration = useRef(fromServer);
  useLayoutEffect(() => {
    if (!restoreAfterHydration.current) return;
    restoreAfterHydration.current = false;
    setValue(memory().recall(key, initial));
  }, [key, initial]);
  const touched = useRef(false);
  useEffect(() => {
    if (touched.current) memory().remember(key, value, initial);
  }, [key, value, initial]);
  const update = useCallback((next: SetStateAction<T>) => {
    touched.current = true;
    setValue(next);
  }, []);
  return [value, update] as const;
}
