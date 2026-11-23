/**
 * 名字變怪物的分享（v2.44）：連結、影片、圖。全部在瀏覽器裡做，不打任何線上服務。
 *
 *   shareUrl(r)              → "/plan/rename/m/<id>#r=<筆畫>"（一坨是 /m/poop）；# 後面不會送到伺服器
 *   recordVideo(canvas, draw) → 用 MediaRecorder 把畫布錄成影片（支援 mp4 就 mp4，不然 webm）；不支援回 null
 *   stageImage(draw)          → 1080×1350 png
 *   shareLink({ text, url })  → ［傳給朋友］：手機跳系統分享、電腦複製連結（v2.60）
 *   deliver(blob, name)       → 手機能分享檔案就叫系統分享，不然下載（存圖用）
 *   shareableFile(blob, name) → 影片錄完先問能不能分享；能就放「分享影片」讓使用者再按一次 shareFile（錄 6 秒，原本那次點擊已過期）
 *
 * 錄影是照真的時間錄（MediaRecorder 錄的是牆上時間），所以 draw 由 requestAnimationFrame 照經過的毫秒數畫。
 */
import { encodeShare, type Share } from "./strokes";
import { TIMELINE } from "./stage";

/** 演出總長（寫字→收筆畫→變形→標題） */
export const STAGE_MS = TIMELINE.write + TIMELINE.collect + TIMELINE.morph + TIMELINE.title;

/** 影片：9:16、720×1280、30fps；最後一格多停 tail 毫秒，結果字卡看得清楚 */
export const VIDEO = { w: 720, h: 1280, fps: 30, ms: STAGE_MS, tail: 900 } as const;

/** 圖：1080×1350（4:5） */
export const IMAGE = { w: 1080, h: 1350 } as const;

export function shareUrl(r: Share): string {
  return `/plan/rename/m/${r.id === "poop" ? "poop" : r.id}#r=${encodeShare(r)}`;
}

/** 依序試：mp4（H.264）→ mp4 → webm（vp9）→ webm；都不支援回 null */
export function pickVideoType(supported: (type: string) => boolean): string | null {
  const types = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const t of types) {
    try {
      if (supported(t)) return t;
    } catch {
      // 有的瀏覽器問到不認得的字串會丟例外，當不支援
    }
  }
  return null;
}

/** 這個瀏覽器錄得了影片嗎（有 MediaRecorder、有支援的格式、畫布能 captureStream）；不行就不放「存影片」 */
export function canRecordVideo(): boolean {
  const Ctor = (globalThis as { MediaRecorder?: RecorderCtor }).MediaRecorder;
  if (typeof Ctor !== "function" || typeof Ctor.isTypeSupported !== "function") return false;
  const Canvas = (globalThis as { HTMLCanvasElement?: { prototype: { captureStream?: unknown } } }).HTMLCanvasElement;
  if (!Canvas || typeof Canvas.prototype.captureStream !== "function") return false;
  return pickVideoType(t => Ctor.isTypeSupported!(t)) !== null;
}

type Recorder = {
  start(timeslice?: number): void;
  stop(): void;
  state: string;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
};
type RecorderCtor = { new (stream: MediaStream, opts?: { mimeType?: string; videoBitsPerSecond?: number }): Recorder; isTypeSupported?: (t: string) => boolean };

/**
 * 錄 0..VIDEO.ms（再多停 tail）的演出。draw(ms) 每格畫一次到 canvas 上。
 * 沒有 MediaRecorder、畫布不能 captureStream、沒有支援的格式 → null。錄到一半壞掉也回 null。
 */
export async function recordVideo(canvas: HTMLCanvasElement, draw: (ms: number) => void): Promise<Blob | null> {
  const Ctor = (globalThis as { MediaRecorder?: RecorderCtor }).MediaRecorder;
  const capture = (canvas as { captureStream?: (fps?: number) => MediaStream }).captureStream;
  if (typeof Ctor !== "function" || typeof capture !== "function") return null;
  const type = pickVideoType(t => (Ctor.isTypeSupported ? Ctor.isTypeSupported(t) : false));
  if (!type) return null;

  let stream: MediaStream;
  let rec: Recorder;
  try {
    draw(0);
    stream = capture.call(canvas, VIDEO.fps);
    rec = new Ctor(stream, { mimeType: type, videoBitsPerSecond: 2_500_000 });
  } catch {
    return null;
  }

  return new Promise<Blob | null>(resolve => {
    const chunks: Blob[] = [];
    let raf = 0;
    let guard = 0;
    let done = false;
    const finish = (blob: Blob | null) => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      clearTimeout(guard);
      for (const t of stream.getTracks?.() ?? []) t.stop();
      resolve(blob);
    };
    rec.ondataavailable = e => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => finish(chunks.length ? new Blob(chunks, { type: type.split(";")[0] }) : null);
    rec.onerror = () => finish(null);

    const end = VIDEO.ms + VIDEO.tail;
    const stop = () => {
      if (rec.state !== "inactive") rec.stop();
    };
    let t0 = 0;
    const frame = (now: number) => {
      if (!t0) t0 = now;
      const ms = now - t0;
      draw(Math.min(VIDEO.ms, ms));
      if (ms >= end) stop();
      else raf = requestAnimationFrame(frame);
    };
    try {
      rec.start(250);
    } catch {
      finish(null);
      return;
    }
    raf = requestAnimationFrame(frame);
    // 分頁被切走時 requestAnimationFrame 會停：最多等 end + 4 秒就收工，不讓按鈕一直卡在錄影中
    guard = window.setTimeout(stop, end + 4000);
  });
}

/** 最後一格畫成 1080×1350 png */
export function stageImage(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): Promise<Blob | null> {
  const c = document.createElement("canvas");
  c.width = IMAGE.w;
  c.height = IMAGE.h;
  const ctx = c.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  draw(ctx, IMAGE.w, IMAGE.h);
  return new Promise(resolve => c.toBlob(b => resolve(b), "image/png"));
}

/** 檔名副檔名照 blob 的格式 */
export function fileExt(type: string): string {
  if (type.startsWith("video/mp4")) return "mp4";
  if (type.startsWith("video/webm")) return "webm";
  return "png";
}

/**
 * 手機、平板（手指操作）而且系統分享收得了這個檔案 → 回包好的檔案；電腦或不支援回 null（就下載）。
 * 影片錄 6 秒，錄完時「按下去」那次的使用者動作已經過期，navigator.share 會被擋；
 * 所以影片先用這個判斷，能分享就另外放一顆「分享影片」讓使用者再按一次（v2.44）。
 */
export function shareableFile(blob: Blob, name: string): File | null {
  const file = new File([blob], name, { type: blob.type });
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  return touch && navigator.canShare?.({ files: [file] }) ? file : null;
}

/** 叫系統分享面板；使用者按取消回 "cancel"，其他錯誤（權限、格式）回 "error"（呼叫的地方改下載） */
export async function shareFile(file: File): Promise<"share" | "cancel" | "error"> {
  try {
    await navigator.share({ files: [file] });
    return "share";
  } catch (e) {
    return (e as Error)?.name === "AbortError" ? "cancel" : "error";
  }
}

/** 下載到下載資料夾 */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * 交出檔案（存圖用，做圖很快、按下去的動作還有效）：能分享就叫系統分享，電腦或不支援就下載。
 * 使用者在分享面板按取消回 "cancel"。
 */
export async function deliver(blob: Blob, name: string): Promise<"share" | "download" | "cancel"> {
  const file = shareableFile(blob, name);
  if (file) {
    const how = await shareFile(file);
    if (how !== "error") return how;
  }
  downloadBlob(blob, name);
  return "download";
}

/** 複製文字：先用 clipboard API，不行（舊瀏覽器、非 https）用隱藏 textarea */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const t = document.createElement("textarea");
      t.value = text;
      t.setAttribute("readonly", "");
      t.style.position = "fixed";
      t.style.opacity = "0";
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand("copy");
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** ［傳給朋友］系統分享面板帶的那句話 */
export function sendText(r: { kind: "monster"; n: string } | { kind: "poop" }): string {
  return r.kind === "monster" ? `我的 ID 簽一簽變成「${r.n}」，換你簽` : "我的 ID 測出來是一坨，換你簽";
}

/**
 * 分享連結：手機、平板（手指操作）叫系統分享面板，電腦或沒有系統分享就複製。
 * 使用者在面板按取消回 "cancel"；面板叫不出來改複製，連複製都不行回 "error"。
 */
export async function shareLink(data: { text: string; url: string }): Promise<"share" | "copy" | "cancel" | "error"> {
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  if (touch && typeof navigator.share === "function") {
    try {
      await navigator.share(data);
      return "share";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancel";
    }
  }
  return (await copyText(data.url)) ? "copy" : "error";
}
