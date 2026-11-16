"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import { coverSrc } from "@/lib/videos";

/**
 * 影片區的播放器（v2.32）：先放站上自己的封面，點了才換成 YouTube 隱私加強模式（youtube-nocookie.com）的播放器。
 * 點之前不連 Google；框的比例先固定（正片 16:9、短影音 9:16），換播放器版面不跳。
 */
export function VideoPlayer({ id, title, kind, page }: { id: string; title: string; kind: "main" | "shorts"; page: string }) {
  const [playing, setPlaying] = useState(false);
  const box = kind === "main" ? "aspect-video" : "aspect-[9/16]";
  return (
    <div className={`relative w-full overflow-hidden rounded-[var(--radius-card)] bg-black ${box}`}>
      {playing ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          className="group absolute inset-0 h-full w-full"
          aria-label={`播放：${title}`}
          onClick={() => {
            setPlaying(true);
            track("video_play", { kind, id, page });
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 全站靜態輸出，不走 next/image */}
          <img src={coverSrc(id)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" width={kind === "main" ? 640 : 360} height={kind === "main" ? 360 : 640} />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-black/65 transition-transform group-hover:scale-110 group-focus-visible:scale-110">
              <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
                {/* 黑底半透明圓上的白色三角，不是實心橘按鈕，不用 --on-accent */}
                <path d="M8 5.5v13l11-6.5z" fill="white" />
              </svg>
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
