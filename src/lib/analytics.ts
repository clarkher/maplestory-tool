/**
 * GA4 事件（v1.32；commit 標成 v1.31，跟組隊指揮撞號）。事件表與參數在 README「GA 事件」那一節；新增、改名事件要一起改那張表。
 *
 * 用法：
 *   track("db_open", { db: "monsters", id })          // 一個動作送一次
 *   trackSettled("db-search", "db_search", { query })  // 一直在變的（打字、拉等級）：停 1.5 秒才送最後那次
 *
 * 只有正式網域 maplehelper.tw 載 GA；測試機、分支預覽、本機網址加 ?ga_debug=1 才載（送 debug_mode，到 GA 的 DebugView 看）。
 * 外連點擊、捲動、網頁瀏覽由 GA「加強型評估」自動收，這裡不重埋。
 */
import { jobOption } from "./jobs";

export const GA_ID = "G-B0T3VGC7F2";

export const PRODUCTION_HOST = "maplehelper.tw";

export function gaEnabledFor(hostname: string, search: string) {
  return hostname === PRODUCTION_HOST || new URLSearchParams(search).has("ga_debug");
}

export type EventName =
  | "calc_result"
  | "db_search"
  | "db_open"
  | "profile_set"
  | "speed_read"
  | "speed_save"
  | "boss_room_create"
  | "boss_room_join"
  | "avatar_download"
  | "avatar_showcase_click"
  | "guild_download"
  | "guild_random"
  | "share";

type Params = Record<string, string | number | boolean | undefined>;

export function track(name: EventName, params: Params = {}) {
  if (typeof window === "undefined") return;
  try {
    (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag?.("event", name, params);
  } catch {
    // 統計壞掉不能弄壞網站
  }
}

const SETTLE_MS = 1500;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const lastSent = new Map<string, string>();

export function trackSettled(key: string, name: EventName, params: Params = {}) {
  const pending = timers.get(key);
  if (pending) clearTimeout(pending);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      const sig = JSON.stringify([name, params]);
      if (lastSent.get(key) === sig) return;
      lastSent.set(key, sig);
      track(name, params);
    }, SETTLE_MS),
  );
}

/** 職業、等級一律這樣帶：職業寫名字（報表直接看得懂），另給 10 等一段的等級區間 */
export function jobParams(job: number, level: number): Params {
  const low = Math.floor((Math.max(1, level) - 1) / 10) * 10 + 1;
  return { job: job < 0 ? "未選" : (jobOption(job)?.name ?? (job === 0 ? "初心者" : String(job))), level, level_band: `${low}-${low + 9}` };
}
