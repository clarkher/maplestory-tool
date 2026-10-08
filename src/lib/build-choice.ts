"use client";

import { useCallback, useSyncExternalStore } from "react";
import { baseJob } from "./jobs";

/**
 * 首頁「能力值與裝備」卡選的點法（全幸、裝備法），每個系別記一份：鍵是一轉職業代碼（刺客、暗殺者都記在 400），
 * 升等、二轉、三轉都還是那套；選回主推就拿掉。存 localStorage（跟角色一樣關掉再開還在），
 * 用跟 lib/profile.ts 同一招：同一個分頁存了自己通知，別的分頁改了靠 storage 事件。
 * 卡片只在讀到角色之後才畫，所以這裡不會碰到伺服器那一格（server snapshot 一律當沒選）。
 */
const STORAGE_KEY = "ms-build";
const listeners = new Set<() => void>();

export function parseBuildChoices(raw: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

export function withBuildChoice(choices: Record<string, string>, line: number, tab: string | null): Record<string, string> {
  const next = { ...choices };
  if (tab) next[String(line)] = tab;
  else delete next[String(line)];
  return next;
}

function readRaw(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useBuildChoice(job: number) {
  const line = baseJob(job);
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const tab = parseBuildChoices(raw)[String(line)] ?? null;
  const setTab = useCallback(
    (next: string | null) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(withBuildChoice(parseBuildChoices(readRaw()), line, next)));
      } catch {
        // 存不進去（隱私模式、空間滿了）：這次就不記，畫面照樣不換——寧可不換也不要假裝記住
      }
      for (const listener of listeners) listener();
    },
    [line],
  );
  return [tab, setTab] as const;
}
