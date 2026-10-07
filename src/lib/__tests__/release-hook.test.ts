import { afterEach, describe, expect, it, vi } from "vitest";
import { onV002Open, useBeforeV002 } from "@/lib/release";

// 測試環境沒有 DOM，跑不了瀏覽器端的 React。這裡把 useSyncExternalStore 換成「把拿到的三個函式原樣交回來」，
// 直接檢查 useBeforeV002 交給 React 的是哪三個：瀏覽器端畫的用哪個、伺服器跟 hydration 用哪個、訂閱用哪個。
vi.mock("react", async importOriginal => ({
  ...(await importOriginal<typeof import("react")>()),
  useSyncExternalStore: (subscribe: unknown, getSnapshot: unknown, getServerSnapshot: unknown) => ({ subscribe, getSnapshot, getServerSnapshot }),
}));

type Store = { subscribe: unknown; getSnapshot: () => boolean; getServerSnapshot: () => boolean };
/** 10/15 早上維護中（還沒開機）、14:00 官方開機 */
const BEFORE = Date.parse("2026-10-15T10:00:00+08:00");
const AFTER = Date.parse("2026-10-15T14:00:00+08:00");

describe("useBeforeV002 交給 React 的三個函式", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("開機前建置、使用者開機後才站內換頁：瀏覽器端用當下時間（已開放），只有伺服器跟 hydration 照建置時（還沒開放）", () => {
    vi.stubEnv("MAPLEBOOK_BUILD_TIME", String(BEFORE));
    vi.useFakeTimers({ now: AFTER });
    const store = useBeforeV002() as unknown as Store;
    expect(store.getSnapshot()).toBe(false);
    expect(store.getServerSnapshot()).toBe(true);
  });

  it("訂閱的是 onV002Open：頁面開著跨過開機時刻才會收到通知", () => {
    const store = useBeforeV002() as unknown as Store;
    expect(store.subscribe).toBe(onV002Open);
  });
});
