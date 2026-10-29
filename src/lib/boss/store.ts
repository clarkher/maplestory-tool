// src/lib/boss/store.ts
// 瀏覽器存檔：紀錄與偏好。localStorage 可能丟例外（無痕模式），每次讀寫都包 try/catch。
import { EXPIRE_MS } from "./state";
import { BOSSES, SERVERS, type BossEvent, type ServerKey } from "./types";

const EVENTS_KEY = "ms-boss:events";
const PREFS_KEY = "ms-boss:prefs";
const FIRED_KEY = "ms-boss:fired";

export type BossPrefs = {
  server: ServerKey;
  boss: number;
  room: string | null;
  remind: boolean;
  device: string;
};

/** 基本形狀檢查：壞掉的陣列元素不能讓頁面崩 */
function isEvent(x: unknown): x is BossEvent {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Record<string, unknown>;
  if (typeof e.id !== "string" || typeof e.at !== "number" || !Number.isFinite(e.at)) return false;
  if (e.server !== "xuejila" && e.server !== "gugu") return false;
  if (typeof e.boss !== "number" || typeof e.ch !== "number") return false;
  if (e.kind === "kill" || e.kind === "empty") return true;
  if (e.kind === "retract") return typeof e.target === "string";
  return false;
}

export function loadEvents(storage: Storage, now: number): BossEvent[] {
  try {
    const raw = storage.getItem(EVENTS_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(isEvent).filter((e) => now - e.at <= EXPIRE_MS);
  } catch {
    return [];
  }
}

export function saveEvents(storage: Storage, events: BossEvent[]): void {
  try {
    storage.setItem(EVENTS_KEY, JSON.stringify(events));
  } catch {
    // 存不了就算了（無痕模式或容量滿）
  }
}

function defaults(): BossPrefs {
  return { server: "xuejila", boss: BOSSES[0].id, room: null, remind: false, device: crypto.randomUUID() };
}

export function loadPrefs(storage: Storage): BossPrefs {
  const d = defaults();
  try {
    const raw = storage.getItem(PREFS_KEY);
    if (!raw) return d;
    const p: unknown = JSON.parse(raw);
    if (typeof p !== "object" || p === null) return d;
    const o = p as Record<string, unknown>;
    return {
      server: SERVERS.some((s) => s.key === o.server) ? (o.server as ServerKey) : d.server,
      boss: BOSSES.some((b) => b.id === o.boss) ? (o.boss as number) : d.boss,
      room: typeof o.room === "string" ? o.room : d.room,
      remind: typeof o.remind === "boolean" ? o.remind : d.remind,
      device: typeof o.device === "string" && o.device ? o.device : d.device,
    };
  } catch {
    return d;
  }
}

export function savePrefs(storage: Storage, prefs: BossPrefs): void {
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 同上
  }
}

/**
 * 已經響過的提醒（放 kill 紀錄的 id）：重新整理後不再響一次。
 * 只留還在紀錄裡（紀錄本身 12 小時就丟）的 id，清單不會一直長。
 */
export function loadFired(storage: Storage, events: BossEvent[]): Set<string> {
  try {
    const raw = storage.getItem(FIRED_KEY);
    if (!raw) return new Set();
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    const alive = new Set(events.map((e) => e.id));
    return new Set(arr.filter((x): x is string => typeof x === "string" && alive.has(x)));
  } catch {
    return new Set();
  }
}

export function saveFired(storage: Storage, fired: Set<string>, events: BossEvent[]): void {
  try {
    const alive = new Set(events.map((e) => e.id));
    storage.setItem(FIRED_KEY, JSON.stringify([...fired].filter((id) => alive.has(id))));
  } catch {
    // 存不了就只記在這一次開著的頁面
  }
}
