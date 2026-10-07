/**
 * 所有頁共用同一份角色：角色列改了，同一個分頁所有用到角色的地方立刻跟著換
 * （同一個分頁寫 localStorage 不會觸發 storage 事件，要自己通知）；別的分頁改了靠 storage 事件。
 * 站內換頁時第一個畫面就讀得到角色，不先閃「讀取你的角色…」。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

type ProfileModule = typeof import("@/lib/profile");

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

let store: ProfileModule;
let win: EventTarget;

/** 每個測試一份全新的模組（角色跟在聽的人都是模組裡共用的），配一個假視窗跟假的本機儲存 */
async function setup(storage = fakeStorage()) {
  vi.resetModules();
  win = new EventTarget();
  vi.stubGlobal("window", win);
  vi.stubGlobal("localStorage", storage);
  store = await import("@/lib/profile");
  return storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("所有頁共用同一份角色", () => {
  it("改角色：同一個分頁所有在聽的地方都收到通知、讀到新角色，也存進本機", async () => {
    const storage = await setup();
    const bar = vi.fn();
    const page = vi.fn();
    store.subscribeProfile(bar);
    store.subscribeProfile(page);

    store.saveProfile({ level: 45, job: 110 });

    expect(bar).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledTimes(1);
    expect(store.readProfile()).toEqual({ level: 45, job: 110 });
    expect(storage.getItem("ms-profile")).toBe('{"level":45,"job":110}');
  });

  it("離開的頁面（取消訂閱）不再收到通知", async () => {
    await setup();
    const gone = vi.fn();
    const stop = store.subscribeProfile(gone);
    stop();

    store.saveProfile({ level: 45, job: 110 });

    expect(gone).not.toHaveBeenCalled();
  });

  it("別的分頁改了角色：這個分頁在聽的地方收到通知、讀到新角色", async () => {
    const storage = await setup();
    const listener = vi.fn();
    store.subscribeProfile(listener);

    storage.setItem("ms-profile", '{"level":60,"job":120}');
    win.dispatchEvent(new Event("storage"));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.readProfile()).toEqual({ level: 60, job: 120 });
  });

  it("瀏覽器不讓存（空間滿了、隱私模式）：畫面照樣換成新角色，只是重新整理後不會記得", async () => {
    await setup(fakeStorage("full"));
    const listener = vi.fn();
    store.subscribeProfile(listener);

    store.saveProfile({ level: 45, job: 110 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.readProfile()).toEqual({ level: 45, job: 110 });
  });

  it("先存不進去、之後又存得進去：讀到的是最後存進去的那個，不會卡在先前沒存進去的", async () => {
    const storage = fakeStorage();
    const realSet = storage.setItem;
    let failures = 1;
    storage.setItem = (key: string, value: string) => {
      if (failures-- > 0) throw new DOMException("空間不夠", "QuotaExceededError");
      realSet(key, value);
    };
    await setup(storage);

    store.saveProfile({ level: 45, job: 110 });
    store.saveProfile({ level: 50, job: 110 });
    storage.setItem("ms-profile", '{"level":60,"job":120}');
    win.dispatchEvent(new Event("storage"));

    expect(store.readProfile()).toEqual({ level: 60, job: 120 });
  });

  it("這個分頁存不進去之後，別的分頁改了角色：讀到別的分頁存的，不會一直卡在這個分頁沒存進去的那份", async () => {
    const storage = fakeStorage();
    const realSet = storage.setItem;
    let failures = 1;
    storage.setItem = (key: string, value: string) => {
      if (failures-- > 0) throw new DOMException("空間不夠", "QuotaExceededError");
      realSet(key, value);
    };
    await setup(storage);

    store.saveProfile({ level: 45, job: 110 });
    storage.setItem("ms-profile", '{"level":60,"job":120}');
    win.dispatchEvent(Object.assign(new Event("storage"), { key: "ms-profile" }));

    expect(store.readProfile()).toEqual({ level: 60, job: 120 });
  });

  it("別的分頁改的是其他設定（例如深色模式）：這個分頁沒存進去的角色照樣留著", async () => {
    await setup(fakeStorage("full"));
    store.saveProfile({ level: 45, job: 110 });

    win.dispatchEvent(Object.assign(new Event("storage"), { key: "ms-theme" }));

    expect(store.readProfile()).toEqual({ level: 45, job: 110 });
  });

  it("本機儲存整個讀不到：當作還沒選職業，頁面不會掛掉", async () => {
    await setup(fakeStorage("broken"));
    expect(store.readProfile()).toEqual({ level: 0, job: -1 });
  });

  it("存了不可能的組合：讀出來改成實際那一轉，等級不超過上限", async () => {
    await setup();
    // 狂戰士 30 等才轉得到：25 等其實還是劍士
    store.saveProfile({ level: 25, job: 110 });
    expect(store.readProfile()).toEqual({ level: 25, job: 100 });
    store.saveProfile({ level: 999, job: 110 });
    expect(store.readProfile()).toEqual({ level: 120, job: 110 });
  });

  it("角色沒變時每次讀到的是同一份（React 才不會一直重畫），變了才換新的", async () => {
    await setup();
    store.saveProfile({ level: 45, job: 110 });
    const first = store.readProfile();

    expect(store.readProfile()).toBe(first);

    store.saveProfile({ level: 46, job: 110 });
    expect(store.readProfile()).not.toBe(first);
    expect(store.readProfile()).toEqual({ level: 46, job: 110 });
  });
});

describe("伺服器上讀不到角色", () => {
  it("伺服器畫的那一版當作還沒讀到（畫讀取中），不會拿空角色去排路線", async () => {
    vi.resetModules();
    const { createElement } = await import("react");
    const { renderToString } = await import("react-dom/server");
    const { useProfile } = await import("@/lib/profile");
    function Probe() {
      const { loaded, profile } = useProfile();
      return createElement("p", null, `${loaded}:${profile.level}:${profile.job}`);
    }
    expect(renderToString(createElement(Probe))).toBe("<p>false:0:-1</p>");
  });
});
