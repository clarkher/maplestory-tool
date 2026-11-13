"use client";

import { useEffect } from "react";
import { GA_ID, GA_OFF_KEY, gaEnabledFor, gaOptOut, linkClick, track } from "@/lib/analytics";

/** 讀、寫「這台不送 GA」；localStorage 被擋（無痕、關掉網站資料）當沒設 */
function optedOut(search: string): boolean {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(GA_OFF_KEY);
  } catch {}
  const off = gaOptOut(search, stored);
  if (new URLSearchParams(search).has("ga_off")) {
    try {
      if (off) localStorage.setItem(GA_OFF_KEY, "1");
      else localStorage.removeItem(GA_OFF_KEY);
    } catch {}
  }
  return off;
}

/**
 * 畫面出來後才載 GA，不擋第一格；只有正式網域（或網址帶 ?ga_debug=1）才載，測試機不灌假流量。
 * v2.08 自己人不算：無頭 Chrome 驗收（navigator.webdriver，帶 ?ga_debug=1 照送）、開過一次 ?ga_off=1 的瀏覽器都不載。
 * 也在整頁聽點擊：連結標 data-ga（SeoPage 工具按鈕、查資料卡片連單獨頁、贊助連結帶 data-placement）就送 linkClick 那筆事件。
 */
export function GoogleAnalytics() {
  useEffect(() => {
    const { hostname, search } = window.location;
    if (!gaEnabledFor(hostname, search) || optedOut(search)) return;
    if (navigator.webdriver && !new URLSearchParams(search).has("ga_debug")) return;
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[data-ga]");
      if (!(link instanceof HTMLAnchorElement)) return;
      const hit = linkClick(link.dataset.ga, window.location.pathname, link.getAttribute("href") ?? "", link.textContent ?? "", link.dataset.placement);
      if (hit) track(hit.name, hit.params);
    };
    document.addEventListener("click", onClick, true);
    const w = window as unknown as { dataLayer: unknown[]; gtag: (...args: unknown[]) => void };
    if (typeof w.gtag === "function") return () => document.removeEventListener("click", onClick, true);
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag() {
      // gtag 要收 arguments 物件本身，不能展開成陣列
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer.push(arguments);
    };
    w.gtag("js", new Date());
    w.gtag("config", GA_ID, window.location.hostname === "maplehelper.tw" ? {} : { debug_mode: true });
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.body.appendChild(script);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
