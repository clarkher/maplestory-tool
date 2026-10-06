"use client";

import { useEffect, useState } from "react";

/**
 * V002（三轉、Lv.120、天空之城／冰原雪域／廢礦區）資料已經上線，但要等官方開機公告那天才能玩。
 * 2026-10-06 用戶決定：不用等開機公告自動部署，資料現在就上正式機，畫面上標「10/15 開放」，
 * 過了那天這支自動回報「已開放」、標示自動消失，不用再重新部署（pipeline/build.mjs 的 `o` 欄位）。
 *
 * 開放日出處：官方 V002 公告 https://maplestoryclassic.beanfun.com/bulletin?Bid=83849
 */
export const V002_OPEN_DATE = "2026-10-15";

/**
 * date 有值、而且現在還沒到那天台灣時間 00:00，才算「還沒開放」。
 * 沒有日期代表不是這次新開放的內容，一律當作已經開放。
 */
export function opensOn(date: string | undefined, now: number = Date.now()): boolean {
  if (!date) return false;
  return now < Date.parse(`${date}T00:00:00+08:00`);
}

/** V002 新內容現在算不算還沒開放：地圖上的「10/15 開放」標示、三轉選單的提示都靠它自動收掉。 */
export function beforeV002(now: number = Date.now()): boolean {
  return opensOn(V002_OPEN_DATE, now);
}

/**
 * beforeV002() 的畫面版本：這個站是靜態頁面，HTML 是建置當下算好的，使用者打開時的時間一定比
 * 建置時間晚——畫面上第一次渲染若直接呼叫 beforeV002()，建置當下跟使用者瀏覽器當下兩個時間
 * 一旦跨過 10/15 就會兜不起來（hydration mismatch）。所以第一次一律當作「已經開放」（不顯示標示），
 * 掛載後才用瀏覽器當下時間重算一次，跟 useProfile 的 loaded 同一招。
 * 10/15 一到，使用者不用重新整理，下一次重渲染就會自動收掉標示。
 */
export function useBeforeV002(): boolean {
  const [value, setValue] = useState(false);
  useEffect(() => setValue(beforeV002()), []);
  return value;
}
