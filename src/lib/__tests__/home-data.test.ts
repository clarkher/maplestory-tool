/**
 * 首頁要的遊戲資料跟攻略：這次瀏覽載過就同步拿到，從別頁換回首頁時第一個畫面就是完整路線，
 * 不先畫「幫你排路線…」、主推卡也不先放骨架。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubFetch } from "./fake-server";

type DataModule = typeof import("@/lib/data");
type HomeModule = typeof import("@/lib/home-data");

const MAPS = { "100000000": { zh: "弓箭手村" }, "100000001": { zh: "弓箭手村東邊的草原" }, "101000000": { zh: "魔法森林" } };
// 弓箭手村 → 東邊草原、魔法森林 → 弓箭手村：東邊草原沒有往外的傳送門，但走得到
const GRAPH = {
  "100000000": [[100000001, "east00", 0, 0]],
  "101000000": [[100000000, "west00", 0, 0]],
};
const FILES = {
  "/data/meta.json": { builtAt: "t1" },
  "/data/maps.json": MAPS,
  "/data/monsters.json": [{ id: 100100, n: "嫩寶", lv: 1 }],
  "/data/quests.json": [{ id: 1000, n: "冒險家的戒指" }],
  "/data/training.json": [{ m: 100000001, lv: 1 }],
  "/data/guides/common.json": { builtAt: "g1", researchedAt: "2026-10-01" },
  "/data/graph.json": GRAPH,
  "/data/nearest-town.json": { "100000001": [100000000, 1] },
};

let data: DataModule;
let home: HomeModule;
beforeEach(async () => {
  // 每個測試一份全新的模組：上一個測試載過的資料不會留下來
  vi.resetModules();
  data = await import("@/lib/data");
  home = await import("@/lib/home-data");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("首頁要的遊戲資料", () => {
  it("還沒載過：拿不到", () => {
    stubFetch(FILES);
    expect(home.peekHomeData()).toBeNull();
  });

  it("八份都載過：同步拿到一整份，「帶我去」走得到的圖包含傳送門的兩端", async () => {
    stubFetch(FILES);
    await home.loadHomeData();
    expect(home.peekHomeData()).toEqual({
      maps: MAPS,
      monsters: [{ id: 100100, n: "嫩寶", lv: 1 }],
      quests: [{ id: 1000, n: "冒險家的戒指" }],
      training: [{ m: 100000001, lv: 1 }],
      common: { builtAt: "g1", researchedAt: "2026-10-01" },
      meta: { builtAt: "t1" },
      graph: GRAPH,
      nearestTown: { "100000001": [100000000, 1] },
      routable: new Set([100000000, 100000001, 101000000]),
    });
  });

  // meta 不在裡面：載任何一份遊戲資料都會先載 meta（版本號）
  const LOADERS = ["loadMaps", "loadMonsters", "loadQuests", "loadTraining", "loadGuideCommon", "loadGraph", "loadNearestTown"] as const;
  it.each(LOADERS)("只差 %s 那一份沒載過：拿不到（首頁先顯示排路線中，等它載完）", async missing => {
    stubFetch(FILES);
    await Promise.all(LOADERS.filter(name => name !== missing).map(name => data[name]()));
    expect(home.peekHomeData()).toBeNull();
  });

  it("有一份載不到：錯誤照樣丟出來（首頁顯示讀取失敗），也拿不到資料", async () => {
    const { "/data/graph.json": _graph, ...withoutGraph } = FILES;
    stubFetch(withoutGraph);
    await expect(home.loadHomeData()).rejects.toThrow("載入 graph 失敗（404）");
    expect(home.peekHomeData()).toBeNull();
  });
});

describe("首頁要的攻略", () => {
  it("要整條職業線的攻略（三轉十字軍：十字軍、狂戰士、劍士）；初心者、還沒選職業不用", () => {
    expect(home.guideJobs(111)).toEqual([111, 110, 100]);
    expect(home.guideJobs(0)).toEqual([]);
    expect(home.guideJobs(-1)).toEqual([]);
  });

  describe("打開「換其他職業」時先在背景載的攻略：畫面上看得到的職業鈕", () => {
    it("狂戰士：五個一轉，加上劍士這一系的二轉、三轉", () => {
      expect([...home.guidesToPrefetch(110)].sort((a, b) => a - b)).toEqual([100, 110, 111, 120, 121, 130, 131, 200, 300, 400, 500]);
    });

    it("三轉神槍手：五個一轉，加上海盜這一系（打手、槍手、格鬥家、神槍手）", () => {
      expect([...home.guidesToPrefetch(521)].sort((a, b) => a - b)).toEqual([100, 200, 300, 400, 500, 510, 511, 520, 521]);
    });

    it("初心者、還沒選職業：選單只看得到五個一轉", () => {
      expect([...home.guidesToPrefetch(0)].sort((a, b) => a - b)).toEqual([100, 200, 300, 400, 500]);
      expect([...home.guidesToPrefetch(-1)].sort((a, b) => a - b)).toEqual([100, 200, 300, 400, 500]);
    });
  });

  describe("攻略其實都載好了，畫面卻還停在讀取中或讀取失敗", () => {
    const GUIDES = {
      "/data/guides/common.json": { builtAt: "g1" },
      "/data/guides/110.json": { job: 110 },
      "/data/guides/100.json": { job: 100 },
    };

    it("畫面還在讀取中（攻略剛好在這次渲染之後才載好）：換成載好的", async () => {
      stubFetch(GUIDES);
      const stuck = { job: 110, guides: new Map(), status: "loading" as const };
      await Promise.all([data.loadGuide(110), data.loadGuide(100)]);
      const next = home.settleGuides(stuck, 110);
      expect(next.status).toBe("ready");
      expect([...next.guides.keys()].sort()).toEqual([100, 110]);
    });

    it("之前讀取失敗、後來被預載重抓成功：「讀取失敗」換成載好的", async () => {
      stubFetch(GUIDES);
      const failed = { job: 110, guides: new Map(), status: "failed" as const };
      await Promise.all([data.loadGuide(110), data.loadGuide(100)]);
      expect(home.settleGuides(failed, 110).status).toBe("ready");
    });

    it("已經是載好的、職業對不上、或還有沒載好的：不動（同一份，不重畫）", async () => {
      stubFetch(GUIDES);
      await data.loadGuide(110);
      const loading = { job: 110, guides: new Map(), status: "loading" as const };
      expect(home.settleGuides(loading, 110)).toBe(loading);
      expect(home.settleGuides(loading, 120)).toBe(loading);
      await data.loadGuide(100);
      const ready = home.settleGuides(loading, 110);
      expect(home.settleGuides(ready, 110)).toBe(ready);
    });
  });

  describe("換到某個職業那一次渲染的攻略狀態", () => {
    const GUIDES = {
      "/data/guides/common.json": { builtAt: "g1" },
      "/data/guides/110.json": { job: 110 },
      "/data/guides/100.json": { job: 100 },
    };

    it("整條線這次瀏覽都載過：直接用，不先放骨架", async () => {
      stubFetch(GUIDES);
      await Promise.all([data.loadGuide(110), data.loadGuide(100)]);
      const { guides, status } = home.guidesFor(110, new Map());
      expect(status).toBe("ready");
      expect([...guides.keys()].sort()).toEqual([100, 110]);
    });

    it("還有一份沒載過：先放骨架，不拿上一個職業的狀態畫一張不對的主推卡", async () => {
      stubFetch(GUIDES);
      await data.loadGuide(110);
      const { guides, status } = home.guidesFor(110, new Map());
      expect(status).toBe("loading");
      expect([...guides.keys()]).toEqual([110]);
    });

    it("要的都已經在畫面上：沿用同一份，整條路線不用重算", async () => {
      stubFetch(GUIDES);
      await Promise.all([data.loadGuide(110), data.loadGuide(100)]);
      const shown = home.guidesFor(110, new Map()).guides;
      expect(home.guidesFor(110, shown).guides).toBe(shown);
    });

    it("換到還沒載過的職業：先放骨架，已經在畫面上的照樣留著", async () => {
      stubFetch(GUIDES);
      await Promise.all([data.loadGuide(110), data.loadGuide(100)]);
      const shown = home.guidesFor(110, new Map()).guides;
      const next = home.guidesFor(210, shown);
      expect(next.status).toBe("loading");
      expect(next.guides).toBe(shown);
    });

    it("初心者、還沒選職業：不用攻略，畫面上的不動", () => {
      const shown = new Map();
      expect(home.guidesFor(0, shown)).toEqual({ guides: shown, status: "loading" });
      expect(home.guidesFor(-1, shown).guides).toBe(shown);
    });
  });

  it("載過的才拿得到：狂戰士整條線載完才是兩份都有", async () => {
    stubFetch({
      "/data/guides/common.json": { builtAt: "g1" },
      "/data/guides/110.json": { job: 110 },
      "/data/guides/100.json": { job: 100 },
    });
    await data.loadGuide(110);
    expect([...home.cachedGuides([110, 100]).keys()]).toEqual([110]);

    await data.loadGuide(100);
    const both = home.cachedGuides([110, 100]);
    expect([...both.keys()]).toEqual([110, 100]);
    expect(both.get(100)).toEqual({ job: 100 });
  });
});
