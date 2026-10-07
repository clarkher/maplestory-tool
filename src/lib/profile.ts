"use client";

import { useSyncExternalStore } from "react";
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

/*
 * 所有頁共用同一份角色：角色列改了，同一個分頁所有用到角色的地方立刻跟著換。
 * 同一個分頁寫 localStorage 不會觸發 storage 事件，所以存的時候自己通知；別的分頁改了才靠 storage 事件。
 */
const listeners = new Set<() => void>();
/**
 * 瀏覽器不讓存（空間滿了、隱私模式）時先記在這個分頁：畫面照樣換，只是重新整理後不會記得。
 * over 是當時本機存的那份；之後別的分頁改掉了本機存的，就以那份為準。
 */
let unsaved: { raw: string; over: string } | null = null;
let lastRaw: string | null = null;
let lastProfile: Profile = EMPTY;

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

/** 現在的角色（不可能的組合已經修正）。存的字沒變就回傳同一份，React 才不會一直重畫 */
export function readProfile(): Profile {
  const raw = readRaw();
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastProfile = parseStoredProfile(raw);
  }
  return lastProfile;
}

export function subscribeProfile(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * 存角色並通知這個分頁所有用到角色的地方。讀回來一律經過 parseStoredProfile，
 * 不可能的組合會被修正（狂戰士 25 等讀出來是劍士），所以存進去的跟讀到的不一定一樣——
 * 角色列、表單送出的都已經是合法組合，不要送「先選職業、等級還沒調」這種中間狀態進來。
 */
export function saveProfile(next: Profile) {
  const raw = JSON.stringify(next);
  const over = storedRaw();
  try {
    localStorage.setItem(STORAGE_KEY, raw);
    unsaved = null;
  } catch {
    unsaved = { raw, over };
  }
  for (const listener of [...listeners]) listener();
}

const unknownOnServer = () => null;

/**
 * 不等 effect、同步讀本機存的角色（只讀不寫）。站內換頁時第一個畫面就有角色，不先閃「讀取你的角色…」；
 * 查資料頁按返回時，第一個畫面就套上「只看〇〇能用的裝備」，清單才會跟離開時一樣、捲得回原處。
 * 伺服器上讀不到，當作還沒讀（硬重新整理那一下還是會先畫讀取中）。
 */
export function useStoredProfile() {
  const stored = useSyncExternalStore(subscribeProfile, readProfile, unknownOnServer);
  const loaded = stored !== null;
  const profile = stored ?? EMPTY;
  return { profile, loaded, isComplete: loaded && profile.level > 0 && profile.job >= 0 };
}

/**
 * 等級與職業記在本機，玩家不用每次進來重填。
 * 沒有帳號、也不會送到伺服器（任務頁「我做完了」打勾的任務也記在這台裝置，見 done-quests.ts）。
 */
export function useProfile() {
  return { ...useStoredProfile(), setProfile: saveProfile };
}
