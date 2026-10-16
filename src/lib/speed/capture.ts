// src/lib/speed/capture.ts
"use client";

import type { RawSpeedNames } from "./names";
import type { FrameReading } from "./read-frame";

export type CaptureHandle = { stop(): void; setHints(hints: number[]): void; ended: Promise<void> };

declare global {
  interface Window {
    /** 驗收腳本塞的假畫面（正式機不理它） */
    __speedTestStream?: MediaStream;
  }
}

type TrackProcessorConstructor = new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> };
type WorkerMessage = { reading?: FrameReading; at?: number; ended?: boolean };

async function getStream(): Promise<MediaStream> {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV !== "production" && window.__speedTestStream) return window.__speedTestStream;
  return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
}

/**
 * 請玩家分享遊戲視窗，之後一秒讀一張。玩家按瀏覽器的「停止分享」或呼叫 stop() 都會結束（ended 會 resolve）。
 * 有 MediaStreamTrackProcessor（Chrome／Edge）就在 Worker 裡讀；沒有就退回主執行緒用 <video>＋計時器。
 * 玩家在選視窗那一步按取消，getDisplayMedia 會丟 NotAllowedError，這裡不吞，交給呼叫的頁面決定怎麼講。
 */
export async function startCapture(init: { toNext: number[]; names: RawSpeedNames }, onReading: (reading: FrameReading, at: number) => void): Promise<CaptureHandle> {
  const stream = await getStream();
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error("分享的內容沒有畫面");

  let over = false;
  let finish!: () => void;
  const ended = new Promise<void>(resolve => {
    finish = () => {
      over = true;
      resolve();
    };
  });
  // 瀏覽器自己的「停止分享」會觸發 ended；我們自己呼叫 track.stop() 不會，所以 stop() 要另外 finish
  track.addEventListener("ended", () => finish());
  const stop = () => {
    for (const each of stream.getTracks()) each.stop();
    finish();
  };

  const Processor = (globalThis as { MediaStreamTrackProcessor?: TrackProcessorConstructor }).MediaStreamTrackProcessor;
  if (Processor) {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL("./capture.worker.ts", import.meta.url), { type: "module" });
      const { readable } = new Processor({ track });
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        if (over) return;
        if (event.data.ended) finish();
        else if (event.data.reading && event.data.at) onReading(event.data.reading, event.data.at);
      };
      // Worker 檔載不進來（網路、擋掉）：讀不到畫面，結束掉讓頁面知道，不要一直轉
      worker.onerror = () => stop();
      worker.postMessage({ type: "start", readable, toNext: init.toNext, names: init.names }, [readable]);
    } catch {
      // 建不起 Worker（被擋、不支援 module worker）：還沒把串流交出去，退回下面的主執行緒作法
      worker?.terminate();
      worker = null;
    }
    if (worker) {
      const running = worker;
      ended.then(() => {
        running.terminate();
        for (const each of stream.getTracks()) each.stop();
      });
      return { stop, setHints: hints => running.postMessage({ type: "hints", hints }), ended };
    }
  }

  // 退路：主執行緒。分頁被遊戲蓋住時計時器可能被放慢，所以只有沒有 MediaStreamTrackProcessor 才走這裡。
  // 認畫面的程式（含字樣板，近 200KB）只有走到這裡才載入，不放進頁面本身的檔案。
  try {
    const [{ readFrame }, { parseNames }] = await Promise.all([import("./read-frame"), import("./names")]);
    const reader = { toNext: init.toNext, names: parseNames(init.names) };
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("這個瀏覽器畫不出畫面");
    let hints: number[] = [];
    const timer = window.setInterval(() => {
      if (over || !video.videoWidth || !video.videoHeight) return;
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      context.drawImage(video, 0, 0);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      let reading: FrameReading;
      try {
        reading = readFrame({ width: canvas.width, height: canvas.height, data: image.data }, reader, hints);
      } catch (error) {
        // 一張讀壞不要整個停掉，下一秒再試；訊息留在 DevTools 方便查
        console.error("練功測速：這一張讀不出來", error);
        return;
      }
      onReading(reading, Date.now());
    }, 1000);
    ended.then(() => {
      window.clearInterval(timer);
      video.srcObject = null;
      for (const each of stream.getTracks()) each.stop();
    });
    return {
      stop,
      setHints: next => {
        hints = next;
      },
      ended,
    };
  } catch (error) {
    // 設定到一半失敗：把分享關掉，不要留著「正在分享」的提示
    stop();
    throw error;
  }
}
