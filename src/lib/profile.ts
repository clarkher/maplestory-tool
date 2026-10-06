"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { consistentJob } from "./jobs";
import type { Profile } from "./types";

const STORAGE_KEY = "ms-profile";

/** 台服經典版 V002 的等級上限（2026-10-15 起）。開放新內容時要一起改這裡與 pipeline/build.mjs 的 RELEASE（含 mapRegions）。 */
export const LEVEL_CAP = 120;

/** job -1：還沒選職業（不要預選初心者，免得先填等級的人看到初心者的結果） */
const EMPTY: Profile = { level: 0, job: -1 };

/** 本機存的角色字串轉成角色；沒存過、存壞了都當作還沒選 */
export function parseStoredProfile(raw: string): Profile {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Partial<Profile>;
    const level = Number(parsed.level);
    const job = Number(parsed.job);
    const fixedLevel = Number.isFinite(level) && level > 0 ? Math.min(LEVEL_CAP, Math.floor(level)) : 0;
    const rawJob = Number.isFinite(job) && job >= 0 ? Math.floor(job) : -1;
    return { level: fixedLevel, job: consistentJob(rawJob, fixedLevel) };
  } catch {
    return EMPTY;
  }
}

function readRaw(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function read(): Profile {
  return parseStoredProfile(readRaw());
}

function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

const unknownOnServer = () => null;

/**
 * 不等 effect、同步讀本機存的角色（只讀不寫）。查資料頁按返回時，第一個畫面就要套上
 * 「只看〇〇能用的裝備」，清單才會跟離開時一樣、捲得回原處。伺服器上讀不到，當作還沒讀。
 */
export function useStoredProfile() {
  const raw = useSyncExternalStore(subscribeStorage, readRaw, unknownOnServer);
  const profile = useMemo(() => (raw === null ? EMPTY : parseStoredProfile(raw)), [raw]);
  const loaded = raw !== null;
  return { profile, loaded, isComplete: loaded && profile.level > 0 && profile.job >= 0 };
}

/**
 * 等級與職業記在本機，玩家不用每次進來重填。
 * 這是唯一存在瀏覽器的個人資料，沒有帳號、也不會送到伺服器。
 */
export function useProfile() {
  const [profile, setProfileState] = useState<Profile>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setProfileState(read());
    setLoaded(true);
  }, []);

  const setProfile = useCallback((next: Profile) => {
    setProfileState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 停用本機儲存時仍可使用，只是不會被記住
    }
  }, []);

  const isComplete = loaded && profile.level > 0 && profile.job >= 0;

  return { profile, setProfile, loaded, isComplete };
}
