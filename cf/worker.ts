// cf/worker.ts
// Cloudflare 上的楓谷幫手：網頁全是 out/ 的靜態檔（Cloudflare 直接回，不算 Worker 請求次數），
// 只有 wrangler.jsonc 的 run_worker_first 列的路徑會跑進來：
//  - /api/*：直接 import src/app/api 的 route handler（跟 Vercel 上同一份程式）
//  - /assets/items/*：道具圖在另一個 Worker（一版 2 萬檔上限拆出去的），經 service binding 轉過去。
//    正式網域改走路由直接打到那個 Worker，不經過這裡（這裡每張圖都算一次請求）
import * as bossEvents from "../src/app/api/boss/events/route";
import * as bossIntervals from "../src/app/api/boss/intervals/route";
import * as bossRooms from "../src/app/api/boss/rooms/route";
import * as speedBoard from "../src/app/api/speed/board/route";
import * as speedRuns from "../src/app/api/speed/runs/route";

type Handler = (request: Request) => Promise<Response>;
type Fetcher = { fetch: (request: Request) => Promise<Response> };
export type Env = { ASSETS: Fetcher; ITEMS?: Fetcher };

export const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  "/api/boss/events": bossEvents,
  "/api/boss/intervals": bossIntervals,
  "/api/boss/rooms": bossRooms,
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
  const route = routes[pathname.replace(/\/$/, "")];
  if (!route) return env.ASSETS.fetch(request);
  const handler = route[request.method];
  if (!handler) return new Response(null, { status: 405, headers: { Allow: Object.keys(route).filter(k => /^[A-Z]+$/.test(k)).join(", ") } });
  return handler(withClientIp(request));
}

export default { fetch: (request: Request, env: Env) => handle(request, env) };
