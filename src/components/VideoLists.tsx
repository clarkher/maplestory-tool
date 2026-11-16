"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VideoPlayer } from "@/components/VideoPlayer";
import { visibleEpisodes, type VideoEpisode } from "@/lib/videos";

/**
 * 影片區的兩種列表（v2.32）。建置時先照建置時間篩一次（畫面第一格就有），
 * 掛上後改用現在時間重篩：排程公開的片到時間自己出現，不用重新部署。
 */
export function useVisibleEpisodes(builtAt: number): VideoEpisode[] {
  const [now, setNow] = useState(builtAt);
  useEffect(() => setNow(Date.now()), []);
  return visibleEpisodes(now);
}

const md = (iso: string) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" }).format(new Date(iso));

function ToolLink({ ep }: { ep: VideoEpisode }) {
  if (!ep.tool) return null;
  return (
    <Link href={ep.tool.href} className="text-[13px] font-bold text-[color:var(--sky)] underline underline-offset-4">
      打開{ep.tool.text}
    </Link>
  );
}

/** 短影音一排（橫著滑）；limit 給攻略專區只放前幾支 */
export function ShortsRow({ builtAt, page, limit }: { builtAt: number; page: string; limit?: number }) {
  const list = useVisibleEpisodes(builtAt).filter(ep => ep.shorts).slice(0, limit);
  if (!list.length) return null;
  return (
    <ul className="scroll-x -mx-1 flex gap-3 px-1 pb-2">
      {list.map(ep => (
        <li key={ep.shorts} className="w-[44%] shrink-0 space-y-1.5 sm:w-48">
          <VideoPlayer id={ep.shorts!} title={ep.title} kind="shorts" page={page} />
          <p className="text-[14px] font-bold leading-snug">{ep.title}</p>
          <ToolLink ep={ep} />
        </li>
      ))}
    </ul>
  );
}

/** 正片一格一格 */
export function MainGrid({ builtAt }: { builtAt: number }) {
  const list = useVisibleEpisodes(builtAt).filter(ep => ep.main);
  if (!list.length) return null;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map(ep => (
        <li key={ep.main} className="space-y-1.5">
          <VideoPlayer id={ep.main!} title={ep.title} kind="main" page="videos" />
          <p className="text-[12px] ink-faint">{md(ep.publishAt)}</p>
          <p className="font-bold leading-snug">{ep.title}</p>
          <p className="text-[13px] leading-snug ink-soft">{ep.summary}</p>
          <ToolLink ep={ep} />
        </li>
      ))}
    </ul>
  );
}
