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

/**
 * 逾時就中斷的 signal。AbortSignal.timeout 舊 iPhone（Safari 15 以前）沒有，沒有就退回 AbortController＋setTimeout；
 * 用完一定要呼叫 done() 收掉計時器（AbortSignal.timeout 那條不用收，done 什麼都不做）
 */
function timeoutSignal(ms: number): { signal: AbortSignal; done: () => void } {
  if (typeof AbortSignal.timeout === "function") return { signal: AbortSignal.timeout(ms), done: () => {} };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

/** 手指操作的裝置（手機、平板）才跳系統分享；電腦一律複製連結（跟練功測速一樣看 pointer: coarse） */
function touchDevice(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

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

  /** 存第 0 格、4 倍、裁剛好（renderMode=0）的透明 PNG */
  const download = useCallback(async () => {
    if (!outfit || !data || busy.current) return;
    busy.current = true;
    setDownloading(true);
    // 逾時算到圖整張讀完（blob），所以計時器在 finally 才收
    const timeout = timeoutSignal(LOAD_TIMEOUT_MS);
    try {
      // 不能拿快取：快取裡可能是沒帶 Origin 要的版本，maplestory.io 只在有 Origin 時才回
      // access-control-allow-origin（也沒寫 Vary: Origin），直接吃快取會被當跨網域擋掉（11/03 實測）
      const res = await fetch(characterUrl(outfit, data, { frame: 0, resize: 4 }), {
        cache: "reload",
        signal: timeout.signal,
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
      timeout.done();
      busy.current = false;
      setDownloading(false);
    }
  }, [outfit, data, showToast]);

  /** 手機、平板有系統分享就用它（使用者自己關掉不算錯）；電腦、或沒有系統分享就複製網址 */
  const share = useCallback(async () => {
    const url = location.href;
    if (touchDevice() && typeof navigator.share === "function") {
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
