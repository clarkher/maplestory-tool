"use client";

import { useEffect } from "react";
import { GA_ID, gaEnabledFor } from "@/lib/analytics";

/** 畫面出來後才載 GA，不擋第一格；只有正式網域（或網址帶 ?ga_debug=1）才載，測試機不灌假流量。 */
export function GoogleAnalytics() {
  useEffect(() => {
    if (!gaEnabledFor(window.location.hostname, window.location.search)) return;
    const w = window as unknown as { dataLayer: unknown[]; gtag: (...args: unknown[]) => void };
    if (typeof w.gtag === "function") return;
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
  }, []);
  return null;
}
