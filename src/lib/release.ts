"use client";

import { useSyncExternalStore } from "react";

/**
 * V002（三轉、Lv.120、天空之城／冰原雪域／廢礦區）資料已經上線，但要等官方開機公告那天才能玩。
 * 2026-10-06 用戶決定：不用等開機公告自動部署，資料現在就上正式機，畫面上標「10/15 開放」，
 * 到了那天官方開機時刻這支自動回報「已開放」、標示自動消失（pipeline/build.mjs 的 `o` 欄位）。
 * 開機前建置的靜態頁 HTML 裡畫著首頁橫幅，開機後排程會自動重新部署一次（.github/workflows/v002-open.yml）。
 *
 * 開放日出處：官方 V002 公告 https://maplestoryclassic.beanfun.com/bulletin?Bid=83849
 */
export const V002_OPEN_DATE = "2026-10-15";

/**
 * 開放日當天的官方開機時刻（台灣時間）。2026-10-07 用戶決定標示到開機才收，不是 00:00：10/15 凌晨遊戲還是
 * 舊版、早上維護，維護完開機才真的能玩。官方維護公告還沒出來，先用例行維護結束的 14:00；
 * 公告的時間不一樣時，排程（.github/workflows/v002-open.yml）會自動開 PR 改這一行，等用戶確認後合併。
 * 那支排程每次都從 main 讀這裡的 V002_OPEN_DATE＋V002_OPEN_TIME 決定什麼時候重新部署：不要改名、不要搬到別的檔案。
 */
export const V002_OPEN_TIME = "14:00";

/** 開放日那天的官方開機時刻（台灣時間）。目前只有 V002 這一批帶開放日，開機時刻就是 V002_OPEN_TIME */
function openAt(date: string): number {
  return Date.parse(`${date}T${V002_OPEN_TIME}:00+08:00`);
}

/**
 * date 有值、而且現在還沒到那天的開機時刻，才算「還沒開放」。
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

/**
 * 等開放的時候最多隔 5 分鐘醒來對一次時間：電腦睡著時計時器會跟著停，醒來時分頁不一定會觸發
 * visibilitychange（分頁一直在前景），這樣醒來最晚 5 分鐘內收掉；也順便避開 setTimeout 一次最多只能等
 * 約 24.8 天、再久會被當成 0 立刻觸發的上限。
 */
const RECHECK_MS = 5 * 60 * 1000;
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
    timer = setTimeout(waitForOpen, Math.min(openAt(V002_OPEN_DATE) - Date.now(), RECHECK_MS));
    return;
  }
  stop();
  for (const listener of [...listeners]) listener();
}

/**
 * 頁面開著跨過開機時刻時通知（useBeforeV002 的訂閱）。全站共用一個計時器，清單、細節卡、首頁
 * 各處在同一次通知裡收到，React 同一格一起重畫，標示一起消失，不用重新整理。
 * 電腦睡著、背景分頁的計時器會停住：切回這個分頁時馬上再對一次時間，分頁一直在前景的話醒來最晚
 * 5 分鐘內（RECHECK_MS）。回傳取消訂閱。
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
 * MAPLEBOOK_BUILD_TIME 是 next.config.mjs 建置時寫死進程式的時間；沒有（沒經過 next 建置）就當作已經開放，
 * 不拿「現在」算——伺服器的現在跟使用者瀏覽器的現在不是同一個時間，跨過開機時刻就會對不上。
 */
function beforeV002AtBuild(): boolean {
  const built = process.env.MAPLEBOOK_BUILD_TIME;
  return built ? beforeV002(Number(built)) : false;
}

/**
 * beforeV002() 的畫面版本，第一個畫面就判斷好：
 * - 瀏覽器端畫的（站內換頁、資料載完才畫的清單）：直接用瀏覽器當下時間，「10/15 開放」第一格就在。
 * - 伺服器渲染跟 hydration：用建置當下的結果。開機前建置的靜態頁本來就畫好標示；開機後才打開
 *   舊建置的頁面，hydration 完 React 發現跟當下時間不一樣，馬上補畫一次收掉，不會有 hydration 警告
 *   （首頁橫幅會先閃一下，所以開機後排程會自動重新部署一次）。
 * - 頁面開著跨過開機時刻：onV002Open 通知，所有標示同一格一起收掉。
 */
export function useBeforeV002(): boolean {
  return useSyncExternalStore(onV002Open, beforeV002, beforeV002AtBuild);
}
