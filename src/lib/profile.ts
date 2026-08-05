"use client";

import { useCallback, useEffect, useState } from "react";
import type { Profile } from "./types";

const STORAGE_KEY = "ms-profile";

/** 台服經典版 V001 目前的等級上限。開放三轉時要一起改這裡與 pipeline 的 RELEASE。 */
export const LEVEL_CAP = 100;

const EMPTY: Profile = { level: 0, job: 0 };

function read(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Profile>;
    const level = Number(parsed.level);
    const job = Number(parsed.job);
    return {
      level: Number.isFinite(level) && level > 0 ? Math.min(LEVEL_CAP, Math.floor(level)) : 0,
      job: Number.isFinite(job) && job >= 0 ? Math.floor(job) : 0,
    };
  } catch {
    return EMPTY;
  }
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

  const isComplete = loaded && profile.level > 0;

  return { profile, setProfile, loaded, isComplete };
}
