import { afterEach, describe, expect, it, vi } from "vitest";
import { recall, remember } from "@/lib/remember";

/** 假的 sessionStorage：關掉分頁才清，重新整理還在 */
function fakeSessionStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("重新整理之後還在，關掉分頁才清", () => {
  it("記住之後重新整理（程式重新載入）：還拿得到", async () => {
    vi.stubGlobal("sessionStorage", fakeSessionStorage());
    vi.resetModules();
    const before = await import("@/lib/remember");
    before.remember("db:道具:query", "楓葉");
    before.remember("db:道具:visible", 180);
    vi.resetModules();
    const after = await import("@/lib/remember");
    expect(after.recall("db:道具:query", "")).toBe("楓葉");
    expect(after.recall("db:道具:visible", 60)).toBe(180);
  });

  it("瀏覽器不讓用 sessionStorage（例如隱私模式）：這次瀏覽照樣記得，不會出錯", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    vi.resetModules();
    const fresh = await import("@/lib/remember");
    fresh.remember("db:怪物:showUnnamed", true);
    expect(fresh.recall("db:怪物:showUnnamed", false)).toBe(true);
  });
});

describe("查資料頁記住搜尋和篩選（記到關掉分頁為止）", () => {
  it("第一次進來用預設值", () => {
    expect(recall("db:測試:query", "")).toBe("");
    expect(recall("db:測試:visible", 60)).toBe(60);
  });

  it("記過就用記的，每一頁各記各的", () => {
    remember("db:道具:query", "劍");
    remember("db:怪物:query", "嫩寶");
    expect(recall("db:道具:query", "")).toBe("劍");
    expect(recall("db:怪物:query", "")).toBe("嫩寶");
  });

  it("記的是空字串、0、false 也照用，不會被當成沒記", () => {
    remember("db:任務:query", "");
    remember("db:道具:onlyDroppable", false);
    remember("db:技能:visible", 0);
    expect(recall("db:任務:query", "楓葉")).toBe("");
    expect(recall("db:道具:onlyDroppable", true)).toBe(false);
    expect(recall("db:技能:visible", 60)).toBe(0);
  });
});
