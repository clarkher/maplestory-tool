import { describe, expect, it, vi } from "vitest";

vi.mock("@neondatabase/serverless", () => ({ neon: vi.fn() }));
const { handle } = await import("./worker");

const fetcher = (name: string) => ({ fetch: vi.fn(async (request: Request) => new Response(`${name} ${new URL(request.url).pathname}`)) });

describe("Cloudflare Worker 分流", () => {
  it("API 交給 route handler，網路位址從 cf-connecting-ip 換成 x-forwarded-for", async () => {
    const seen: Request[] = [];
    const routes = { "/api/speed/board": { GET: async (request: Request) => (seen.push(request), new Response("board")) } };
    const env = { ASSETS: fetcher("assets") };
    const response = await handle(new Request("https://maplehelper.tw/api/speed/board?map=1", { headers: { "cf-connecting-ip": "1.2.3.4" } }), env, routes);
    expect(await response.text()).toBe("board");
    expect(seen[0].headers.get("x-forwarded-for")).toBe("1.2.3.4");
    expect(new URL(seen[0].url).search).toBe("?map=1");
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("v2.25 贊助付款端點走 Cloudflare 限流：超過回 /support?status=failed，不碰 route；沒綁限流就照常", async () => {
    const hit = vi.fn(async () => new Response("pay"));
    const routes = { "/api/donate/linepay": { POST: hit }, "/api/donate/ecpay/notify": { POST: hit } };
    const blocked = { limit: vi.fn(async () => ({ success: false })) };
    const post = (path: string) => new Request(`https://maplehelper.tw${path}`, { method: "POST", headers: { "cf-connecting-ip": "1.2.3.4" } });

    const response = await handle(post("/api/donate/linepay"), { ASSETS: fetcher("assets"), DONATE_LIMITER: blocked }, routes);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://maplehelper.tw/support?status=failed&method=linepay");
    expect(blocked.limit).toHaveBeenCalledWith({ key: "1.2.3.4" });
    expect(hit).not.toHaveBeenCalled();

    // 綠界背景通知不能被限流擋（綠界會一直重送）
    expect(await (await handle(post("/api/donate/ecpay/notify"), { ASSETS: fetcher("assets"), DONATE_LIMITER: blocked }, routes)).text()).toBe("pay");
    // 沒綁（本機、測試）照常
    expect(await (await handle(post("/api/donate/linepay"), { ASSETS: fetcher("assets") }, routes)).text()).toBe("pay");
    const open = { limit: vi.fn(async () => ({ success: true })) };
    expect(await (await handle(post("/api/donate/linepay"), { ASSETS: fetcher("assets"), DONATE_LIMITER: open }, routes)).text()).toBe("pay");
  });

  it("API 不支援的方法回 405 並列出可用方法", async () => {
    const routes = { "/api/boss/rooms": { POST: async () => new Response("ok") } };
    const response = await handle(new Request("https://maplehelper.tw/api/boss/rooms"), { ASSETS: fetcher("assets") }, routes);
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("道具圖轉給道具圖 Worker；沒綁就退回靜態檔", async () => {
    const items = fetcher("items");
    const request = new Request("https://maplehelper.tw/assets/items/1302020.png");
    expect(await (await handle(request, { ASSETS: fetcher("assets"), ITEMS: items })).text()).toBe("items /assets/items/1302020.png");
    expect(await (await handle(request, { ASSETS: fetcher("assets") })).text()).toBe("assets /assets/items/1302020.png");
  });

  it("其他路徑交給靜態檔", async () => {
    const response = await handle(new Request("https://maplehelper.tw/api/nope"), { ASSETS: fetcher("assets") }, {});
    expect(await response.text()).toBe("assets /api/nope");
  });

  it("分享連結 HEAD（真的 route）：200 帶一樣的標頭、沒有內容，靜態檔不會被碰到", async () => {
    const env = { ASSETS: fetcher("assets") };
    const request = new Request("https://maplehelper.tw/api/avatar/share?s=2000&h=30030&f=20000&w=1040002", { method: "HEAD" });
    const response = await handle(request, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(await response.text()).toBe("");
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("分享連結 HEAD 缺 h（真的 route）：302 帶 location、沒有內容", async () => {
    const request = new Request("https://maplehelper.tw/api/avatar/share?s=2000&f=20000&w=1040002", { method: "HEAD" });
    const response = await handle(request, { ASSETS: fetcher("assets") });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://maplehelper.tw/plan/avatar?s=2000&f=20000&w=1040002");
    expect(await response.text()).toBe("");
  });

  it("十一支 API 都有接上（v2.22 加贊助五支）", async () => {
    const { ROUTES } = await import("./worker");
    expect(Object.keys(ROUTES).sort()).toEqual([
      "/api/avatar/share", "/api/boss/events", "/api/boss/intervals", "/api/boss/rooms",
      "/api/donate/ecpay", "/api/donate/ecpay/notify", "/api/donate/ecpay/result", "/api/donate/linepay", "/api/donate/linepay/confirm",
      "/api/speed/board", "/api/speed/runs",
    ]);
  });
});
