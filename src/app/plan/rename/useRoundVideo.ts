"use client";

/**
 * 這一輪的影片：round 有了就在背後開始錄（src/lib/rename/round-video.ts），換一輪、離開頁面就不錄了。
 * 回 null＝沒有要錄（沒有這一輪、這台錄不了）。影片 720×1280，用演出的 drawStage（caption: true，片尾帶站名網址）畫。
 */
import { useEffect, useState } from "react";
import { monsterImage } from "@/lib/asset-paths";
import { startRoundVideo, type VideoState } from "@/lib/rename/round-video";
import { canRecordVideo, recordVideo, VIDEO } from "@/lib/rename/share";
import { drawStage } from "@/lib/rename/stage";
import type { ShareRound } from "./ShareMenu";

/** 怪圖載好（或載不到）才往下；最多等 4 秒 */
export function loadMob(id: number): Promise<HTMLImageElement | undefined> {
  return new Promise(resolve => {
    const img = new Image();
    const t = setTimeout(() => resolve(undefined), 4000);
    img.onload = () => {
      clearTimeout(t);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(t);
      resolve(undefined);
    };
    img.src = monsterImage(id);
  });
}

async function record({ segs, result, shape }: ShareRound, signal: AbortSignal): Promise<Blob | null> {
  const kept = result.kind === "monster" ? result.kept : [];
  const mob = result.kind === "monster" ? await loadMob(result.id) : undefined;
  // 怪圖載不到：不給沒有怪的影片，主按鈕改「傳給朋友」
  if (result.kind === "monster" && !mob) return null;
  const c = document.createElement("canvas");
  c.width = VIDEO.w;
  c.height = VIDEO.h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  return recordVideo(c, ms => drawStage(ctx, { w: VIDEO.w, h: VIDEO.h, segs, kept, result, mob, shape, ms, caption: true }), signal);
}

export function useRoundVideo(round: ShareRound | null): VideoState | null {
  const [got, setGot] = useState<{ round: ShareRound; video: VideoState } | null>(null);
  useEffect(() => {
    if (!round || !canRecordVideo()) return;
    return startRoundVideo({
      record: signal => record(round, signal),
      hidden: () => document.hidden,
      watch: cb => {
        document.addEventListener("visibilitychange", cb);
        return () => document.removeEventListener("visibilitychange", cb);
      },
      onState: video => setGot({ round, video }),
    });
  }, [round]);
  // 上一輪的影片不算這一輪的
  return got && got.round === round ? got.video : null;
}
