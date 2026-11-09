"use client";

/**
 * 公會徽章模擬器：上面徽章卡（大圖、遊戲裡實際大小、隨機／下載／分享），下面挑選卡（底圖／圖案兩分頁）。
 * 狀態從網址開場（parseBadge），之後放在這裡；每次換東西用 replaceState(null, …) 改網址（傳 null 原因見 avatar/AvatarSim writeUrl）。
 * wanted＝使用者想要的圖案顏色：換到沒有那色的圖案時暫時畫第一色，換回有那色的圖案再變回來；網址只存實際畫的色。
 */
import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { track } from "@/lib/analytics";
import { type Badge, type Category, badgeQuery, markEntry, parseBadge, randomBadge } from "@/lib/guild-mark/badge";
import { BadgeCard } from "./BadgeCard";
import { Picker, type GuildTab } from "./Picker";
import { useGuildActions } from "./useGuildActions";

const PATH = "/plan/guild";

export function GuildSim() {
  const params = useSearchParams();
  const [badge, setBadge] = useState<Badge>(() => parseBadge(new URLSearchParams(params.toString())));
  const [wanted, setWanted] = useState(badge.mc);
  const [tab, setTab] = useState<GuildTab>("bg");
  const [cat, setCat] = useState<Category>(() => markEntry(badge.m)?.category ?? "Animal");
  const { download, share, toast } = useGuildActions(badge);

  const change = useCallback((next: Badge) => {
    setBadge(next);
    window.history.replaceState(null, "", `${PATH}?${badgeQuery(next)}`);
  }, []);

  const random = useCallback(() => {
    const next = randomBadge();
    setWanted(next.mc);
    setCat(markEntry(next.m)?.category ?? "Animal");
    change(next);
    track("guild_random");
  }, [change]);

  const pickWanted = useCallback(
    (mc: number) => {
      setWanted(mc);
      change({ ...badge, mc });
    },
    [badge, change],
  );

  return (
    <>
      <BadgeCard badge={badge} onRandom={random} onDownload={download} onShare={share} />
      <Picker
        badge={badge}
        wanted={wanted}
        tab={tab}
        onTab={setTab}
        cat={cat}
        onCat={setCat}
        onChange={change}
        onWanted={pickWanted}
      />
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        {toast ? (
          <div className="flex min-h-11 items-center rounded-md bg-[color:var(--ink)] px-4 text-[14px] font-bold text-[color:var(--paper)] shadow-lg">
            {toast}
          </div>
        ) : null}
      </div>
    </>
  );
}
