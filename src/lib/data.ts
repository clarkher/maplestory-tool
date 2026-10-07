"use client";

import type {
  FarmingRow, GuideCommon, GuideJob, Item, Job, MapRecord, Meta, Monster, PortalEdge, Quest, Region, SearchRow, Skill,
  TrainingRow,
} from "./types";
import type { GearData } from "./gear";

/**
 * 資料檔全部是編譯期產生的靜態 JSON，第一次用到才抓、抓過就留著。
 * 原站把 19MB 的道具資料當同步 script 一次吞掉，這裡刻意反過來：
 * 首頁只需要 meta，要查道具才會載道具。
 */
const cache = new Map<string, Promise<unknown>>();

/**
 * meta 一定要繞過瀏覽器快取。
 *
 * 一開始所有資料檔都用 force-cache + max-age 一小時，結果遊戲資料更新後，
 * 已經來過的人還是拿到舊檔，自動更新等於沒作用（實際看到畫面上還是舊的地圖名）。
 * 現在改成：meta 每次重新驗證，其他檔案掛上 meta 的建置時間當版本號——
 * 沒改版就命中快取，改版了網址就變，立刻拿到新的。
 */
let versionPromise: Promise<string> | null = null;

function loadVersion(): Promise<string> {
  if (!versionPromise) {
    versionPromise = fetch("/data/meta.json", { cache: "no-cache" })
      .then(response => {
        if (!response.ok) throw new Error(`載入 meta 失敗（${response.status}）`);
        return response.json() as Promise<Meta>;
      })
      .then(meta => {
        cache.set("meta", Promise.resolve(meta));
        ready.set("meta", meta);
        return meta.builtAt || "0";
      });
  }
  return versionPromise;
}

/**
 * 已經載好的資料，同步拿得到。Promise 就算早就完成，也要等下一輪才拿到值，
 * 頁面會先畫一次「載入中」；再進同一頁時直接從這裡拿，第一個畫面就是完整清單。
 */
const ready = new Map<string, unknown>();

function load<T>(name: string): Promise<T> {
  let pending = cache.get(name) as Promise<T> | undefined;
  if (!pending) {
    pending = loadVersion()
      .then(version => fetch(`/data/${name}.json?v=${encodeURIComponent(version)}`, { cache: "force-cache" }))
      .then(response => {
        if (!response.ok) throw new Error(`載入 ${name} 失敗（${response.status}）`);
        return response.json() as Promise<T>;
      })
      .then(data => {
        ready.set(name, data);
        return data;
      });
    cache.set(name, pending as Promise<unknown>);
  }
  return pending;
}

function peek<T>(name: string): T | null {
  return (ready.get(name) as T | undefined) ?? null;
}

/** 查資料四頁、首頁用：載過就同步拿到，沒載過是 null */
export const peekMaps = () => peek<Record<string, MapRecord>>("maps");
export const peekMonsters = () => peek<Monster[]>("monsters");
export const peekItems = () => peek<Item[]>("items");
export const peekQuests = () => peek<Quest[]>("quests");
export const peekSkills = () => peek<Skill[]>("skills");
export const peekMeta = () => peek<Meta>("meta");
export const peekTraining = () => peek<TrainingRow[]>("training");
export const peekGraph = () => peek<Record<string, PortalEdge[]>>("graph");
export const peekNearestTown = () => peek<Record<string, [number, number]>>("nearest-town");
export const peekGear = () => peek<GearData>("gear");
export const peekGuideCommon = () => peek<GuideCommon>("guides/common");
export const peekGuide = (job: number) => peek<GuideJob>(`guides/${job}`);
export const peekFarming = () => peek<Record<string, FarmingRow[]>>("farming");

export const loadMeta = (): Promise<Meta> => {
  const cached = cache.get("meta") as Promise<Meta> | undefined;
  if (cached) return cached;
  return loadVersion().then(() => cache.get("meta") as Promise<Meta>);
};
export const loadMaps = () => load<Record<string, MapRecord>>("maps");
export const loadGraph = () => load<Record<string, PortalEdge[]>>("graph");
export const loadNearestTown = () => load<Record<string, [number, number]>>("nearest-town");
export const loadMonsters = () => load<Monster[]>("monsters");
export const loadItems = () => load<Item[]>("items");
export const loadQuests = () => load<Quest[]>("quests");
export const loadSkills = () => load<Skill[]>("skills");
export const loadJobs = () => load<Job[]>("jobs");
export const loadTraining = () => load<TrainingRow[]>("training");
export const loadFarming = () => load<Record<string, FarmingRow[]>>("farming");
export const loadRegions = () => load<Region[]>("regions");
export const loadSearch = () => load<SearchRow[]>("search");
/**
 * 裝備卡的資料：一半是玩家攻略（研究檔），研究改了但遊戲資料沒變時 meta 的版本號不會動，
 * 跟 guides/common.json 一樣每次回伺服器確認（next.config 對 /data/gear.json 設 must-revalidate），沒變就 304。
 */
let gearPromise: Promise<GearData> | null = null;
export function loadGear(): Promise<GearData> {
  if (!gearPromise) {
    gearPromise = fetch("/data/gear.json", { cache: "no-cache" })
      .then(response => {
        if (!response.ok) throw new Error(`載入裝備資料失敗（${response.status}）`);
        return response.json() as Promise<GearData>;
      })
      .then(gear => {
        ready.set("gear", gear);
        return gear;
      });
    // 載失敗不要記住，下次再試
    gearPromise.catch(() => {
      gearPromise = null;
    });
  }
  return gearPromise;
}
/**
 * 玩家攻略跟遊戲資料是兩條獨立的更新線，不能共用 meta 的版本號——
 * 攻略改了但遊戲資料沒變時，瀏覽器會一直拿快取的舊攻略。
 * 所以 common.json 每次回伺服器確認，每職一檔的攻略掛 common 的建置時間當版本號。
 */
let guideCommon: Promise<GuideCommon> | null = null;

export function loadGuideCommon(): Promise<GuideCommon> {
  if (!guideCommon) {
    guideCommon = fetch("/data/guides/common.json", { cache: "no-cache" })
      .then(response => {
        if (!response.ok) throw new Error(`載入攻略失敗（${response.status}）`);
        return response.json() as Promise<GuideCommon>;
      })
      .then(common => {
        ready.set("guides/common", common);
        return common;
      });
    // 載失敗不要記住，下次再試（打開「換其他職業」會先在背景載攻略，網路一時不穩不能讓攻略一直讀不到）
    guideCommon.catch(() => {
      guideCommon = null;
    });
  }
  return guideCommon;
}

/** 每個職業一檔，只載自己職業的 */
export function loadGuide(job: number): Promise<GuideJob> {
  const name = `guides/${job}`;
  let pending = cache.get(name) as Promise<GuideJob> | undefined;
  if (!pending) {
    pending = loadGuideCommon()
      .then(common => fetch(`/data/${name}.json?v=${encodeURIComponent(common.builtAt)}`, { cache: "force-cache" }))
      .then(response => {
        if (!response.ok) throw new Error(`載入攻略失敗（${response.status}）`);
        return response.json() as Promise<GuideJob>;
      })
      .then(guide => {
        ready.set(name, guide);
        return guide;
      });
    cache.set(name, pending);
    // 載失敗不要記住，下次再試（同上）
    const failed = pending;
    failed.catch(() => {
      if (cache.get(name) === failed) cache.delete(name);
    });
  }
  return pending;
}

/**
 * 地圖顯示名稱。
 * 只用中文——沒有中文名的地圖屬於還沒開放的內容，顯示英文原名對玩家沒有幫助
 * （遊戲裡看到的是中文），套別的版本的中文名又會給錯地名。
 */
export function mapName(maps: Record<string, MapRecord>, id: number | undefined | null): string {
  if (id === undefined || id === null) return "未知地圖";
  return maps[String(id)]?.zh || "未開放地圖";
}

export function mapStreet(maps: Record<string, MapRecord>, id: number): string {
  return maps[String(id)]?.st || "";
}

export function monsterImage(id: number) {
  return `/assets/monster_frames/${id}.png`;
}

export function itemImage(id: number) {
  return `/assets/items/${id}.png`;
}

export function npcImage(id: number) {
  return `/assets/npcs/${id}.png`;
}

export function skillImage(id: number) {
  return `/assets/skills/${id}.png`;
}

export function minimapImage(id: number) {
  return `/minimaps/${id}.png`;
}
