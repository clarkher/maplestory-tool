"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { prefetchHome, shouldPrefetchHome, type ConnectionHint } from "@/lib/home-data";
import { readProfile } from "@/lib/profile";

/**
 * 人在查資料、規劃頁時，等頁面閒下來就在背景先載首頁要的（home-data 的 prefetchHome）：直接從查資料頁進站的人，
 * 之後點「我的路線」第一格也是完整路線。掛在根 layout、不畫任何東西；省流量模式、2G 網路不載（shouldPrefetchHome）。
 */
export function HomePrefetch() {
  const pathname = usePathname();
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: ConnectionHint }).connection ?? {};
    if (!shouldPrefetchHome(pathname, connection)) return;
    const run = () => void prefetchHome(readProfile().job);
    // 等這一頁自己的東西先載、先畫（Safari 沒有 requestIdleCallback，改等 1.5 秒）
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(run, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 1500);
    return () => window.clearTimeout(id);
  }, [pathname]);
  return null;
}
