/**
 * 同一次瀏覽只載一次：載過的資料要能同步拿到，再進同一頁時第一個畫面就有清單，
 * 不會先閃「載入中」（按返回時瀏覽器也才捲得回原處）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubFetch } from "./fake-server";

type DataModule = typeof import("@/lib/data");

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

describe("首頁的攻略跟裝備卡也一樣（換頁回首頁不先放骨架）", () => {
  it("職業攻略載過一次，之後同步拿得到；還沒載過的職業拿不到", async () => {
    stubFetch({ "/data/guides/common.json": { builtAt: "g1" }, "/data/guides/110.json": { job: 110, builds: [] } });
    const guide = await data.loadGuide(110);
    expect(data.peekGuide(110)).toBe(guide);
    expect(data.peekGuide(120)).toBeNull();
  });

  it("職業攻略載入失敗不留東西", async () => {
    stubFetch({ "/data/guides/common.json": { builtAt: "g1" } });
    await expect(data.loadGuide(110)).rejects.toThrow("載入攻略失敗（404）");
    expect(data.peekGuide(110)).toBeNull();
  });

  it("裝備卡資料載過一次，之後同步拿得到", async () => {
    stubFetch({ "/data/gear.json": { builtAt: "e1", weapons: [], scrolls: [], rules: [], notes: [] } });
    const gear = await data.loadGear();
    expect(data.peekGear()).toBe(gear);
  });

  it("裝備卡資料載入失敗不留東西", async () => {
    stubFetch({});
    await expect(data.loadGear()).rejects.toThrow("載入裝備資料失敗（404）");
    expect(data.peekGear()).toBeNull();
  });
});
