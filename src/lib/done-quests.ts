"use client";

import { useSyncExternalStore } from "react";

/**
 * 任務頁「我做完了」打勾的任務，記在這台裝置的瀏覽器（localStorage），沒有帳號、不會送到伺服器。
 * 跟角色同一套寫法（profile.ts）：同一個分頁存的時候自己通知所有用到的地方，別的分頁改了靠 storage 事件。
 */
const STORAGE_KEY = "ms-done-quests";
const EMPTY: ReadonlySet<string> = new Set();

const listeners = new Set<() => void>();
/** 瀏覽器不讓存（空間滿了、隱私模式）時先記在這個分頁；over 是當時本機存的那份，之後別的分頁改掉了就以那份為準 */
let unsaved: { raw: string; over: string } | null = null;
let lastRaw: string | null = null;
let lastDone: ReadonlySet<string> = EMPTY;

/** 存的字轉成任務編號；沒存過、存壞了、不是陣列都當作一個都沒做 */
export function parseDoneQuests(raw: string): ReadonlySet<string> {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === "string")) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function storedRaw(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function readRaw(): string {
  const stored = storedRaw();
  if (unsaved && unsaved.over === stored) return unsaved.raw;
  unsaved = null;
  return stored;
}

/** 現在打勾的任務；存的字沒變就回同一份，React 才不會一直重畫 */
export function readDoneQuests(): ReadonlySet<string> {
  const raw = readRaw();
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastDone = parseDoneQuests(raw);
  }
  return lastDone;
}

export function subscribeDoneQuests(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** 打勾／取消打勾，存成排好序的編號陣列，通知這個分頁所有用到的地方 */
export function setQuestDone(id: string, done: boolean) {
  const next = new Set(readDoneQuests());
  if (done) next.add(id);
  else next.delete(id);
  const raw = JSON.stringify([...next].sort());
  const over = storedRaw();
  try {
    localStorage.setItem(STORAGE_KEY, raw);
    unsaved = null;
  } catch {
    unsaved = { raw, over };
  }
  for (const listener of [...listeners]) listener();
}

const noneOnServer = () => EMPTY;

/** 打勾的任務（伺服器上、還沒讀到時當作一個都沒做） */
export function useDoneQuests(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeDoneQuests, readDoneQuests, noneOnServer);
}
