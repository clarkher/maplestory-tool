"use client";

import type {
  FarmingRow, Item, Job, MapRecord, Meta, Monster, PortalEdge, Quest, Region, SearchRow, Skill, TrainingRow,
} from "./types";

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
        return meta.builtAt || "0";
      });
  }
  return versionPromise;
}

function load<T>(name: string): Promise<T> {
  let pending = cache.get(name) as Promise<T> | undefined;
  if (!pending) {
    pending = loadVersion()
      .then(version => fetch(`/data/${name}.json?v=${encodeURIComponent(version)}`, { cache: "force-cache" }))
      .then(response => {
        if (!response.ok) throw new Error(`載入 ${name} 失敗（${response.status}）`);
        return response.json() as Promise<T>;
      });
    cache.set(name, pending as Promise<unknown>);
  }
  return pending;
}

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

/** 地圖顯示名稱：中文優先，缺了才退回英文，兩個都沒有就給編號。 */
export function mapName(maps: Record<string, MapRecord>, id: number | undefined | null): string {
  if (id === undefined || id === null) return "未知地圖";
  const record = maps[String(id)];
  if (!record) return `地圖 ${id}`;
  return record.zh || record.en || `地圖 ${id}`;
}

/** 這張圖的名字是不是只有英文——UI 要據此標註「僅有英文名」。 */
export function isEnglishOnly(maps: Record<string, MapRecord>, id: number): boolean {
  const record = maps[String(id)];
  return Boolean(record && !record.zh && record.en);
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

export function minimapImage(id: number) {
  return `/minimaps/${id}.png`;
}
