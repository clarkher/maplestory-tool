"use client";

import { useEffect } from "react";
import { AD_UNITS, ADSENSE_CLIENT, adsEnabledFor, type AdUnit } from "@/lib/ads";

const SCRIPT_ID = "adsense-script";

/** 第一格就留好固定高度，廣告晚到畫面也不跳；畫面出來後才載，不擋第一格。 */
export function AdSlot({ unit }: { unit: AdUnit }) {
  const slot = AD_UNITS[unit];

  useEffect(() => {
    if (!slot || !adsEnabledFor(window.location.hostname, ADSENSE_CLIENT)) return;
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
      document.body.appendChild(script);
    }
    const w = window as unknown as { adsbygoogle?: unknown[] };
    (w.adsbygoogle = w.adsbygoogle || []).push({});
  }, [slot]);

  if (!ADSENSE_CLIENT || !slot) return null;
  return (
    <aside aria-label="廣告" className="space-y-1">
      <p className="text-center text-[12px] ink-faint">廣告</p>
      <ins
        className="adsbygoogle block h-[280px] w-full overflow-hidden md:h-[250px]"
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
      />
    </aside>
  );
}
