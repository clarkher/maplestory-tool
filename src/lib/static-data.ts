/**
 * 伺服器（建置時）讀 public/data 的資料檔，給靜態的怪物／任務／技能／職業頁用。
 * 瀏覽器那邊照舊走 data.ts 的 fetch；這裡只在 server component、generateStaticParams 裡用。
 * 職業×等級攻略文的文字在 src/data/job-articles/（v1.43），一樣建置時讀。
 */
import fs from "node:fs";
import path from "node:path";
import { hasItemPage, itemPagePath, type ItemPageLookup } from "./item-page";
import type { CalcData } from "./damage-view";
import type { GearData } from "./gear";
import { parseArticleFile, splitArticles, type ArticleImageManifest, type ArticleKey, type JobArticle } from "./job-article";
import type { AtlasIndex, AtlasMap, AtlasNpc, GuideCommon, GuideJob, Item, MapRecord, Meta, Monster, PortalEdge, Quest, Skill, TrainingRow } from "./types";

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

/** 道具單獨頁要查的怪物、任務名字（只算有自己頁面的） */
export function staticItemPageLookup(): ItemPageLookup {
  const key = "item-page-lookup";
  if (!cache.has(key)) {
    const monsters = new Map(staticMonsters().map(monster => [monster.id, monster.n]));
    const quests = new Map(staticQuests().map(quest => [quest.id, quest.n]));
    cache.set(key, { monster: (id: number) => monsters.get(id), quest: (id: string) => quests.get(id) } satisfies ItemPageLookup);
  }
  return cache.get(key) as ItemPageLookup;
}

/** 有單獨頁的道具（規則在 lib/item-page.ts） */
export function staticItemPages(): Item[] {
  const key = "item-pages";
  if (!cache.has(key)) {
    const lookup = staticItemPageLookup();
    cache.set(key, read<Item[]>("items").filter(item => hasItemPage(item, lookup)));
  }
  return cache.get(key) as Item[];
}

/** 連到道具：有單獨頁連單獨頁，沒有照舊連查資料卡片 */
export function staticItemHref(id: number): string {
  const key = "item-page-ids";
  if (!cache.has(key)) cache.set(key, new Set(staticItemPages().map(item => item.id)));
  return (cache.get(key) as Set<number>).has(id) ? itemPagePath(id) : `/db/items?id=${id}`;
}

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

/** 傳送門路線（地圖頁寫「怎麼去」用，跟 /go 同一份） */
export const staticGraph = () => read<Record<string, PortalEdge[]>>("graph");
export const staticNearestTown = () => read<Record<string, [number, number]>>("nearest-town");

/** 已開放的圖：圖鑑只收已開放的（攻略文防呆用） */
export const staticOpenMaps = () => new Set(staticAtlasIndex().maps);

/** 傷害計算機要的整包資料（攻略文的計算表用）；怪物不過濾，跟瀏覽器算的同一份 */
export function staticCalcData(): CalcData {
  const key = "calc-data";
  if (!cache.has(key)) {
    const guides: CalcData["guides"] = {};
    for (const job of staticGuideJobs()) guides[job] = staticGuide(job);
    const data: CalcData = {
      gear: read<GearData>("gear"),
      skills: new Map(staticSkills().map(skill => [skill.id, skill])),
      guides,
      monsters: read<Monster[]>("monsters"),
      maps: staticMaps(),
      training: read<TrainingRow[]>("training"),
      expToNext: read<GuideCommon>("guides/common").expTable.toNext,
    };
    cache.set(key, data);
  }
  return cache.get(key) as CalcData;
}

const ARTICLE_DIR = path.join(process.cwd(), "src", "data", "job-articles");

/**
 * src/data/job-articles/ 全部檔案跟這份資料比對一次：過的才出頁面，被資料更新打壞的只拿掉那一篇（建置印警告、data-refresh 開 issue），
 * 不擋其他篇跟整站的資料更新。平常開發時 job-article.test.ts 會紅。
 */
export function staticJobArticleCheck(): ReturnType<typeof splitArticles> {
  const key = "job-article-check";
  if (!cache.has(key)) {
    const keys: ArticleKey[] = fs.existsSync(ARTICLE_DIR)
      ? fs
          .readdirSync(ARTICLE_DIR)
          .flatMap(file => parseArticleFile(file) ?? [])
          .sort((a, b) => a.job - b.job || a.from - b.from)
      : [];
    const result = splitArticles(keys.map(entry => ({ ...entry, article: staticJobArticle(entry.job, entry.from, entry.to) })), staticCalcData(), staticOpenMaps());
    for (const { job, from, to, errors } of result.broken) console.warn(`攻略文 ${job}-${from}-${to} 跟資料對不上，這篇不出頁面：\n  ${errors.join("\n  ")}`);
    cache.set(key, result);
  }
  return cache.get(key) as ReturnType<typeof splitArticles>;
}

/** 有攻略文而且過檢查的職業×範圍，照職業、等級排；沒有資料夾就是沒有文章 */
export const staticJobArticleKeys = (): ArticleKey[] => staticJobArticleCheck().ok;

/** 這個職業有文章的範圍（職業頁「分等級攻略」用） */
export const staticJobArticleRanges = (job: number) => staticJobArticleKeys().filter(key => key.job === job);

/** 讀一篇文章；沒有這個檔回 undefined。還沒換代號（換代號見 job-article.ts 的 resolveArticle） */
export function staticJobArticle(job: number, from: number, to: number): JobArticle | undefined {
  const file = path.join(ARTICLE_DIR, `${job}-${from}-${to}.json`);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, "utf8")) as JobArticle;
}

/** 攻略文的圖片清單 src/data/job-articles/images.gen.json（圖片腳本產生）；頁面只畫清單裡有的圖 */
export function staticArticleImages(): ArticleImageManifest {
  const file = path.join(ARTICLE_DIR, "images.gen.json");
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as ArticleImageManifest) : {};
}

/** 資料更新時間（ISO），給結構化資料的 dateModified */
export function staticModified(): string | undefined {
  const meta = staticMeta();
  return meta.dataGeneratedAt || undefined;
}
