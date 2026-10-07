"use client";

import { useSyncExternalStore } from "react";

/**
 * V002（三轉、Lv.120、天空之城／冰原雪域／廢礦區）資料已經上線，但要等官方開機公告那天才能玩。
 * 2026-10-06 用戶決定：不用等開機公告自動部署，資料現在就上正式機，畫面上標「10/15 開放」，
 * 過了那天這支自動回報「已開放」、標示自動消失，不用再重新部署（pipeline/build.mjs 的 `o` 欄位）。
 *
 * 開放日出處：官方 V002 公告 https://maplestoryclassic.beanfun.com/bulletin?Bid=83849
 */
export const V002_OPEN_DATE = "2026-10-15";

/** 開放日那天台灣時間 00:00 */
function openAt(date: string): number {
  return Date.parse(`${date}T00:00:00+08:00`);
}

/**
 * date 有值、而且現在還沒到那天台灣時間 00:00，才算「還沒開放」。
 * 沒有日期代表不是這次新開放的內容，一律當作已經開放。
 */
export function opensOn(date: string | undefined, now: number = Date.now()): boolean {
  if (!date) return false;
  return now < openAt(date);
}

/** V002 新內容現在算不算還沒開放：地圖上的「10/15 開放」標示、三轉選單的提示都靠它自動收掉。 */
export function beforeV002(now: number = Date.now()): boolean {
  return opensOn(V002_OPEN_DATE, now);
}

/** setTimeout 一次最多等 2^31-1 毫秒（約 24.8 天），再久會被當成 0 立刻觸發，所以要分段等 */
const MAX_TIMER = 2 ** 31 - 1;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

function stop() {
  clearTimeout(timer);
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", waitForOpen);
}

/** 還沒到開放那一刻就（重新）排計時器等；到了就收工，一次通知所有畫面 */
function waitForOpen() {
  clearTimeout(timer);
  if (beforeV002()) {
    timer = setTimeout(waitForOpen, Math.min(openAt(V002_OPEN_DATE) - Date.now(), MAX_TIMER));
    return;
  }
  stop();
  for (const listener of [...listeners]) listener();
}

/**
 * 頁面開著跨過 10/15 00:00 時通知（useBeforeV002 的訂閱）。全站共用一個計時器，清單、細節卡、首頁
 * 各處在同一次通知裡收到，React 同一格一起重畫，標示一起消失，不用重新整理。
 * 電腦睡著、背景分頁的計時器會停住，所以切回這個分頁時也再對一次時間。回傳取消訂閱。
 */
export function onV002Open(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && beforeV002()) {
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", waitForOpen);
    waitForOpen();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

/**
 * 建置當下算不算還沒開放：伺服器渲染（建置靜態頁）跟瀏覽器 hydration 都用它，兩邊一定一樣。
 * BUILD_TIME 是 next.config.mjs 建置時寫死進程式的時間；沒有（沒經過 next 建置）就當作已經開放，
 * 不拿「現在」算——伺服器的現在跟使用者瀏覽器的現在不是同一個時間，跨過 10/15 就會對不上。
 */
function beforeV002AtBuild(): boolean {
  const built = process.env.BUILD_TIME;
  return built ? beforeV002(Number(built)) : false;
}

/**
 * beforeV002() 的畫面版本，第一個畫面就判斷好：
 * - 瀏覽器端畫的（站內換頁、資料載完才畫的清單）：直接用瀏覽器當下時間，「10/15 開放」第一格就在。
 * - 伺服器渲染跟 hydration：用建置當下的結果。10/15 前建置的靜態頁本來就畫好標示；10/15 後才打開
 *   舊建置的頁面，hydration 完 React 發現跟當下時間不一樣，馬上補畫一次收掉，不會有 hydration 警告。
 * - 頁面開著跨過 10/15 00:00：onV002Open 通知，所有標示同一格一起收掉。
 */
export function useBeforeV002(): boolean {
  return useSyncExternalStore(onV002Open, beforeV002, beforeV002AtBuild);
}
