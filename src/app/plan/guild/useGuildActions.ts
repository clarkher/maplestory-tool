"use client";

/**
 * 公會徽章的「下載」「分享」跟提示條（2 秒）。
 *
 *   const { download, share, toast } = useGuildActions(badge);
 *
 * 下載：圖集同網域，先在背景載好；按下去在 68×68 canvas 不抹糊、底圖再圖案各畫 4 倍，存 公會徽章.png。
 * 分享：手機、平板跳系統分享，電腦（或沒有系統分享）複製目前網址。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import marksJson from "@/lib/guild-mark/marks.json";
import { type Badge, type MarkEntry, bgEntry, centreShift, markEntry } from "@/lib/guild-mark/badge";

const TOAST_MS = 2_000;
const CELL = 17;
const OUT = CELL * 4;

/** 手指操作的裝置（手機、平板）才跳系統分享；電腦一律複製連結（跟紙娃娃一樣看 pointer: coarse） */
function touchDevice(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

export function useGuildActions(badge: Badge) {
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const atlas = useRef<HTMLImageElement | null>(null);
  const atlasFailed = useRef(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      atlas.current = img;
    };
    img.onerror = () => {
      atlasFailed.current = true;
    };
    img.src = marksJson.atlas;
    return () => {
      img.onload = null;
      img.onerror = null;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = useCallback((text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const download = useCallback(() => {
    const img = atlas.current;
    if (!img) {
      showToast(atlasFailed.current ? "圖載不到，重新整理再試一次" : "圖還沒載好，等一下再按");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      showToast("下載不了，請再試一次");
      return;
    }
    ctx.imageSmoothingEnabled = false;
    // 跟畫面一樣：底圖、圖案各自置中（centreShift，4 倍）
    const layers: [MarkEntry | null | undefined, number][] = [
      [bgEntry(badge.b), badge.bc],
      [markEntry(badge.m)?.entry, badge.mc],
    ];
    for (const [e, c] of layers) {
      if (!e) continue;
      const s = centreShift([e.box], 4);
      ctx.drawImage(img, (c - 1) * CELL, e.row * CELL, CELL, CELL, s.x, s.y, OUT, OUT);
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        showToast("下載不了，請再試一次");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "公會徽章.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // 馬上收回網址，有些瀏覽器會來不及開始存
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
      track("guild_download");
    }, "image/png");
  }, [badge, showToast]);

  const share = useCallback(async () => {
    const url = location.href;
    if (touchDevice() && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "公會徽章", url });
        track("share", { page: "guild", method: "share" });
        return;
      } catch (e) {
        // 使用者關掉分享視窗：什麼都不做；其他錯改複製連結
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      track("share", { page: "guild", method: "copy_link" });
      showToast("已複製連結");
    } catch {
      showToast("複製不了，請直接複製網址列的網址");
    }
  }, [showToast]);

  return { download, share, toast };
}
