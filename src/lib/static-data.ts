/**
 * 伺服器（建置時）讀 public/data 的資料檔，給靜態的怪物／任務／技能／職業頁用。
 * 瀏覽器那邊照舊走 data.ts 的 fetch；這裡只在 server component、generateStaticParams 裡用。
 * 職業×等級攻略文的文字在 src/data/job-articles/（v1.43），一樣建置時讀。
 */
import fs from "node:fs";
import path from "node:path";
import { mapHref, npcHref } from "./atlas-view";
import { hasItemPage, itemPagePath, type ItemPageLookup } from "./item-page";
import type { QuestStepContext } from "./quest-steps";
import type { CalcData } from "./damage-view";
import type { GearData } from "./gear";
import type { ArticleEntry } from "./article-entry";
import { guideProblems, parseGuide, type GuideDoc } from "./guide-markdown";
import { isGuideCategory, jobArticleCard, sortCards, type GuideCard } from "./guide-catalog";
import { guidePagesWithDates } from "./guide-pages";
import { jobSeries, pickRelated, RELATED_RULES, type JobSeries } from "./guide-related";
import { articlePath, buildCalcTable, fillTokens, parseArticleFile, splitArticles, type ArticleImageManifest, type ArticleKey, type JobArticle } from "./job-article";
import type { AtlasIndex, AtlasMap, AtlasNpc, FutureData, GuideCommon, GuideJob, Item, MapRecord, Meta, Monster, PortalEdge, Quest, Skill, TrainingRow } from "./types";

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
/** 未來視的材料清單（/future，建置時讀） */
export const staticFuture = () => read<FutureData>("future");
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
/** 攻略研究的共用資料（必解、經驗表；v2.26 地區懶人包標必解用） */
export const staticGuideCommon = () => read<GuideCommon>("guides/common");

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

export function staticHasItemPage(id: number): boolean {
  const key = "item-page-ids";
  if (!cache.has(key)) cache.set(key, new Set(staticItemPages().map(item => item.id)));
  return (cache.get(key) as Set<number>).has(id);
}

/** 連到道具：有單獨頁連單獨頁，沒有照舊連查資料卡片 */
export function staticItemHref(id: number): string {
  return staticHasItemPage(id) ? itemPagePath(id) : `/db/items?id=${id}`;
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

/** 任務單獨頁「一步一步怎麼解」查表用的資料（lib/quest-steps.ts），整個建置只組一次 */
export function staticQuestStepContext(): QuestStepContext {
  const key = "quest-step-context";
  if (!cache.has(key)) {
    const monsters = new Map(staticMonsters().map(monster => [monster.id, monster]));
    const items = new Map(read<Item[]>("items").filter(item => !item.un).map(item => [item.id, item]));
    const quests = new Map(staticQuests().map(quest => [quest.id, quest.n]));
    const index = staticAtlasIndex();
    cache.set(key, {
      graph: staticGraph(),
      maps: staticMaps(),
      nearestTown: staticNearestTown(),
      monster: id => monsters.get(id),
      item: id => items.get(id),
      questName: id => quests.get(id),
      mapHref: id => mapHref(id, index),
      npcHref: id => npcHref(id, index),
      monsterHref: id => (monsters.has(id) ? `/db/monsters/${id}` : undefined),
      itemHref: id => (staticHasItemPage(id) ? itemPagePath(id) : undefined),
    } satisfies QuestStepContext);
  }
  return cache.get(key) as QuestStepContext;
}

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

/** 全部文章＋網址，照職業、起始等級排（首頁、1–30 懶人包的入口用，v1.85） */
export const staticArticleEntries = (): ArticleEntry[] =>
  staticJobArticleKeys()
    .map(key => ({ ...key, href: articlePath(key.job, key.from, key.to) }))
    .sort((a, b) => a.job - b.job || a.from - b.from);

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

const GUIDE_DIR = path.join(process.cwd(), "src", "content", "guides");

/** 一般攻略文（v1.88，src/content/guides/<slug>.md）：照發布日新到舊；有錯（沒寫楓之谷經典版、圖不存在）建置直接失敗 */
export function staticGuideDocs(): GuideDoc[] {
  const key = "guide-docs";
  if (!cache.has(key)) {
    const files = fs.existsSync(GUIDE_DIR) ? fs.readdirSync(GUIDE_DIR).filter(file => file.endsWith(".md")) : [];
    const docs = files.map(file => parseGuide(file.slice(0, -3), fs.readFileSync(path.join(GUIDE_DIR, file), "utf8")));
    const exists = (publicPath: string) => fs.existsSync(path.join(/* turbopackIgnore: true */ process.cwd(), "public", publicPath));
    // 網址只准小寫英數跟 -，也不能跟職業攻略文撞名（同一個 /guides/<slug> 路由，一般文會蓋掉職業文）；列表卡片一定要有主圖
    // 只看檔名（不跑整套文章檢查，那個很慢）
    const jobFiles = fs.existsSync(ARTICLE_DIR) ? fs.readdirSync(ARTICLE_DIR).flatMap(file => parseArticleFile(file) ?? []) : [];
    const jobSlugs = new Set(jobFiles.map(key => articlePath(key.job, key.from, key.to).split("/").at(-1)));
    const errors = docs.flatMap(doc => [
      ...guideProblems(doc, exists),
      ...(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(doc.slug) ? [] : [`${doc.slug}.md：檔名只能用小寫英文、數字、-`]),
      ...(jobSlugs.has(doc.slug) ? [`${doc.slug}.md：跟職業攻略文同網址`] : []),
      ...["hero.webp", "hero.jpg"].filter(file => !exists(`/assets/guides/${doc.slug}/${file}`)).map(file => `${doc.slug}：沒有主圖 /assets/guides/${doc.slug}/${file}（scripts/guide-card-heroes.mjs 產）`),
    ]);
    if (errors.length) throw new Error(`攻略文有錯：\n  ${errors.join("\n  ")}`);
    cache.set(key, docs.sort((a, b) => b.published.localeCompare(a.published)));
  }
  return cache.get(key) as GuideDoc[];
}

/** 一篇職業攻略文的卡片：要算計算表才填得出標題，算一次記起來 */
function staticJobCard(entry: ArticleEntry): GuideCard {
  const key = `job-card:${entry.href}`;
  if (!cache.has(key)) {
    const data = staticCalcData();
    const raw = staticJobArticle(entry.job, entry.from, entry.to)!;
    const table = buildCalcTable({ ...entry, data, gear: raw.gear, statCap: raw.statCap });
    const fill = (text: string) => fillTokens(text, table, data);
    cache.set(key, jobArticleCard({ ...entry, jobName: staticGuide(entry.job).name, title: fill(raw.title), description: fill(raw.description), heroAlt: raw.heroAlt, updated: raw.updated }));
  }
  return cache.get(key) as GuideCard;
}

/** 一般攻略文的卡片 */
const staticDocCards = (): GuideCard[] =>
  staticGuideDocs().map((doc): GuideCard => {
    if (!isGuideCategory(doc.category)) throw new Error(`${doc.slug}.md 的 category「${doc.category}」不在 GUIDE_CATEGORIES`);
    return { href: `/guides/${doc.slug}`, title: doc.title, excerpt: doc.description, image: `/assets/guides/${doc.slug}/hero.webp`, imageAlt: doc.heroAlt, category: doc.category, tags: doc.tags, date: doc.updated };
  });

/** 攻略專區的全部卡片（職業攻略文＋一般攻略文＋站上攻略頁），新到舊 */
export function staticGuideCards(): GuideCard[] {
  return sortCards([...staticDocCards(), ...staticArticleEntries().map(staticJobCard), ...guidePagesWithDates()]);
}

/**
 * 一篇攻略文的互導（v2.19）：職業文有等級條（series）跟下一段大卡（next）；所有攻略文都有文末相關卡（related）。
 * href 是 /guides/<slug>；不是攻略文丟錯。活動過期看建置時間（每次部署重算）。
 */
export function staticGuideRelated(href: string, now = Date.now()): { series?: JobSeries; next?: GuideCard; related: GuideCard[] } {
  // 自動挑只會挑到 RELATED_RULES 的頁（一般文、攻略頁）；職業文只在下一段跟手動 related 用到，用到才算（每篇都算 37 張太慢）
  const entries = staticArticleEntries();
  const jobCards = (links: readonly string[]) => entries.filter(item => links.includes(item.href)).map(staticJobCard);
  const base = [...staticDocCards(), ...guidePagesWithDates()];
  const entry = entries.find(item => item.href === href);
  if (entry) {
    const series = jobSeries(entries.map(item => ({ ...item, jobName: staticGuide(item.job).name })), entry.job, entry.from);
    const override = staticJobArticle(entry.job, entry.from, entry.to)?.related ?? [];
    const cards = [...base, ...jobCards([...override, ...(series.next ? [series.next.href] : [])])];
    const next = series.next ? cards.find(card => card.href === series.next!.href) : undefined;
    return { series, next, related: pickRelated({ href, from: entry.from, to: entry.to, cards, now, override, exclude: next ? [next.href] : [] }) };
  }
  const doc = staticGuideDocs().find(item => `/guides/${item.slug}` === href);
  const rule = RELATED_RULES[href];
  if (!doc || !rule) throw new Error(`${href} 不是攻略文，或沒在 guide-related.ts 的 RELATED_RULES 登記`);
  return { related: pickRelated({ href, from: rule.from, to: rule.to, cards: [...base, ...jobCards(doc.related)], now, override: doc.related }) };
}
