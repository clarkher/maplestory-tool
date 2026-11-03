"use client";

/**
 * 紙娃娃的舞台：只管把這套穿搭畫出來（maplestory.io 即時畫的透明 PNG）。
 * - 圖用 renderMode=4（腳在整張圖正中間、一律 1 倍）：圖的中心對到舞台的地面線、左右置中，
 *   每格的腳都落在同一點，輪播不會左右滑、上下跳（renderMode=0 每格裁法不同會滑，見 render.ts）
 * - 大舞台放 2 倍、小窗 1 倍；這套太大放不下才縮到剛好（對齊整數個螢幕像素，像素不糊）
 * - 換穿搭停 250ms 才去要新圖；新圖用 new Image() 先載好才換上，舊圖留著不閃白，載的時候角落一個小轉圈
 * - 多格動作（站著、走路、警戒）每格都載好才開始輪播；系統設定「減少動態效果」只放第 0 格
 * - 載不出來（含 15 秒還沒載好）就照實說，給「再試一次」（同一張網址加 &_r=<次數>）；舊圖清掉，不放假圖
 * compact：小窗用（舞台小一號、不放下面那行小字）
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Outfit } from "@/lib/avatar/outfit";
import { FRAMES, characterUrl } from "@/lib/avatar/render";
import type { AvatarData } from "@/lib/avatar/types";

export const LOAD_ERROR = "角色圖載不出來，等一下再過來";
/** 要一張角色圖最多等多久（舞台、下載共用） */
export const LOAD_TIMEOUT_MS = 15_000;
/** 連續換很快時，停多久才送出去要圖 */
const WAIT_MS = 250;

type Frame = { src: string; w: number; h: number };
type Loaded = { frames: Frame[]; ms: number };

function loadFrame(src: string): Promise<Frame> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.onload = img.onerror = null;
      img.removeAttribute("src"); // 不再等這張
      reject(new Error(LOAD_ERROR));
    }, LOAD_TIMEOUT_MS);
    img.onload = () => {
      clearTimeout(timer);
      resolve({ src, w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error(LOAD_ERROR));
    };
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

/** 舞台內容區的大小（左右置中、放不放得下 2 倍要用） */
function useBoxSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/**
 * 放大倍數：這套最寬那格放得下、腳以上那半（圖的中心是腳，所以看 h / 2）放得進地面線以上，就用 base；
 * 放不下（趴下拿長武器之類）就縮到剛好，但對齊到「一格原圖＝整數個螢幕像素」，像素才不會忽粗忽細。
 * 不直接掉到 1 倍：換動作時角色不會突然縮一半。
 */
function fitScale(frames: Frame[], box: { w: number; h: number } | null, base: number, ground: number): number {
  if (!box || frames.length === 0) return base;
  const w = Math.max(...frames.map((f) => f.w));
  const up = Math.max(...frames.map((f) => f.h)) / 2;
  const fit = Math.min((box.w - 16) / w, (box.h - ground - 8) / up);
  if (fit >= base) return base;
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const snapped = Math.floor(fit * dpr) / dpr;
  return snapped > 0 ? snapped : fit;
}

function Spinner({ big }: { big?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`block rounded-full border-2 border-[color:var(--paper-edge)] border-t-[color:var(--maple)] motion-safe:animate-spin ${big ? "size-8" : "size-4"}`}
    />
  );
}

export function Stage({ outfit, data, compact = false }: { outfit: Outfit; data: AvatarData; compact?: boolean }) {
  const { n: count, ms } = FRAMES[outfit.pose];
  // 這套每一格的網址接成一個字串：穿搭沒變就不重新要圖（outfit 物件每次換網址都是新的）
  const sig = useMemo(
    () => Array.from({ length: count }, (_, frame) => characterUrl(outfit, data, { frame, resize: 1, mode: 4 })).join("\n"),
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
  const box = useRef<HTMLDivElement>(null);
  const boxSize = useBoxSize(box);

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
        if (!alive) return;
        // 舊那套也清掉：「再試一次」、換下一套都不會先閃出別套
        setLoaded(null);
        setFrame(0);
        setStatus("error");
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
  /** 地面線離舞台底多高（腳底下垂著的東西畫在這段裡） */
  const ground = compact ? 14 : 40;
  const scale = loaded ? fitScale(loaded.frames, boxSize, compact ? 1 : 2, ground) : 1;

  return (
    <>
      <div
        ref={box}
        aria-busy={status === "loading"}
        className={`relative overflow-hidden rounded-2xl border border-[color:var(--paper-edge)] bg-[color:var(--paper-deep)] ${
          compact ? "h-[112px]" : "h-[248px] sm:h-[300px]"
        }`}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- maplestory.io 即時畫的像素圖，用原圖不經過最佳化
          <img
            src={shown.src}
            alt="穿好的角色"
            draggable={false}
            className="absolute max-w-none"
            style={{
              width: shown.w * scale,
              height: shown.h * scale,
              // 圖的中心＝腳：左右對舞台中線、上下對地面線
              left: `calc(50% - ${(shown.w * scale) / 2}px)`,
              bottom: ground - (shown.h * scale) / 2,
              imageRendering: "pixelated",
            }}
          />
        ) : null}

        {status === "error" ? (
          <div className="absolute inset-0 grid place-content-center gap-2 p-3 text-center">
            <p role="status" className={`font-bold ink-soft ${compact ? "text-[12px]" : "text-[14px]"}`}>
              {LOAD_ERROR}
            </p>
            <button
              type="button"
              onClick={() => setRetry({ sig, n: tries + 1 })}
              className={`tap-safe mx-auto rounded-full bg-[color:var(--maple)] font-bold text-[color:var(--on-accent)] ${
                compact ? "px-3 text-[12px]" : "px-4 text-[14px]"
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
