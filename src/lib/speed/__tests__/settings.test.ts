// src/lib/speed/__tests__/settings.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, parseSettings, readMapMemory, rememberMap } from "../settings";

describe("練功測速的本機設定", () => {
  it("沒存過、存壞了都用預設：不公開、按分享時問角色 ID、自動、沒組隊", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("{壞")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("null")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("[]")).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({ isPublic: false, askId: true, mode: "auto", party: { on: false, others: [], hitter: 0 }, lowHp: false });
  });

  it("存過的照用；欄位不對的換成預設", () => {
    const saved = { isPublic: true, askId: false, mode: "manual", party: { on: true, others: [60, 70], hitter: 1 }, lowHp: true };
    expect(parseSettings(JSON.stringify(saved))).toEqual(saved);
    expect(parseSettings(JSON.stringify({ isPublic: "y", askId: "no", mode: "fast" }))).toEqual(DEFAULT_SETTINGS);
  });

  // 2026-10-20 使用者：角色 ID 不要記（一個人會練很多隻），按分享時問；以前存在這台電腦的 ID 不再讀
  it("以前存的角色 ID 不讀、不留", () => {
    const old = parseSettings(JSON.stringify({ charId: "芙莉蓮", isPublic: true, mode: "auto" }));
    expect("charId" in old).toBe(false);
    expect(old.isPublic).toBe(true);
    expect(old.askId).toBe(true);
  });

  it("舊版存的（沒有組隊欄位）照樣能讀，組隊用預設", () => {
    expect(parseSettings(JSON.stringify({ charId: "芙莉蓮", isPublic: true, mode: "manual" }))).toEqual({
      isPublic: true,
      askId: true,
      mode: "manual",
      party: { on: false, others: [], hitter: 0 },
      lowHp: false,
    });
  });

  it("低血提醒只收 true，舊版沒有這欄、亂填的都當沒開（v1.20）", () => {
    expect(parseSettings(JSON.stringify({ lowHp: true })).lowHp).toBe(true);
    for (const bad of [undefined, "true", 1, null, false]) {
      expect(parseSettings(JSON.stringify({ lowHp: bad })).lowHp).toBe(false);
    }
  });

  it("預設是新的一份：改了回傳的東西不會污染預設", () => {
    const first = parseSettings(null);
    first.party.others.push(50);
    expect(parseSettings(null).party.others).toEqual([]);
    expect(DEFAULT_SETTINGS.party.others).toEqual([]);
  });
});

describe("組隊設定的驗證（逐欄位）", () => {
  const partyOf = (party: unknown) => parseSettings(JSON.stringify({ party })).party;

  it("party 不是物件：整塊用預設", () => {
    for (const bad of [null, 5, "on", true, [], [1, 2]]) {
      expect(partyOf(bad)).toEqual({ on: false, others: [], hitter: 0 });
    }
  });

  it("on 只收 true／false，其他當沒開", () => {
    expect(partyOf({ on: true, others: [50], hitter: 0 }).on).toBe(true);
    expect(partyOf({ on: false, others: [50], hitter: 0 }).on).toBe(false);
    for (const bad of ["true", 1, null, "on"]) {
      expect(partyOf({ on: bad, others: [50], hitter: 0 }).on).toBe(false);
    }
  });

  it("others 只留 1～120 的整數：字串、0、121、1.5、負數、NaN 都丟掉", () => {
    expect(partyOf({ on: true, others: [60, "70", 0, 121, 1.5, -3, null, 1, 120, true], hitter: 0 }).others).toEqual([60, 1, 120]);
    expect(partyOf({ on: true, others: [Number.MAX_SAFE_INTEGER, 50], hitter: 0 }).others).toEqual([50]);
  });

  it("others 不是陣列就當空的", () => {
    for (const bad of ["60,70", 60, { 0: 60 }, null]) {
      expect(partyOf({ on: true, others: bad, hitter: 0 }).others).toEqual([]);
    }
  });

  it("others 最多 5 個：超過的丟掉，先濾掉不對的再算", () => {
    expect(partyOf({ on: true, others: [10, 20, 30, 40, 50, 60, 70], hitter: 0 }).others).toEqual([10, 20, 30, 40, 50]);
    expect(partyOf({ on: true, others: ["x", 10, 0, 20, 30, 40, 50, 60], hitter: 0 }).others).toEqual([10, 20, 30, 40, 50]);
  });

  it("hitter 要是 0～others 個數的整數（0＝自己）；不然改 0", () => {
    const others = [60, 70];
    expect(partyOf({ on: true, others, hitter: 0 }).hitter).toBe(0);
    expect(partyOf({ on: true, others, hitter: 1 }).hitter).toBe(1);
    expect(partyOf({ on: true, others, hitter: 2 }).hitter).toBe(2);
    for (const bad of [3, -1, 1.5, "1", null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(partyOf({ on: true, others, hitter: bad }).hitter).toBe(0);
    }
    expect(partyOf({ on: true, others: [], hitter: 1 }).hitter).toBe(0);
    expect(partyOf({ on: true, others }).hitter).toBe(0);
  });

  it("hitter 照濾過、截過的 others 個數判斷", () => {
    expect(partyOf({ on: true, others: [60, "x"], hitter: 2 }).hitter).toBe(0);
    expect(partyOf({ on: true, others: [10, 20, 30, 40, 50, 60], hitter: 6 }).hitter).toBe(0);
    expect(partyOf({ on: true, others: [10, 20, 30, 40, 50, 60], hitter: 5 }).hitter).toBe(5);
  });

  it("組隊欄位壞掉不影響其他欄位", () => {
    expect(parseSettings(JSON.stringify({ isPublic: true, askId: false, mode: "manual", party: "壞" }))).toEqual({
      isPublic: true,
      askId: false,
      mode: "manual",
      party: { on: false, others: [], hitter: 0 },
      lowHp: false,
    });
  });
});

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("點選過的地圖記憶（存在這台電腦）", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("沒存過是空的", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage() });
    expect(readMapMemory()).toEqual({});
  });

  it("記一筆、再記一筆，都讀得回來；同一個標題重記會換成新的圖", () => {
    const storage = fakeStorage();
    vi.stubGlobal("window", { localStorage: storage });
    rememberMap("0101", 100010000);
    expect(readMapMemory()).toEqual({ "0101": 100010000 });
    rememberMap("1110", 101000000);
    expect(readMapMemory()).toEqual({ "0101": 100010000, "1110": 101000000 });
    rememberMap("0101", 102000000);
    expect(readMapMemory()).toEqual({ "0101": 102000000, "1110": 101000000 });
    // 存的是原樣的 signature，容錯比對在 read-map 做
    expect(JSON.parse(storage.data.get("ms-speed-maps") as string)).toEqual({ "0101": 102000000, "1110": 101000000 });
  });

  it("存壞了（不是 JSON、不是物件、值不是數字）就當沒有或只留好的", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage({ "ms-speed-maps": "{壞" }) });
    expect(readMapMemory()).toEqual({});
    vi.stubGlobal("window", { localStorage: fakeStorage({ "ms-speed-maps": "[1,2]" }) });
    expect(readMapMemory()).toEqual({});
    vi.stubGlobal("window", { localStorage: fakeStorage({ "ms-speed-maps": "null" }) });
    expect(readMapMemory()).toEqual({});
    vi.stubGlobal("window", { localStorage: fakeStorage({ "ms-speed-maps": JSON.stringify({ a: 100010000, b: "2", c: null, d: 3.5, e: Number.MAX_VALUE, f: true }) }) });
    expect(readMapMemory()).toEqual({ a: 100010000 });
  });

  it("壞掉的記憶上再記一筆，會把壞的洗掉、新的留下", () => {
    const storage = fakeStorage({ "ms-speed-maps": "{壞" });
    vi.stubGlobal("window", { localStorage: storage });
    rememberMap("0101", 100010000);
    expect(readMapMemory()).toEqual({ "0101": 100010000 });
  });

  it("瀏覽器不讓用 localStorage（拿不到、讀丟錯、寫丟錯）：不炸、讀到空的", () => {
    const refuse = () => {
      throw new Error("denied");
    };
    // 隱私模式：碰 window.localStorage 本身就丟錯
    vi.stubGlobal("window", {
      get localStorage(): never {
        return refuse();
      },
    });
    expect(readMapMemory()).toEqual({});
    expect(() => rememberMap("0101", 1)).not.toThrow();
    // 空間滿了：讀得到、寫丟錯
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: refuse } });
    expect(readMapMemory()).toEqual({});
    expect(() => rememberMap("0101", 1)).not.toThrow();
    // 讀丟錯
    vi.stubGlobal("window", { localStorage: { getItem: refuse, setItem: refuse } });
    expect(readMapMemory()).toEqual({});
    expect(() => rememberMap("0101", 1)).not.toThrow();
  });

  it("伺服器上沒有 window：不炸、讀到空的", () => {
    vi.unstubAllGlobals();
    expect(typeof window).toBe("undefined");
    expect(readMapMemory()).toEqual({});
    expect(() => rememberMap("0101", 1)).not.toThrow();
  });
});
