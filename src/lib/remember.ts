"use client";

import { useEffect, useState } from "react";

/**
 * 查資料各頁的搜尋字、篩選、已經載入幾筆，記到這次瀏覽結束（關掉分頁、重新整理就清掉）。
 * 離開再回來、按返回時，清單跟離開時一模一樣，瀏覽器才捲得回原本的位置。
 */
const memory = new Map<string, unknown>();

export function recall<T>(key: string, fallback: T): T {
  return memory.has(key) ? (memory.get(key) as T) : fallback;
}

export function remember<T>(key: string, value: T) {
  memory.set(key, value);
}

/** 用法跟 useState 一樣，只是值會記住：同一頁再進來時，從記住的值開始 */
export function useRemembered<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => recall(key, initial));
  useEffect(() => {
    remember(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}
