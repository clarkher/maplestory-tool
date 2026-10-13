// src/lib/speed/settings.ts
"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 存在這台電腦（localStorage）：
 * - 角色 ID、排行顯不顯示 ID（預設不顯示）、自動／手動
 * - 組隊：玩家自己填的（on＝有沒有開、others＝其他隊員的等級、hitter＝誰在打：0＝自己，1～＝others 的第幾位）
 */
export type SpeedParty = { on: boolean; others: number[]; hitter: number };
export type SpeedSettings = { charId: string; isPublic: boolean; mode: "auto" | "manual"; party: SpeedParty };
export const DEFAULT_SETTINGS: SpeedSettings = { charId: "", isPublic: false, mode: "auto", party: { on: false, others: [], hitter: 0 } };

const KEY = "ms-speed";
const MAP_KEY = "ms-speed-maps";
/** 隊伍最多 6 人：自己＋其他 5 人；等級 1～120 */
const MAX_OTHERS = 5;
const MAX_LEVEL = 120;

function defaults(): SpeedSettings {
  return { ...DEFAULT_SETTINGS, party: { ...DEFAULT_SETTINGS.party, others: [] } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 組隊欄位逐項驗：壞的那項換預設，不拖累其他項 */
function parseParty(value: unknown): SpeedParty {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS.party, others: [] };
  const others = Array.isArray(value.others)
    ? value.others.filter((level): level is number => Number.isInteger(level) && (level as number) >= 1 && (level as number) <= MAX_LEVEL).slice(0, MAX_OTHERS)
    : [];
  const hitter = value.hitter;
  return {
    on: value.on === true,
    others,
    hitter: typeof hitter === "number" && Number.isInteger(hitter) && hitter >= 0 && hitter <= others.length ? hitter : 0,
  };
}

export function parseSettings(raw: string | null): SpeedSettings {
  if (!raw) return defaults();
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return defaults();
    return {
      charId: typeof value.charId === "string" ? value.charId : "",
      isPublic: value.isPublic === true,
      mode: value.mode === "manual" ? "manual" : "auto",
      party: parseParty(value.party),
    };
  } catch {
    return defaults();
  }
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 瀏覽器不讓存（隱私模式、空間滿了）：這次照樣能用，只是下次要重填
  }
}

/** 伺服器上跟第一次畫面都用預設（不會跟伺服器畫的對不起來），掛上去後才換成存的 */
export function useSpeedSettings(): [SpeedSettings, (next: SpeedSettings) => void, boolean] {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setSettings(parseSettings(read(KEY)));
    setLoaded(true);
  }, []);
  const save = useCallback((next: SpeedSettings) => {
    setSettings(next);
    write(KEY, JSON.stringify(next));
  }, []);
  return [settings, save, loaded];
}

/**
 * 玩家點選過「這個標題長相是哪張圖」：下次直接認（只記在這台電腦）。
 * 這裡只原樣存取（signature → 地圖 id）；差一點點也認的容錯比對在 read-map.ts。
 * 存壞的值（不是物件、值不是整數）濾掉，不把髒資料丟給比對。
 */
export function readMapMemory(): Record<string, number> {
  try {
    const value: unknown = JSON.parse(read(MAP_KEY) ?? "{}");
    if (!isRecord(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => Number.isSafeInteger(entry[1])));
  } catch {
    return {};
  }
}

export function rememberMap(signature: string, mapId: number) {
  write(MAP_KEY, JSON.stringify({ ...readMapMemory(), [signature]: mapId }));
}
