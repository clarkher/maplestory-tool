import { vi } from "vitest";

/** 假的伺服器：只認得 routes 裡的路徑（忽略 ?v= 版本號），其餘回 404。回傳假的 fetch，可以數請求了幾次 */
export function stubFetch(routes: Record<string, unknown>) {
  const fake = vi.fn(async (input: string) => {
    const path = String(input).split("?")[0];
    if (!(path in routes)) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(routes[path]), { status: 200 });
  });
  vi.stubGlobal("fetch", fake);
  return fake;
}

/** 某個路徑被請求了幾次 */
export function requestsTo(fake: ReturnType<typeof stubFetch>, path: string) {
  return fake.mock.calls.filter(([input]) => String(input).split("?")[0] === path).length;
}
