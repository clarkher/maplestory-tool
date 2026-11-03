"use client";

/**
 * 紙娃娃的舞台：只管把這套穿搭畫出來（maplestory.io 即時畫的透明 PNG）。
 * - 換穿搭停 250ms 才去要新圖；新圖用 new Image() 先載好才換上，舊圖留著不閃白，載的時候角落一個小轉圈
 * - 多格動作（站著、走路、警戒）每格都載好才開始輪播；系統設定「減少動態效果」只放第 0 格
 * - 載不出來就照實說，給「再試一次」（同一張網址加 &_r=<次數>），不放假圖
 * compact：小窗用（舞台小一號、圖照原尺寸 1 倍、不放下面那行小字）
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Outfit } from "@/lib/avatar/outfit";
import { FRAMES, characterUrl } from "@/lib/avatar/render";
import type { AvatarData } from "@/lib/avatar/types";

/** 連續換很快時，停多久才送出去要圖 */
const WAIT_MS = 250;
const LOAD_ERROR = "角色圖載不出來，等一下再過來";

type Frame = { src: string; w: number; h: number };
type Loaded = { frames: Frame[]; ms: number };

function loadFrame(src: string): Promise<Frame> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ src, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error(LOAD_ERROR));
    img.src = src;
  });
}

const REDUCE = "(prefers-reduced-motion: reduce)";
function subscribeMotion(onChange: () => void) {
  const m = matchMedia(REDUCE);
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
}
const useReducedMotion = () =>
  useSyncExternalStore(subscribeMotion, () => matchMedia(REDUCE).matches, () => false);

function Spinner({ big }: { big?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-spin rounded-full border-2 border-[color:var(--paper-edge)] border-t-[color:var(--maple)] ${big ? "size-8" : "size-4"}`}
    />
  );
}

export function Stage({ outfit, data, compact = false }: { outfit: Outfit; data: AvatarData; compact?: boolean }) {
  const { n: count, ms } = FRAMES[outfit.pose];
  // 這套每一格的網址接成一個字串：穿搭沒變就不重新要圖（outfit 物件每次換網址都是新的）
  const sig = useMemo(
    () => Array.from({ length: count }, (_, frame) => characterUrl(outfit, data, { frame, resize: 2 })).join("\n"),
    [outfit, data, count],
  );
  const reduced = useReducedMotion();
  const [retry, setRetry] = useState({ sig: "", n: 0 });
  const tries = retry.sig === sig ? retry.n : 0;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [frame, setFrame] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  /** 舞台上已經有過一張圖（之後換穿搭才要等 250ms） */
  const drawn = useRef(false);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    const urls = sig.split("\n").map((u) => (tries ? `${u}&_r=${tries}` : u));
    // 第一次開、按「再試一次」馬上要；換穿搭才等 250ms
    const wait = drawn.current && !tries ? WAIT_MS : 0;
    const timer = setTimeout(async () => {
      let first: Frame;
      try {
        first = await loadFrame(urls[0]);
      } catch {
        if (alive) setStatus("error");
        return;
      }
      if (!alive) return;
      drawn.current = true;
      setLoaded({ frames: [first], ms });
      setFrame(0);
      setStatus("ready");
      if (urls.length < 2 || reduced) return;
      try {
        const rest = await Promise.all(urls.slice(1).map(loadFrame));
        if (alive) setLoaded({ frames: [first, ...rest], ms });
      } catch {
        // 後面幾格載不到：停在第 0 格，不算壞掉
      }
    }, wait);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [sig, tries, ms, reduced]);

  // 每格都載好才輪播
  useEffect(() => {
    if (!loaded || loaded.frames.length < 2 || reduced) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % loaded.frames.length), loaded.ms);
    return () => clearInterval(id);
  }, [loaded, reduced]);

  const shown = status === "error" ? null : (loaded?.frames[frame] ?? loaded?.frames[0] ?? null);
  // 圖本身是 2 倍；大舞台照 2 倍放，小窗縮回 1 倍（都是整數倍，像素不糊）
  const scale = compact ? 0.5 : 1;

  return (
    <>
      <div
        aria-busy={status === "loading"}
        className={`relative overflow-hidden rounded-2xl border border-[color:var(--paper-edge)] bg-[color:var(--paper-deep)] ${
          compact ? "h-[112px]" : "h-[248px] sm:h-[300px]"
        }`}
      >
        {shown ? (
          <div className={`absolute inset-x-2 top-2 flex items-end justify-center ${compact ? "bottom-2" : "bottom-6"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- maplestory.io 即時畫的像素圖，用原圖不經過最佳化 */}
            <img
              src={shown.src}
              alt="穿好的角色"
              width={Math.round(shown.w * scale)}
              height={Math.round(shown.h * scale)}
              draggable={false}
              className="max-h-full max-w-full object-contain object-bottom"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        ) : null}

        {status === "error" ? (
          <div className="absolute inset-0 grid place-content-center gap-2 p-3 text-center">
            <p className={`font-bold ink-soft ${compact ? "text-[12px]" : "text-[14px]"}`}>{LOAD_ERROR}</p>
            <button
              type="button"
              onClick={() => setRetry({ sig, n: tries + 1 })}
              className={`mx-auto rounded-full bg-[color:var(--maple)] font-bold text-[color:var(--on-accent)] ${
                compact ? "px-3 py-1 text-[12px]" : "tap-safe px-4 text-[14px]"
              }`}
            >
              再試一次
            </button>
          </div>
        ) : status === "loading" ? (
          shown ? (
            <span className="absolute right-2.5 top-2.5">
              <Spinner />
            </span>
          ) : (
            <span className="absolute inset-0 grid place-items-center">
              <Spinner big />
            </span>
          )
        ) : null}
      </div>
      {compact ? null : (
        <p className="mt-1.5 text-[12px] leading-relaxed ink-faint">角色圖由 maplestory.io 提供，少數道具樣子可能跟遊戲裡不完全一樣</p>
      )}
    </>
  );
}
