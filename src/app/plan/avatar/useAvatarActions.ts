"use client";

/**
 * 紙娃娃的「下載」「分享」：角色卡跟捲下去的小窗按的是同一份（AvatarSim 呼叫一次、往下傳），
 * 提示條（toast）也只由 AvatarSim 畫一次；挑衣服卡要跳提示也用這裡的 showToast（2 秒）。
 *
 *   const { download, share, downloading, toast, showToast } = useAvatarActions(outfit, data);
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import type { Outfit } from "@/lib/avatar/outfit";
import { characterUrl } from "@/lib/avatar/render";
import type { AvatarData } from "@/lib/avatar/types";
import { LOAD_ERROR, LOAD_TIMEOUT_MS } from "./Stage";

const TOAST_MS = 2_000;

export function useAvatarActions(outfit: Outfit | null, data: AvatarData | null) {
  const [toast, setToast] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  // 連點兩下只存一張（state 要等下一次畫面才更新，擋不住同一瞬間的第二下）
  const busy = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const showToast = useCallback((text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  /** 存第 0 格、2 倍、裁剛好（renderMode=0）的透明 PNG */
  const download = useCallback(async () => {
    if (!outfit || !data || busy.current) return;
    busy.current = true;
    setDownloading(true);
    try {
      // 不能拿快取：舞台的 <img> 載過的圖是沒帶 Origin 要的，maplestory.io 只在有 Origin 時才回
      // access-control-allow-origin（也沒寫 Vary: Origin），直接吃快取會被當跨網域擋掉（11/03 實測）
      const res = await fetch(characterUrl(outfit, data, { frame: 0, resize: 2 }), {
        cache: "reload",
        signal: AbortSignal.timeout(LOAD_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(LOAD_ERROR);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "紙娃娃.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // 馬上收回網址，有些瀏覽器會來不及開始存
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
      track("avatar_download", { gender: outfit.g ? "女" : "男" });
    } catch {
      showToast(LOAD_ERROR);
    } finally {
      busy.current = false;
      setDownloading(false);
    }
  }, [outfit, data, showToast]);

  /** 有系統分享就用它（使用者自己關掉不算錯），沒有就複製網址 */
  const share = useCallback(async () => {
    const url = location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "紙娃娃", url });
        track("share", { page: "avatar", method: "share" });
        return;
      } catch (e) {
        // 使用者關掉分享視窗：什麼都不做；其他錯（瀏覽器不讓分享）改複製連結
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      track("share", { page: "avatar", method: "copy_link" });
      showToast("已複製連結");
    } catch {
      showToast("複製不了，請直接複製網址列的網址");
    }
  }, [showToast]);

  return { download, share, downloading, toast, showToast };
}
