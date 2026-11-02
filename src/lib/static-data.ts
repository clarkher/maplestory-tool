/**
 * 伺服器（建置時）讀 public/data 的資料檔，給靜態的怪物／任務／技能／職業頁用。
 * 瀏覽器那邊照舊走 data.ts 的 fetch；這裡只在 server component、generateStaticParams 裡用。
 */
import fs from "node:fs";
import path from "node:path";
import type { AtlasIndex, AtlasMap, AtlasNpc, GuideJob, Item, MapRecord, Meta, Monster, Quest, Skill } from "./types";

const cache = new Map<string, unknown>();

function read<T>(name: string): T {
  if (!cache.has(name)) {
    const file = path.join(process.cwd(), "public", "data", `${name}.json`);
    cache.set(name, JSON.parse(fs.readFileSync(file, "utf8")));
  }
  return cache.get(name) as T;
}

export const staticMaps = () => read<Record<string, MapRecord>>("maps");
export const staticMeta = () => read<Meta>("meta");
/** 沒有名字的怪（活動、未啟用）不出頁 */
export const staticMonsters = () => read<Monster[]>("monsters").filter(monster => !monster.un);
export const staticQuests = () => read<Quest[]>("quests");
export const staticSkills = () => read<Skill[]>("skills");
/** 地圖＋NPC 圖鑑：每張收進來的圖（地圖頁 /db/maps/[id]） */
export const staticAtlasMaps = () => read<AtlasMap[]>("atlas-maps");
/** 地圖＋NPC 圖鑑：每個 NPC（NPC 頁 /db/npcs/[id]） */
export const staticNpcs = () => read<AtlasNpc[]>("npcs");
/** 有頁的圖、NPC 的 id */
export const staticAtlasIndex = () => read<AtlasIndex>("atlas-index");
/** 有地圖畫面圖的圖：{ 圖 id: 版本 }，版本接在網址後面讓瀏覽器換新圖 */
export const staticMapRenders = () => read<Record<string, string>>("map-renders");

/** 有攻略的職業（public/data/guides/<職業>.json），照職業代碼排 */
export function staticGuideJobs(): number[] {
  return fs
    .readdirSync(path.join(process.cwd(), "public", "data", "guides"))
    .map(file => /^(\d+)\.json$/.exec(file)?.[1])
    .filter((id): id is string => Boolean(id))
    .map(Number)
    .sort((a, b) => a - b);
}

export const staticGuide = (job: number) => read<GuideJob>(`guides/${job}`);

/** 道具名稱查表（掉落物、任務獎勵用）：道具檔很大，只留名字、只建一次 */
export function staticItemNames(): Map<number, string> {
  const key = "item-names";
  if (!cache.has(key)) {
    const names = new Map<number, string>();
    for (const item of read<Item[]>("items")) if (!item.un) names.set(item.id, item.n);
    cache.set(key, names);
  }
  return cache.get(key) as Map<number, string>;
}

/** 資料更新時間（ISO），給結構化資料的 dateModified */
export function staticModified(): string | undefined {
  const meta = staticMeta();
  return meta.dataGeneratedAt || undefined;
}
