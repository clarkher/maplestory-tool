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

/** 自己人不算流量（v2.08）：網址帶過一次 ?ga_off=1 的瀏覽器一直不送（記在 localStorage GA_OFF_KEY），?ga_off=0 解除 */
export const GA_OFF_KEY = "ms-ga-off";

export function gaOptOut(search: string, stored: string | null): boolean {
  const flag = new URLSearchParams(search).get("ga_off");
  if (flag === "1") return true;
  if (flag === "0") return false;
  return stored === "1";
}

export type EventName =
  | "tool_click"
  | "detail_page_click"
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
  | "share"
  | "donate_click";

type Params = Record<string, string | number | boolean | undefined>;

export function track(name: EventName, params: Params = {}) {
  if (typeof window === "undefined") return;
  try {
    (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag?.("event", name, params);
  } catch {
    // 統計壞掉不能弄壞網站
  }
}

/** 連結上標 data-ga 的種類：tool＝單獨頁底下連到工具那顆、detail_page＝查資料卡片底下連到單獨頁那行 */
const LINK_EVENTS: Record<string, EventName> = { tool: "tool_click", detail_page: "detail_page_click" };

const DONATE_PLACEMENTS = new Set(["footer", "guide_end", "support_page"]);

/**
 * 點了標過的連結要送什麼（v2.08）：from＝從哪一類頁（db/monsters、jobs…），page＝那一頁，to＝點去哪（不帶 ?#，報表才不會散成上千列），label＝按鈕字。
 * 沒標、標錯回 null。GoogleAnalytics 元件在整頁聽點擊，伺服器元件（SeoPage）不用改成 client。
 */
export function linkClick(kind: string | undefined, pathname: string, href: string, label: string, placement?: string): { name: EventName; params: Params } | null {
  // v2.22 贊助：頁尾、攻略文結尾連到 /support 的連結標 data-ga="donate" data-placement="…"；method=page＝只是進 /support
  if (kind === "donate") return placement && DONATE_PLACEMENTS.has(placement) ? { name: "donate_click", params: { placement, method: "page" } } : null;
  const name = kind ? LINK_EVENTS[kind] : undefined;
  if (!name) return null;
  const segments = pathname.split("/").filter(Boolean);
  const from = segments[0] === "db" ? segments.slice(0, 2).join("/") : (segments[0] ?? "home");
  return { name, params: { from, page: pathname, to: href.split(/[?#]/)[0] || "/", label: label.trim() } };
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
