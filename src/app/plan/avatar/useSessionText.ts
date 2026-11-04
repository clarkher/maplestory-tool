"use client";

/**
 * 一條字串存在 sessionStorage 固定 key：重新整理還在，新開分頁就沒有。紙娃娃的上一套、鎖用這個。
 * 不能用 useVisitState：沒有 Navigation API 的瀏覽器（舊 iPhone）它照網址記，這頁每換一件網址就變，重新整理會掉。
 * 第一次畫跟伺服器一樣是空字串（hydration 對得上），掛上去才讀；讀寫失敗（隱私模式、空間滿了）就當作沒有，頁面照常。
 *
 *   const [text, setText] = useSessionText("avatar:locks");
 *
 * 不用畫面的直接讀寫（readSessionText、writeSessionText）：伺服器上、隱私模式讀不到都當作沒有（null），不丟錯。
 */
import { useCallback, useEffect, useState } from "react";

/** 存的字串；沒存過或讀不到是 null（空字串是存過） */
export function readSessionText(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSessionText(key: string, next: string): void {
  try {
    sessionStorage.setItem(key, next);
  } catch {
    // 寫不進去：這次瀏覽還是記得，只是重新整理後就沒了
  }
}

export function useSessionText(key: string): [string, (next: string) => void] {
  const [text, setText] = useState("");

  useEffect(() => {
    setText(readSessionText(key) ?? "");
  }, [key]);

  const save = useCallback(
    (next: string) => {
      setText(next);
      writeSessionText(key, next);
    },
    [key],
  );

  return [text, save];
}
