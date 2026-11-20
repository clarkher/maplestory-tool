/// <reference lib="webworker" />
/**
 * 名字變怪物：比對在背景執行緒跑，不卡畫面。訊息格式跟處理都在 src/lib/rename/run.ts（主執行緒退路共用）；
 * shapes.json 在 run.ts 裡用 import("@/lib/rename/shapes.json") 第一次用到才載。
 */
import { loadShapes, runMatch, type MatchIn } from "@/lib/rename/run";

self.onmessage = (event: MessageEvent<MatchIn>) => {
  loadShapes()
    .then(shapes => runMatch(event.data, shapes, Math.random))
    .then(
      out => self.postMessage(out),
      // 載不到 shapes 或算到出錯：回 error，主執行緒改自己算
      () => self.postMessage({ error: true }),
    );
};
