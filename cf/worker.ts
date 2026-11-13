// cf/worker.ts
// Cloudflare 上的楓谷幫手：網頁全是 out/ 的靜態檔（Cloudflare 直接回，不算 Worker 請求次數），
// 只有 wrangler.jsonc 的 run_worker_first 列的路徑會跑進來：
//  - /api/*：直接 import src/app/api 的 route handler（跟 Vercel 上同一份程式）
//  - /assets/items/*：道具圖在另一個 Worker（一版 2 萬檔上限拆出去的），經 service binding 轉過去。
//    正式網域改走路由直接打到那個 Worker，不經過這裡（這裡每張圖都算一次請求）
import * as avatarShare from "../src/app/api/avatar/share/route";
import * as bossEvents from "../src/app/api/boss/events/route";
import * as bossIntervals from "../src/app/api/boss/intervals/route";
import * as bossRooms from "../src/app/api/boss/rooms/route";
import * as donateEcpay from "../src/app/api/donate/ecpay/route";
import * as donateEcpayNotify from "../src/app/api/donate/ecpay/notify/route";
import * as donateEcpayResult from "../src/app/api/donate/ecpay/result/route";
import * as donateLinePay from "../src/app/api/donate/linepay/route";
import * as donateLinePayConfirm from "../src/app/api/donate/linepay/confirm/route";
import * as speedBoard from "../src/app/api/speed/board/route";
import * as speedRuns from "../src/app/api/speed/runs/route";

type Handler = (request: Request) => Promise<Response>;
type Fetcher = { fetch: (request: Request) => Promise<Response> };
type RateLimit = { limit: (options: { key: string }) => Promise<{ success: boolean }> };
export type Env = { ASSETS: Fetcher; ITEMS?: Fetcher; DONATE_LIMITER?: RateLimit };

/**
 * 贊助付款端點防灌（v2.25）：wrangler.jsonc 的 ratelimits 綁定 DONATE_LIMITER（同位址一分鐘 5 次）。
 * v2.24 原本放 Worker 記憶體，測試機實測連按 7 次都過（請求分到不同 isolate），改用 Cloudflare 的限流。
 * 只擋開付款單的兩支；綠界背景通知、付完導回不擋。沒綁（本機、測試）就不限。
 */
const DONATE_START: Record<string, "ecpay" | "linepay"> = { "/api/donate/ecpay": "ecpay", "/api/donate/linepay": "linepay" };

async function donateBlocked(request: Request, path: string, env: Env): Promise<Response | null> {
  const method = DONATE_START[path];
  if (!method || !env.DONATE_LIMITER) return null;
  const key = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success } = await env.DONATE_LIMITER.limit({ key });
  return success ? null : Response.redirect(`${new URL(request.url).origin}/support?status=failed&method=${method}`, 303);
}

export const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  "/api/avatar/share": avatarShare,
  "/api/boss/events": bossEvents,
  "/api/boss/intervals": bossIntervals,
  "/api/boss/rooms": bossRooms,
  "/api/donate/ecpay": donateEcpay,
  "/api/donate/ecpay/notify": donateEcpayNotify,
  "/api/donate/ecpay/result": donateEcpayResult,
  "/api/donate/linepay": donateLinePay,
  "/api/donate/linepay/confirm": donateLinePayConfirm,
  "/api/speed/board": speedBoard,
  "/api/speed/runs": speedRuns,
};

/** route handler 拿 x-forwarded-for 的第一個當網路位址（Vercel 的寫法）；Cloudflare 的真實位址在 cf-connecting-ip */
function withClientIp(request: Request): Request {
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip) return request;
  const headers = new Headers(request.headers);
  headers.set("x-forwarded-for", ip);
  return new Request(request, { headers });
}

export async function handle(request: Request, env: Env, routes = ROUTES): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname.startsWith("/assets/items/")) return env.ITEMS ? env.ITEMS.fetch(request) : env.ASSETS.fetch(request);
  const path = pathname.replace(/\/$/, "");
  const route = routes[path];
  if (!route) return env.ASSETS.fetch(request);
  const handler = route[request.method];
  if (!handler) return new Response(null, { status: 405, headers: { Allow: Object.keys(route).filter(k => /^[A-Z]+$/.test(k)).join(", ") } });
  if (request.method === "POST") {
    const blocked = await donateBlocked(request, path, env);
    if (blocked) return blocked;
  }
  return handler(withClientIp(request));
}

export default { fetch: (request: Request, env: Env) => handle(request, env) };
