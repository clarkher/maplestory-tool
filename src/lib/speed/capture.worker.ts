/// <reference lib="webworker" />
// src/lib/speed/capture.worker.ts
import { createFrameThrottle } from "./frame-throttle";
import { parseNames, type RawSpeedNames } from "./names";
import { createExtrasState, loadPotionRefs, readExtras } from "./read-extras";
import { readFrameWithBar, type ReaderInit } from "./read-frame";

/**
 * 背景執行緒：主執行緒把分享畫面的 ReadableStream<VideoFrame> 交過來，這裡一秒處理一張（其他張直接關掉），
 * 畫到 OffscreenCanvas、讀完把結果傳回去。遊戲蓋住瀏覽器時主執行緒的計時器會被放慢，這裡是有畫面進來就跑。
 * 每一張 VideoFrame 都一定 close()（包含被丟掉的、畫失敗的），不然佔著的顯示記憶體會一路長上去。
 * v1.20：每張另外讀 HP、每 3 秒讀快捷鍵（readExtras）；認藥水的參考圖在開始後才在這裡載（potionIds）。
 */
type Start = { type: "start"; readable: ReadableStream<VideoFrame>; toNext: number[]; names: RawSpeedNames; potionIds: number[] };
type Hints = { type: "hints"; hints: number[] };

let hints: number[] = [];
let started = false;

/** 把一張畫面畫進去、讀出像素；畫完（或畫失敗）就關掉那張，讀像素的時間不佔著它。 */
function grab(frame: VideoFrame, slot: { canvas: OffscreenCanvas | null; context: OffscreenCanvasRenderingContext2D | null }) {
  try {
    const width = frame.displayWidth;
    const height = frame.displayHeight;
    if (!width || !height) return null;
    if (!slot.canvas || !slot.context || slot.canvas.width !== width || slot.canvas.height !== height) {
      slot.canvas = new OffscreenCanvas(width, height);
      slot.context = slot.canvas.getContext("2d", { willReadFrequently: true });
    }
    const context = slot.context;
    if (!context) return null;
    context.drawImage(frame, 0, 0);
    frame.close();
    return context.getImageData(0, 0, width, height);
  } finally {
    frame.close();
  }
}

async function run(message: Start) {
  const due = createFrameThrottle(1000);
  const slot: { canvas: OffscreenCanvas | null; context: OffscreenCanvasRenderingContext2D | null } = { canvas: null, context: null };
  const extras = createExtrasState();
  // 參考圖載好之前快捷鍵照讀數量，只是還不知道是哪種藥水
  void loadPotionRefs(message.potionIds ?? []).then(refs => {
    extras.refs = refs;
  });
  try {
    const init: ReaderInit = { toNext: message.toNext, names: parseNames(message.names) };
    const reader = message.readable.getReader();
    for (;;) {
      const { value: frame, done } = await reader.read();
      if (done) break;
      const now = Date.now();
      if (!due(now)) {
        frame.close();
        continue;
      }
      try {
        const image = grab(frame, slot);
        if (!image) continue;
        const pixels = { width: image.width, height: image.height, data: image.data };
        const { reading, bar } = readFrameWithBar(pixels, init, hints);
        let more = null;
        try {
          more = readExtras(pixels, bar, now, extras);
        } catch (error) {
          console.error("練功測速：HP、快捷鍵這一張讀不出來", error);
        }
        self.postMessage({ reading, at: now, extras: more });
      } catch (error) {
        // 一張讀壞不要整個停掉，下一秒再試；訊息留在 DevTools 方便查
        console.error("練功測速：這一張讀不出來", error);
      }
    }
  } catch (error) {
    // 名單壞掉、或分享被關掉時串流直接出錯：都當成結束，不然頁面會一直等
    console.warn("練功測速：背景讀取中斷", error);
  }
  self.postMessage({ ended: true });
}

self.onmessage = (event: MessageEvent<Start | Hints>) => {
  const message = event.data;
  if (message.type === "hints") {
    hints = message.hints;
    return;
  }
  if (started) return;
  started = true;
  void run(message);
};
