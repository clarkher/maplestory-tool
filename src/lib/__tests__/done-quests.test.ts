import { afterEach, describe, expect, it, vi } from "vitest";

type DoneModule = typeof import("@/lib/done-quests");

/** 假的 localStorage，跟瀏覽器一樣只存字串。full：寫入丟錯（空間滿了、隱私模式）；broken：連讀都丟錯（停用網站資料） */
function fakeStorage(mode: "ok" | "full" | "broken" = "ok") {
  const data = new Map<string, string>();
  return {
    getItem(key: string) {
      if (mode === "broken") throw new DOMException("停用網站資料", "SecurityError");
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (mode !== "ok") throw new DOMException("空間不夠", "QuotaExceededError");
      data.set(key, String(value));
    },
    removeItem(key: string) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    get length() {
      return data.size;
    },
  };
}

let store: DoneModule;
let win: EventTarget;

/** 每個測試一份全新的模組（打勾的任務跟在聽的人都是模組裡共用的），配一個假視窗跟假的本機儲存 */
async function setup(storage = fakeStorage()) {
  vi.resetModules();
  win = new EventTarget();
  vi.stubGlobal("window", win);
  vi.stubGlobal("localStorage", storage);
  store = await import("@/lib/done-quests");
  return storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("做完的任務記在瀏覽器", () => {
  it("沒存過、存壞了、存的不是陣列：一個都沒做", async () => {
    await setup();
    expect(store.parseDoneQuests("").size).toBe(0);
    expect(store.parseDoneQuests("{壞掉").size).toBe(0);
    expect(store.parseDoneQuests('{"a":1}').size).toBe(0);
    expect([...store.parseDoneQuests('["1045",7,"2078"]')]).toEqual(["1045", "2078"]);
  });

  it("打勾：存進本機（排好序的陣列）、同一個分頁在聽的都收到通知；取消打勾拿掉", async () => {
    const storage = await setup();
    const listener = vi.fn();
    store.subscribeDoneQuests(listener);
    store.setQuestDone("2078", true);
    store.setQuestDone("1045", true);
    expect(storage.getItem("ms-done-quests")).toBe('["1045","2078"]');
    expect(listener).toHaveBeenCalledTimes(2);
    store.setQuestDone("2078", false);
    expect([...store.readDoneQuests()]).toEqual(["1045"]);
  });

  it("存的字沒變就回同一份（React 不會一直重畫）", async () => {
    await setup();
    store.setQuestDone("1045", true);
    expect(store.readDoneQuests()).toBe(store.readDoneQuests());
  });

  it("別的分頁打勾：這個分頁收到通知、讀到新的", async () => {
    const storage = await setup();
    const listener = vi.fn();
    store.subscribeDoneQuests(listener);
    storage.setItem("ms-done-quests", '["1045"]');
    win.dispatchEvent(new Event("storage"));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.readDoneQuests().has("1045")).toBe(true);
  });

  it("瀏覽器不讓存：這個分頁照樣記得，只是重新整理後不會記得", async () => {
    await setup(fakeStorage("full"));
    store.setQuestDone("1045", true);
    expect(store.readDoneQuests().has("1045")).toBe(true);
  });
});
