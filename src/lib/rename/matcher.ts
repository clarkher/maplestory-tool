/**
 * 名字變怪物：比對請求的派送（不綁 React，方便測試；RenameGame 的 useMatcher 包一層）。
 * 先丟 Worker；以下情況那個請求改在主執行緒算（fallback）：
 *   - Worker 開不起來（new Worker 丟例外）
 *   - Worker 回錯、整個掛掉（onerror）
 *   - 等超過 timeoutMs 都沒回（Worker 載進來但卡住，不然頁面會一直停在「比對中…」）
 * 掛掉或逾時之後這個 Worker 就收掉、之後的請求都直接走主執行緒（不再每次白等）。
 * 每個請求帶 rid，回覆照 rid 對回自己的 promise（同時有兩個請求也不會互相搶）。
 * dispose()（卸載）：收掉 Worker、等著的請求丟 Error("unmount")（呼叫端不用再算）；之後再用會重開一個 Worker
 * （React 嚴格模式會卸載再掛一次）。
 */
import type { MatchIn, MatchOut, WorkerReply, WorkerRequest } from "./run";

/** Worker 要用到的那幾個介面（測試用假的） */
export type WorkerLike = {
  postMessage(data: WorkerRequest): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<WorkerReply>) => void) | null;
  onerror: ((e: Event) => void) | null;
};

export type Matcher = { match(msg: MatchIn): Promise<MatchOut>; dispose(): void };

/** 一個請求等 Worker 最多幾毫秒 */
export const MATCH_TIMEOUT_MS = 8000;

type Pending = { resolve: (o: MatchOut) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export function createMatcher({
  spawn,
  fallback,
  timeoutMs = MATCH_TIMEOUT_MS,
}: {
  spawn: () => WorkerLike;
  fallback: (msg: MatchIn) => Promise<MatchOut>;
  timeoutMs?: number;
}): Matcher {
  let worker: WorkerLike | null = null;
  /** Worker 掛過或逾時過：之後都走主執行緒 */
  let broken = false;
  const pending = new Map<number, Pending>();
  let seq = 0;

  const drop = (why: string) => {
    worker?.terminate();
    worker = null;
    const all = [...pending.values()];
    pending.clear();
    for (const p of all) {
      clearTimeout(p.timer);
      p.reject(new Error(why));
    }
  };

  const getWorker = (): WorkerLike => {
    if (worker) return worker;
    const w = spawn();
    w.onmessage = e => {
      const p = pending.get(e.data.rid);
      if (!p) return;
      pending.delete(e.data.rid);
      clearTimeout(p.timer);
      if ("error" in e.data) p.reject(new Error("worker"));
      else p.resolve(e.data.out);
    };
    // Worker 檔載不進來或整個掛掉：等著的全部改走主執行緒
    w.onerror = () => {
      broken = true;
      drop("worker");
    };
    worker = w;
    return w;
  };

  return {
    async match(msg) {
      try {
        if (broken) throw new Error("broken");
        const w = getWorker();
        const rid = ++seq;
        return await new Promise<MatchOut>((resolve, reject) => {
          const timer = setTimeout(() => {
            // 卡住的 Worker 收掉；其他等著的也一起改走主執行緒
            broken = true;
            drop("timeout");
          }, timeoutMs);
          pending.set(rid, { resolve, reject, timer });
          w.postMessage({ rid, msg });
        });
      } catch (e) {
        // 卸載了就不用再算
        if ((e as Error).message === "unmount") throw e;
        return fallback(msg);
      }
    },
    dispose() {
      drop("unmount");
    },
  };
}
