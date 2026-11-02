"use client";

import { useSyncExternalStore } from "react";
import { shopOpen } from "@/lib/item-view";

const noSubscribe = () => () => {};

/**
 * 活動店的列：靜態頁是建置時畫的，活動結束後不一定會重建，所以瀏覽器打開時再看一次，過了結束時間就不畫。
 * 伺服器先當作還開著（建置時已經把過期的拿掉了）。
 */
export function OpenUntil({ end, children }: { end: string; children: React.ReactNode }) {
  const open = useSyncExternalStore(noSubscribe, () => shopOpen({ e: end }), () => true);
  return open ? children : null;
}
