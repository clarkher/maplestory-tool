"use client";

import { useEffect, useState } from "react";

/**
 * 查資料各頁的搜尋字、篩選、已經載入幾筆，記到關掉分頁為止（sessionStorage：重新整理還在，關掉分頁才清）。
 * 離開再回來、按返回時，清單跟離開時一模一樣，瀏覽器才捲得回原本的位置。
 */
const PREFIX = "ms-db:";
const memory = new Map<string, unknown>();

function storage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function recall<T>(key: string, fallback: T): T {
  if (memory.has(key)) return memory.get(key) as T;
  try {
    const raw = storage()?.getItem(PREFIX + key);
    if (raw !== null && raw !== undefined) {
      const value = JSON.parse(raw) as T;
      memory.set(key, value);
      return value;
    }
  } catch {
    // 讀不到（停用、存壞了）就用預設值
  }
  return fallback;
}

export function remember<T>(key: string, value: T) {
  memory.set(key, value);
  try {
    storage()?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // 寫不進去（隱私模式、空間滿了）：這次瀏覽還是記得，只是重新整理後就沒了
  }
}

/** 用法跟 useState 一樣，只是值會記住：同一頁再進來時，從記住的值開始 */
export function useRemembered<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => recall(key, initial));
  useEffect(() => {
    remember(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}
