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

  it("五支 API 都有接上", async () => {
    const { ROUTES } = await import("./worker");
    expect(Object.keys(ROUTES).sort()).toEqual(["/api/boss/events", "/api/boss/intervals", "/api/boss/rooms", "/api/speed/board", "/api/speed/runs"]);
  });
});
