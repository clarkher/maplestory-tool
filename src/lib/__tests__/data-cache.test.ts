/**
 * 同一次瀏覽只載一次：載過的資料要能同步拿到，再進同一頁時第一個畫面就有清單，
 * 不會先閃「載入中」（按返回時瀏覽器也才捲得回原處）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DataModule = typeof import("@/lib/data");

/** 假的伺服器：只認得 routes 裡的路徑（忽略 ?v= 版本號），其餘回 404 */
function stubFetch(routes: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const path = String(input).split("?")[0];
    if (!(path in routes)) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(routes[path]), { status: 200 });
  }));
}

let data: DataModule;
beforeEach(async () => {
  // 每個測試拿一份全新的模組，快取不會互相影響
  vi.resetModules();
  data = await import("@/lib/data");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("同一次瀏覽只載一次", () => {
  it("還沒載過，拿不到現成的資料", () => {
    stubFetch({});
    expect(data.peekItems()).toBeNull();
  });

  it("載過一次，之後同步拿得到同一份資料", async () => {
    stubFetch({ "/data/meta.json": { builtAt: "t1" }, "/data/items.json": [{ id: 1302000, n: "劍" }] });
    const items = await data.loadItems();
    expect(data.peekItems()).toBe(items);
    expect(data.peekItems()).toEqual([{ id: 1302000, n: "劍" }]);
  });

  it("載入失敗不留東西，畫面照樣顯示錯誤", async () => {
    stubFetch({ "/data/meta.json": { builtAt: "t1" } });
    await expect(data.loadItems()).rejects.toThrow("載入 items 失敗（404）");
    expect(data.peekItems()).toBeNull();
  });
});
