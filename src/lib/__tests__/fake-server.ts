import { vi } from "vitest";

/** 假的伺服器：只認得 routes 裡的路徑（忽略 ?v= 版本號），其餘回 404 */
export function stubFetch(routes: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const path = String(input).split("?")[0];
    if (!(path in routes)) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(routes[path]), { status: 200 });
  }));
}
