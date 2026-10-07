"use client";

import { jumpWhenRestoring } from "@/lib/history-scroll";

// 一載入就裝好，不等畫面出來：第一次按上一頁就有效。
// 重新整理、整頁重載的返回，<head> 已經先關掉平滑捲動（restoreScrollBootstrap），等使用者第一次自己操作再恢復
if (typeof window !== "undefined") {
  const root = document.documentElement;
  jumpWhenRestoring(window, root, { restoring: root.style.scrollBehavior === "auto" });
}

/** 掛在 layout，每一頁都會載到上面那段：瀏覽器還原捲動位置時直接跳，不從頂端一路滑過去 */
export function HistoryScrollJump() {
  return null;
}
