"use client";

/**
 * 紙娃娃的舞台：只管把這套穿搭畫出來（maplestory.io 即時畫的透明 PNG）。
 * - 圖用 renderMode=4（腳在整張圖正中間、一律 1 倍）：圖的中心對到舞台的地面線、左右置中，
 *   每格的腳都落在同一點，輪播不會左右滑、上下跳（renderMode=0 每格裁法不同會滑，見 render.ts）
 * - 大舞台放 2 倍、小窗 1 倍；倍數跟地面線照這套實際畫到的範圍算（讀圖的像素，算法見 stage-fit.ts）：超大武器不被切，一般角色腳不跳
 * - 讀像素要帶 crossOrigin 載；maplestory.io 沒寫 Vary: Origin，快取裡如果是沒帶 Origin 的版本就會被擋：
 *   這時不帶再要一次、這張當沒量到（照 v1.40 算法），畫上去的 <img> 也跟著不帶（Frame.cors），不算載不出來
 * - 換穿搭停 250ms 才去要新圖（預載過的第 0 格不等，見 preloadFrame）；新圖用 new Image() 先載好才換上，舊圖留著不閃白
 * - 真的去要圖之後（250ms 的等待不算）超過 150ms 還沒好才算「換裝中」（快取裡的圖不會閃）：舊圖變淡、舞台中間大轉圈、通知 onBusy；沒有舊圖時馬上大轉圈
 * - 多格動作（站著、走路、警戒）每格都載好才開始輪播；系統設定「減少動態效果」只放第 0 格
 * - 載不出來（兩種要法都失敗，或整趟 15 秒還沒載好）就照實說，給「再試一次」（同一張網址加 &_r=<次數>）；舊圖清掉，不放假圖
 * compact：小窗用（舞台小一號、不放下面那行小字）
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Outfit } from "@/lib/avatar/outfit";
import { FRAMES, characterUrl } from "@/lib/avatar/render";
import { alphaReach, fitStage, unmeasured } from "@/lib/avatar/stage-fit";
import type { Reach } from "@/lib/avatar/stage-fit";
import type { AvatarData } from "@/lib/avatar/types";

export const LOAD_ERROR = "角色圖載不出來，等一下再過來";
/** 要一張角色圖最多等多久（舞台、下載共用） */
export const LOAD_TIMEOUT_MS = 15_000;
/** 連續換很快時，停多久才送出去要圖 */
const WAIT_MS = 250;
/** 真的去要圖之後（WAIT_MS 不算），超過這麼久還沒好才算「換裝中」（快取裡的圖不會閃） */
const BUSY_AFTER_MS = 150;

/** cors：這張是帶 crossOrigin 載到的（畫上去的 <img> 要一致，不然快取對不上會載不出來） */
type Frame = { src: string; w: number; h: number; reach: Reach; cors: boolean };
type Loaded = { frames: Frame[]; ms: number };

/** 讀這張圖的像素量範圍；讀不了（canvas 被污染）或全透明就當沒量到 */
function measure(img: HTMLImageElement): Reach {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      const reach = alphaReach(ctx.getImageData(0, 0, w, h).data, w, h);
      if (reach) return reach;
    }
  } catch {
    // 讀不了：底下當沒量到
  }
  return unmeasured(w, h);
}

function loadFrame(src: string): Promise<Frame> {
  return new Promise((resolve, reject) => {
    /** 正在等的那一張（request 同步就會設好，計時器到的時候一定有） */
    let img: HTMLImageElement;
    // 逾時算整趟：帶跟不帶 crossOrigin 兩次共用這一個計時器
    const timer = setTimeout(() => {
      img.onload = img.onerror = null;
      img.removeAttribute("src"); // 不再等這張
      reject(new Error(LOAD_ERROR));
    }, LOAD_TIMEOUT_MS);
    const request = (cors: boolean) => {
      const el = new Image();
      img = el;
      if (cors) el.crossOrigin = "anonymous";
      el.onload = () => {
        clearTimeout(timer);
        const { naturalWidth: w, naturalHeight: h } = el;
        resolve({ src, w, h, cors, reach: cors ? measure(el) : unmeasured(w, h) });
      };
      el.onerror = () => {
        if (cors) {
          request(false); // 快取裡可能是沒帶 Origin 的版本：不帶再要一次
          return;
        }
        clearTimeout(timer);
        reject(new Error(LOAD_ERROR));
      };
      el.src = src;
    };
    request(true);
  });
}

/** 預載好的第 0 格：只留最新一張（大舞台、小窗可能共用同一個 Promise，所以用了也不刪） */
const preloads = new Map<string, Promise<Frame>>();

/**
 * 先把下一套的第 0 格要好（清掉舊的預載、記住這張）；Stage 要的第 0 格剛好是這張就直接用、也不等 250ms。
 * url 要跟 Stage 組的一模一樣：characterUrl(outfit, data, { frame: 0, resize: 1, mode: 4 })
 */
export function preloadFrame(url: string): void {
  preloads.clear();
  const frame = loadFrame(url);
  frame.catch(() => {}); // 預載失敗不算錯（Stage 要用時自己再要一次），不要變成未處理的 rejection
  preloads.set(url, frame);
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

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="block size-8 rounded-full border-2 border-[color:var(--paper-edge)] border-t-[color:var(--maple)] motion-safe:animate-spin"
    />
  );
}

/**
 * onBusy：「換裝中」旗標變了就通知（快的不會通知），最後一定回到 false（好了、失敗、舞台拿掉都算）
 * onReady：這套的第 0 格好了（大舞台才接；隨機穿搭等這個才預載下一套，見 useRandomDeck）
 */
export function Stage({
  outfit,
  data,
  compact = false,
  onBusy,
  onReady,
}: {
  outfit: Outfit;
  data: AvatarData;
  compact?: boolean;
  onBusy?: (busy: boolean) => void;
  onReady?: () => void;
}) {
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
  /** 換裝中：要圖要了超過 150ms 還沒好（aria-busy 不等這個，看 status） */
  const [busy, setBusy] = useState(false);
  /** 舞台上已經有過一張圖（之後換穿搭才要等 250ms） */
  const drawn = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const boxSize = useBoxSize(box);
  // onBusy、onReady 放 ref：父層每次畫面給新函式也不會多通知、不會重新要圖
  const onBusyRef = useRef(onBusy);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onBusyRef.current = onBusy;
    onReadyRef.current = onReady;
  }, [onBusy, onReady]);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    const urls = sig.split("\n").map((u) => (tries ? `${u}&_r=${tries}` : u));
    // 預載過的第 0 格（再試一次的網址多了 &_r=，查不到，一定重新要）
    const preloaded = preloads.get(urls[0]);
    // 第一次開、按「再試一次」、預載過的馬上要；其他換穿搭才等 250ms
    const wait = drawn.current && !tries && !preloaded ? WAIT_MS : 0;
    let busyTimer: ReturnType<typeof setTimeout> | undefined;
    /** 第 0 格有結果了（好了或失敗）：不用再數，「換裝中」收掉 */
    const settle = () => {
      clearTimeout(busyTimer);
      setBusy(false);
    };
    const timer = setTimeout(async () => {
      // 真的去要圖才開始數：快取裡的圖 150ms 內就好了，舊圖不會閃
      busyTimer = setTimeout(() => setBusy(true), BUSY_AFTER_MS);
      let first: Frame;
      try {
        // 預載失敗不算舞台壞掉：自己正常要一次（這一趟已經換掉就不要了）
        first = await (preloaded
          ? preloaded.catch((error) => {
              if (!alive) throw error;
              return loadFrame(urls[0]);
            })
          : loadFrame(urls[0]));
      } catch {
        if (!alive) return;
        settle();
        // 舊那套也清掉：「再試一次」、換下一套都不會先閃出別套
        setLoaded(null);
        setFrame(0);
        setStatus("error");
        return;
      }
      if (!alive) return;
      settle();
      drawn.current = true;
      setLoaded({ frames: [first], ms });
      setFrame(0);
      setStatus("ready");
      onReadyRef.current?.();
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
      // 只停數到一半的；已經亮著就留著，連續換穿搭時舊圖一直淡到新圖好，不會中間亮回來
      clearTimeout(busyTimer);
    };
  }, [sig, tries, ms, reduced]);

  // 每格都載好才輪播
  useEffect(() => {
    if (!loaded || loaded.frames.length < 2 || reduced) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % loaded.frames.length), loaded.ms);
    return () => clearInterval(id);
  }, [loaded, reduced]);

  useEffect(() => {
    if (!busy) return;
    onBusyRef.current?.(true);
    return () => onBusyRef.current?.(false);
  }, [busy]);

  const shown = status === "error" ? null : (loaded?.frames[frame] ?? loaded?.frames[0] ?? null);
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  /** ground：地面線離舞台底多高（腳底下垂著的東西畫在這段裡） */
  const { scale, ground } = fitStage(loaded?.frames.map((f) => f.reach) ?? [], boxSize, compact ? 1 : 2, compact ? 14 : 40, dpr);

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
            crossOrigin={shown.cors ? "anonymous" : undefined}
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
              opacity: busy ? 0.45 : undefined,
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
        ) : status === "loading" && (busy || !shown) ? (
          <span className="absolute inset-0 grid place-items-center">
            <Spinner />
          </span>
        ) : null}
      </div>
      {compact ? null : (
        <p className="mt-1.5 text-[12px] leading-relaxed ink-faint">角色圖由 maplestory.io 提供，少數道具樣子可能跟遊戲裡不完全一樣</p>
      )}
    </>
  );
}
