import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatcher, MATCH_TIMEOUT_MS, type WorkerLike } from "../matcher";
import type { MatchIn, MatchOut, WorkerReply, WorkerRequest } from "../run";

const MSG: MatchIn = { type: "shape", id: 100100 };
const FROM_WORKER: MatchOut = { result: null, pts: null, n: "worker" };
const FROM_MAIN: MatchOut = { result: null, pts: null, n: "main" };

/** 假 Worker：記下收到的請求，reply 手動回 */
class FakeWorker implements WorkerLike {
  sent: WorkerRequest[] = [];
  terminated = false;
  onmessage: ((e: MessageEvent<WorkerReply>) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  postMessage(data: WorkerRequest) {
    this.sent.push(data);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: WorkerReply) {
    this.onmessage?.({ data } as MessageEvent<WorkerReply>);
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const spawn = vi.fn(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  });
  const fallback = vi.fn(async () => FROM_MAIN);
  return { workers, spawn, fallback, m: createMatcher({ spawn, fallback }) };
}

describe("createMatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Worker 有回：用 Worker 的結果，不走主執行緒；之後計時器到了也不會再改走", async () => {
    const { workers, fallback, m } = setup();
    const p = m.match(MSG);
    const w = workers[0];
    w.reply({ rid: w.sent[0].rid, out: FROM_WORKER });
    await expect(p).resolves.toEqual(FROM_WORKER);
    await vi.advanceTimersByTimeAsync(MATCH_TIMEOUT_MS * 2);
    expect(fallback).not.toHaveBeenCalled();
    expect(w.terminated).toBe(false);
  });

  it("Worker 載進來但一直不回：8 秒後改在主執行緒算、Worker 收掉，之後的請求直接走主執行緒", async () => {
    const { workers, spawn, fallback, m } = setup();
    let done: MatchOut | null = null;
    void m.match(MSG).then(o => (done = o));
    await vi.advanceTimersByTimeAsync(MATCH_TIMEOUT_MS - 1);
    expect(done).toBeNull();
    expect(fallback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toEqual(FROM_MAIN);
    expect(fallback).toHaveBeenCalledWith(MSG);
    expect(workers[0].terminated).toBe(true);
    // 不再開新的 Worker 白等 8 秒
    await expect(m.match(MSG)).resolves.toEqual(FROM_MAIN);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("兩個請求同時卡住：逾時時兩個都改走主執行緒", async () => {
    const { fallback, m } = setup();
    const a = m.match(MSG);
    const b = m.match({ type: "shape", id: 2 });
    await vi.advanceTimersByTimeAsync(MATCH_TIMEOUT_MS);
    await expect(a).resolves.toEqual(FROM_MAIN);
    await expect(b).resolves.toEqual(FROM_MAIN);
    expect(fallback).toHaveBeenCalledTimes(2);
  });

  it("回覆照 rid 對回自己的請求", async () => {
    const { workers, m } = setup();
    const a = m.match(MSG);
    const b = m.match({ type: "shape", id: 2 });
    const w = workers[0];
    w.reply({ rid: w.sent[1].rid, out: { ...FROM_WORKER, n: "b" } });
    w.reply({ rid: w.sent[0].rid, out: { ...FROM_WORKER, n: "a" } });
    expect((await a).n).toBe("a");
    expect((await b).n).toBe("b");
  });

  it("Worker 回錯：那個請求走主執行緒", async () => {
    const { workers, fallback, m } = setup();
    const p = m.match(MSG);
    workers[0].reply({ rid: workers[0].sent[0].rid, error: true });
    await expect(p).resolves.toEqual(FROM_MAIN);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("Worker 整個掛掉（onerror）：等著的走主執行緒", async () => {
    const { workers, m } = setup();
    const p = m.match(MSG);
    workers[0].onerror?.(new Event("error"));
    await expect(p).resolves.toEqual(FROM_MAIN);
    expect(workers[0].terminated).toBe(true);
  });

  it("開不起 Worker：直接走主執行緒", async () => {
    const fallback = vi.fn(async () => FROM_MAIN);
    const m = createMatcher({
      spawn: () => {
        throw new Error("no worker");
      },
      fallback,
    });
    await expect(m.match(MSG)).resolves.toEqual(FROM_MAIN);
  });

  it("卸載：等著的丟 unmount、不在主執行緒算；之後再用會重開 Worker", async () => {
    const { workers, spawn, fallback, m } = setup();
    const p = m.match(MSG);
    m.dispose();
    await expect(p).rejects.toThrow("unmount");
    expect(fallback).not.toHaveBeenCalled();
    expect(workers[0].terminated).toBe(true);
    await vi.advanceTimersByTimeAsync(MATCH_TIMEOUT_MS * 2);
    expect(fallback).not.toHaveBeenCalled();
    const q = m.match(MSG);
    expect(spawn).toHaveBeenCalledTimes(2);
    workers[1].reply({ rid: workers[1].sent[0].rid, out: FROM_WORKER });
    await expect(q).resolves.toEqual(FROM_WORKER);
  });
});
