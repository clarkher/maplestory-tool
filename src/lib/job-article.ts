/**
 * 職業×等級範圍攻略文（/guides/<英文職業>-<起>-<迄>，v1.43 起，v1.49 換網址）：哪些範圍能出、表怎麼算、文字代號、防呆、放圖清單。
 * 規格 docs/superpowers/specs/2026-11-04-job-articles-design.md（使用者拍板 1A 2A 3A 4A）；測試 __tests__/job-article.test.ts。
 * 數字一律由程式算（傷害計算機的預設角色＋computeGroup），文字裡用代號引用，資料更新就跟著變；文字本身存 src/data/job-articles/。
 * 這支建置時在伺服器跑：不能 import "use client" 的模組（拿到假值，等級上限會變 NaN），測試有掃。
 */
import { killStats, type Range } from "./damage";
import { BASIC_ATTACK, HEAL, HEAL_TARGETS_MAX, masterySkillFor } from "./damage-skills";
import { expPerSecond } from "./damage-speed";
import { computeGroup, damageLinkHref, defaultAmmo, defaultSkill, defaultState, HEAL_ASSUMPTION, MASTERY_EDIT_HINT, weaponChoices, type CalcData, type CalcState, type GroupConfig, type GroupResult, type SharedConfig } from "./damage-view";
import { isMagicJob, obtainableBy, rulesFor, type StatKey } from "./gear";
import { canJobUse } from "./item-view";
import { monsterSuitsJob, undeadOnlyStage } from "./job-rules";
import { jobOption, jobTier, previousJob } from "./jobs";
import { BOSS_SPAWN_MAX } from "./now-plan";
import { jobLineage } from "./planner";
import type { GuideJob, GuideTrain, Monster } from "./types";

/* ------------------------------------------------------------------ 文章檔的格式 */

/** 步驟的來源等級：台服回報、社群整理、舊版路線（跟攻略的 v 同一套），加上站上計算、遊戲資料（主推可能是站上算的，v1.49） */
export type StepTag = "tw" | "community" | "legacy" | "calc" | "game";
/** 一般主張多一種：官方公告 */
export type ClaimTag = StepTag | "official";

export const TAG_LABEL: Record<ClaimTag, string> = { tw: "台服回報", community: "社群整理", legacy: "舊版路線", calc: "站上計算", game: "遊戲資料", official: "官方公告" };

export type ArticleLine = { text: string; tag: ClaimTag };
/**
 * 結論的一條。from、to：這條講哪幾級（防呆看結論有沒有涵蓋整段，文字裡也要寫出來，玩家看不到欄位）；
 * go：地圖 id，畫面多一個「帶我去 XX」，要是同一段的主推步驟（alt 的條可以是備案步驟）。
 * alt：備案，不算主推，畫面寫「備案」（僧侶 31～70 要提非不死系只能這樣）。
 */
export type ArticleAnswer = ArticleLine & { from?: number; to?: number; go?: number; alt?: true };
export type ArticleStep = {
  from: number;
  to: number;
  kind: "solo" | "party";
  map: number;
  mobs: number[];
  title: string;
  text: string;
  tag: StepTag;
  /** 備案，不算主推（僧侶 31～70 的黑肥肥這種）；畫面寫「備案」 */
  alt?: true;
  /** 組隊任務裡面的圖走不到，「帶我去」改帶入口（只能填 PQ_ENTRANCES） */
  go?: number;
};
/**
 * topic：玩家最常來查的兩種段落，手機收合時照樣露在外面（v1.79，使用者選）——
 * quests 這段該解的任務（必解、關鍵獎勵、經驗大包），skills 技能點怎麼點。其他段落收成標題。
 */
export const SECTION_TOPICS = ["quests", "skills"] as const;
export type ArticleSection = { heading: string; paragraphs?: ArticleLine[]; items?: ArticleLine[]; topic?: (typeof SECTION_TOPICS)[number] };
export type ArticleSource = { label: string; url: string };

/**
 * 露在外面的段落：照 SECTION_TOPICS 排（必解任務先、技能點法後，v1.80 使用者選），同一類照原文順序。
 * anchor：那類的第一段，結論框的連結跳到這裡。
 */
export function pinnedSections(sections: ArticleSection[]): Array<{ section: ArticleSection; anchor: boolean }> {
  return SECTION_TOPICS.flatMap(topic =>
    sections.filter(section => section.topic === topic).map((section, index) => ({ section, anchor: index === 0 })),
  );
}

/**
 * 文字依賴的前提：寫的當下表長什麼樣子（npm run article:table 印的 assumes，整包貼進文章檔）。
 * 文字裡寫死的東西（拿哪把武器、幾級技能、哪幾隻打不中、誰比誰快）靠這個比對：資料一變、對不上，這篇就不出，等人重看。
 * 數字本身可以小動（代號會跟著變），只有前提跟先後變了才算。
 */
export type ArticleAssumes = {
  weapon: number | null;
  weaponPower: number | null;
  ammo: number | null;
  skill: number;
  skillLevel: number;
  accuracy: number;
  /** 怪物 id → 幾下打死 */
  hits: Record<string, number | null>;
  /** 怪物 id → 幾等不 MISS；null 是範圍內打不中 */
  hitLv: Record<string, number | null>;
  /** 文字用到的資料代號（hits:怪@等級#武器、acc:等級#武器、exp:怪、spawn:怪@地圖、weapon:武器、req:武器:能力、price:武器）→ 當時的值。一變就算壞，不看先後；article:show 印的整包貼上 */
  pinned?: Record<string, number | null>;
  /** 文字沒印出數字、但理由靠它的（「經驗打平」靠兩隻怪的 exp；spd:武器 是攻速）：同一種鍵，自己列，一變就算壞 */
  relies?: Record<string, number | null>;
};

/** skill：這段文字叫讀者按的招，跟預設不同才寫（僧侶 31～39 按魔力爪，預設是群體治癒）；點數沒點到防呆擋。skillLevel：文章的點法跟站上預設不同才寫（龍騎士預設舊版點法 90 等還沒點龍咆哮），那段文字要自己交代點數怎麼來 */
export type ArticleGear = { from: number; to: number; weapon: number; skill?: number; skillLevel?: number };

export type JobArticle = {
  /** 不寫「經典版」：全站模板會補 */
  title: string;
  /** 150 字內 */
  description: string;
  /** 首次發布日（YYYY-MM-DD）：畫面、og、JSON-LD 都讀這個，不拿遊戲資料日期冒充 */
  published: string;
  /** 文章內容最後改的日（YYYY-MM-DD）：畫面、og、JSON-LD、網站地圖 lastmod 都讀這個；真的改了文字才動 */
  updated: string;
  /** 本篇寫手：name 是個性當名字（毒舌奶媽），line 是一句自介。虛構角色，畫面照寫虛構聲明，不進 JSON-LD 的 author */
  persona: { name: string; line: string };
  /** 主圖替代文字：要寫主推步驟的圖跟怪（{{map:地圖id}}、{{mob:怪名}}） */
  heroAlt: string;
  /** 先講結論，2～4 條，每條都標來源等級；第一條起要涵蓋整段等級（ANSWER_MAX 字內） */
  answer: ArticleAnswer[];
  /** 每一級拿哪把（文字主推的那把）：計算表、表下的計算機連結都照這個算，要連續蓋滿整段；結論要講到（job-article-gear.test.ts 擋） */
  gear: ArticleGear[];
  /** 文字的配點把某項能力停在哪（{"DEX": 60}）：表、代號、計算機連結都照這個算，多的點數算回主屬性 */
  statCap?: Partial<Record<StatKey, number>>;
  intro: string;
  steps: ArticleStep[];
  sections: ArticleSection[];
  sources: ArticleSource[];
  assumes: ArticleAssumes;
};

/* ------------------------------------------------------------------ 範圍、門檻 */

export type ArticleRange = { from: number; to: number };

const RANGES: Record<number, ArticleRange[]> = {
  1: [{ from: 10, to: 30 }],
  2: [{ from: 31, to: 50 }, { from: 51, to: 70 }],
  3: [{ from: 71, to: 90 }, { from: 91, to: 120 }],
};

/** 這個職業能出哪些範圍：照轉職切（拍板 1A） */
export function articleRanges(job: number): ArticleRange[] {
  return RANGES[jobTier(job)] ?? [];
}

/** 文章網址用的英文職業名（Google 看得懂、別人也看得懂）。站上 29 職加 232 祭司四轉（先訂好，還沒開）；不准重複，測試有驗 */
export const JOB_SLUGS: Record<number, string> = {
  100: "swordman",
  110: "berserker",
  111: "crusader",
  120: "page",
  121: "knight",
  130: "spearman",
  131: "dragon-knight",
  200: "magician",
  210: "fire-poison-wizard",
  211: "fire-poison-mage",
  220: "ice-lightning-wizard",
  221: "ice-lightning-mage",
  230: "priest",
  231: "high-priest",
  232: "bishop",
  300: "archer",
  310: "hunter",
  311: "ranger",
  320: "crossbowman",
  321: "sniper",
  400: "rogue",
  410: "assassin",
  411: "hermit",
  420: "bandit",
  421: "chief-bandit",
  500: "pirate",
  510: "brawler",
  511: "marauder",
  520: "gunslinger",
  521: "outlaw",
};

/** priest-31-50：網址最後一段，也是圖片資料夾、清單的鍵 */
export function articleSlug(job: number, from: number, to: number): string {
  const name = JOB_SLUGS[job];
  if (!name) throw new Error(`職業 ${job} 沒有英文 slug，加進 JOB_SLUGS`);
  return `${name}-${from}-${to}`;
}

export const articlePath = (job: number, from: number, to: number) => `/guides/${articleSlug(job, from, to)}`;
export const articleRangeLabel = (from: number, to: number) => `${from}～${to} 等`;

/* ------------------------------------------------------------------ 放圖 */

export type ImageSize = { w: number; h: number };
/** 一篇的圖：主圖（hero.webp＋給 og 用的 hero.jpg）、寫手小頭像、路線卡圖（鍵是地圖 id） */
export type ArticleImageEntry = { hero?: ImageSize; author?: ImageSize; steps?: Record<string, ImageSize> };
/** src/data/job-articles/images.gen.json：鍵是 slug，圖片腳本產生；頁面只畫清單裡有的圖 */
export type ArticleImageManifest = Record<string, ArticleImageEntry>;
/** 畫面拿的：這篇的圖片資料夾（public 底下的網址）跟有哪些圖 */
export type ArticleImages = ArticleImageEntry & { dir: string };

const articleImageDir = (slug: string) => `/assets/guides/${slug}`;
/** og、JSON-LD、網站地圖用的主圖路徑（jpg：分享平台都吃得下） */
export const articleHeroPath = (slug: string) => `${articleImageDir(slug)}/hero.jpg`;
export const articleImages = (manifest: ArticleImageManifest, slug: string): ArticleImages => ({ ...manifest[slug], dir: articleImageDir(slug) });
/** 路線卡圖的替代文字：僧侶在螞蟻洞Ⅲ打殭屍菇菇 */
export const stepImageAlt = (jobName: string, mapName: string, mobName: string) => `${jobName}在${mapName}打${mobName}`;

/** 計算表收合時露在外面的怪最多幾隻（v1.78 手機版面拍板 A） */
export const FEATURED_LIMIT = 3;
/**
 * 計算表收合時露哪幾隻：主推步驟（不是備案）輪流挑——先每步的第一隻、再每步的第二隻，表裡有的才算，取 3 隻；
 * 不輪流的話第一段怪多就把後面主推的怪擠掉。一隻都對不到就取表的前 3 隻。
 * 回傳的只是名單，表照原本的順序排，其他列藏起來。
 */
export function featuredMonsters(steps: Array<{ mobs: number[]; alt?: boolean }>, rows: Array<{ id: number }>): number[] {
  const inTable = new Set(rows.map(row => row.id));
  const lists = steps.filter(step => !step.alt).map(step => step.mobs.filter(id => inTable.has(id)));
  const picked: number[] = [];
  for (let round = 0; picked.length < FEATURED_LIMIT && lists.some(list => round < list.length); round++) {
    for (const list of lists) if (round < list.length && !picked.includes(list[round]) && picked.length < FEATURED_LIMIT) picked.push(list[round]);
  }
  return picked.length ? picked : rows.slice(0, FEATURED_LIMIT).map(row => row.id);
}

const HERO_MIN_WIDTH = 1200;
const HERO_RATIO = 16 / 9;
const HERO_RATIO_TOLERANCE = 0.01;

/**
 * 圖片防呆（Discover 要大圖）：每篇的主圖、小頭像、每個非備案步驟的圖都要在清單裡；清單列的檔案要真的在；主圖寬至少 1200、比例 16:9。
 * 不放進 validateArticle：缺圖不該讓文章下架，由 job-article-images.test.ts 擋在合併前。fileExists 收 public 底下的網址路徑。
 */
export function articleImageProblems(entries: Array<ArticleKey & { article: Pick<JobArticle, "steps"> }>, manifest: ArticleImageManifest, fileExists: (publicPath: string) => boolean): string[] {
  const problems: string[] = [];
  const slugs = new Set<string>();
  for (const { job, from, to, article } of entries) {
    const slug = articleSlug(job, from, to);
    slugs.add(slug);
    const entry = manifest[slug];
    if (!entry) {
      problems.push(`${slug}：清單裡沒有這篇`);
      continue;
    }
    if (!entry.hero) problems.push(`${slug}：清單沒有主圖 hero`);
    if (!entry.author) problems.push(`${slug}：清單沒有寫手小頭像 author`);
    for (const step of article.steps) {
      if (step.alt !== true && !entry.steps?.[String(step.map)]) problems.push(`${slug}：清單沒有路線卡圖 ${step.map}`);
    }
  }
  for (const [slug, entry] of Object.entries(manifest)) {
    if (!slugs.has(slug)) problems.push(`${slug}：清單有，但沒有這篇文章`);
    const dir = articleImageDir(slug);
    const files = [...(entry.hero ? ["hero.webp", "hero.jpg"] : []), ...(entry.author ? ["author.webp"] : []), ...Object.keys(entry.steps ?? {}).map(map => `${map}.webp`)];
    for (const file of files) if (!fileExists(`${dir}/${file}`)) problems.push(`${slug}：清單有 ${file}，檔案不在`);
    if (entry.hero) {
      const { w, h } = entry.hero;
      if (w < HERO_MIN_WIDTH) problems.push(`${slug}：主圖寬 ${w}，至少要 ${HERO_MIN_WIDTH}`);
      if (Math.abs(w / h - HERO_RATIO) > HERO_RATIO_TOLERANCE) problems.push(`${slug}：主圖 ${w}×${h} 不是 16:9`);
    }
  }
  return problems;
}

/** 檔名 230-31-50.json → 職業、範圍；不是這個格式回 null */
export function parseArticleFile(file: string): { job: number; from: number; to: number } | null {
  const match = /^(\d+)-(\d+)-(\d+)\.json$/.exec(file);
  return match ? { job: Number(match[1]), from: Number(match[2]), to: Number(match[3]) } : null;
}

/** 算這一篇要看的攻略：自己，三轉再加接它的二轉 */
export function articleGuides(job: number, guides: CalcData["guides"]): GuideJob[] {
  const codes = jobTier(job) === 3 ? [job, previousJob(job)] : [job];
  return codes.flatMap(code => guides[code] ?? []);
}

const overlaps = (row: { from: number; to: number }, from: number, to: number) => row.from <= to && row.to >= from;

function rowsInRange(job: number, from: number, to: number, guides: CalcData["guides"]): GuideTrain[] {
  return articleGuides(job, guides).flatMap(guide => guide.train).filter(row => overlaps(row, from, to));
}

/** 出不出這一篇（拍板 2A）：是拍板的範圍，而且至少 2 張不同的圖有非舊版來源的練功段 */
export function articleEligible(job: number, from: number, to: number, guides: CalcData["guides"]): boolean {
  if (!articleRanges(job).some(range => range.from === from && range.to === to)) return false;
  const maps = new Set(rowsInRange(job, from, to, guides).filter(row => row.map !== null && row.v !== "legacy").map(row => row.map));
  return maps.size >= 2;
}

/* ------------------------------------------------------------------ 預設角色的命中 */

/** 不看武器的命中被動：精準強化、幻化術、極限迴避（x 是命中） */
const ACCURACY_PASSIVES = [3000000, 4000000, 5000000];

/**
 * 這組設定的角色命中。法師：智力÷10＋幸運÷10（各自捨去）；物理：敏捷×0.8＋幸運×0.5＋命中被動（舊版玩家整理，攻略 warrior-pirate 那一條）。
 * 裝備上的命中不知道，不算：物理職業實際會比這個數字早打得中，畫面照實寫。
 */
export function characterAccuracy(data: CalcData, job: number, group: GroupConfig): { kind: "physical" | "magic"; value: number } {
  const { stats } = group;
  if (isMagicJob(job)) return { kind: "magic", value: Math.floor(stats.INT / 10) + Math.floor(stats.LUK / 10) };
  const weapon = data.gear.weapons.find(entry => entry.id === group.weaponId);
  const mastery = weapon ? masterySkillFor(weapon.s, job) : null;
  const lineage = new Set(jobLineage(job));
  const passive = [...(mastery === null ? [] : [mastery]), ...ACCURACY_PASSIVES.filter(id => lineage.has(data.skills.get(id)?.job ?? -1))].reduce((sum, id) => {
    const level = group.levels[id] ?? 0;
    const rows = data.skills.get(id)?.levels;
    return level > 0 && rows?.length ? sum + (rows[Math.min(level, rows.length) - 1].x ?? 0) : sum;
  }, 0);
  return { kind: "physical", value: Math.floor(stats.DEX * 0.8 + stats.LUK * 0.5 + passive) };
}

/* ------------------------------------------------------------------ 計算表 */

/** 群體治癒照範圍內幾隻算（樣稿、使用者看過的那張表） */
const HEAL_TABLE_TARGETS = 3;

export type CalcRow = {
  id: number;
  name: string;
  lv: number | null;
  hp: number;
  exp: number;
  /** 魔法職魔防、物理職物防 */
  def: number;
  /** 表上每一欄的平均幾下，跟 table.columns 對齊（群體治癒是範圍 3 隻）；算不出來 null */
  avgs: Array<number | null>;
  /** 範圍中段等級時計算機畫面寫的幾下（平均傷害無條件進位，群體治癒是範圍 3 隻）；算不出來 null。只給 assumes、{{hits}} 用，畫面印 avg */
  hits: number | null;
  /** 群體治癒打 1 隻，計算機畫面寫的幾下；別的技能 null */
  hitsOne: number | null;
  /** 真的平均幾下（killStats，不進位）：表上印這個；算不出來 null */
  avg: number | null;
  /** 群體治癒打 1 隻的平均幾下；別的技能 null */
  avgOne: number | null;
  /** 從這一級到範圍結束都不 MISS；範圍最後一級還打不中是 null，畫面寫「超過 N 等」。有 gear 每一級照自己那把算，沒 gear 固定用中段那把 */
  hitLv: number | null;
};

/** 表上一欄的角色：幾等、什麼能力、拿哪把、放哪招 */
export type CalcColumn = {
  level: number;
  /** 點法標籤（一般點法、全幸）；這個職業只有一套 null */
  tab: string | null;
  stats: Record<StatKey, number>;
  weapon: { id: number; name: string; type: string; power: number } | null;
  ammo: { id: number; name: string; atk: number } | null;
  skill: { id: number; name: string; level: number };
  /** 這一級的角色命中 */
  accuracy: { kind: "physical" | "magic"; value: number };
  /** 群體治癒範圍內幾隻；別的技能 null */
  targets: number | null;
};

/** 中段等級那一欄，加上整張表共用的 */
export type CalcAssumptions = CalcColumn & {
  /** 傷害計算機對這一招、這把武器的提醒（炸彈箭怎麼算、沒點精準技能、武器還拿不到…），照原文列 */
  notes: string[];
};

export type CalcTable = {
  job: number;
  from: number;
  to: number;
  midLevel: number;
  /** 文章指定的能力上限；沒有是 null */
  statCap: Partial<Record<StatKey, number>> | null;
  /** 文章的 gear：代號算到同一級同一把武器時用它指定的招式；沒寫是 null */
  gear: readonly ArticleGear[] | null;
  /** 表上印哪幾個等級；row.avgs 跟這個對齊。文章有寫 gear 才有三欄，沒寫（寫手還沒選武器）只有中段照預設角色算 */
  columns: CalcColumn[];
  rows: CalcRow[];
  assumptions: CalcAssumptions;
};

const stateCache = new WeakMap<CalcData, Map<string, CalcState>>();

/** 預設角色算一次要跑一輪練功排行，一篇表要算 20～30 級：同一份資料記起來 */
function stateAt(data: CalcData, job: number, level: number): CalcState {
  let cache = stateCache.get(data);
  if (!cache) stateCache.set(data, (cache = new Map()));
  const key = `${job}-${level}`;
  let state = cache.get(key);
  if (!state) cache.set(key, (state = defaultState(data, job, level, null)));
  return state;
}

const skillNameOf = (data: CalcData, id: number) => (id === BASIC_ATTACK ? "普通攻擊" : data.skills.get(id)?.n ?? "技能");

type SkillPick = { skillId: number; skillLevel: number };

/** 表用哪一招：跟傷害計算機的預設同一招（讀者按表下面的連結看到同一個數字）；僧侶 31～70 例外固定群體治癒 */
function tableSkill(job: number, level: number, group: GroupConfig, fallback: SkillPick): SkillPick {
  if (undeadOnlyStage(job, level) && (group.levels[HEAL] ?? 0) > 0) return { skillId: HEAL, skillLevel: group.levels[HEAL] };
  return { skillId: fallback.skillId, skillLevel: fallback.skillLevel };
}

/**
 * 這一級拿指定武器的角色：預設角色換武器、招式照新武器重挑，能力值照文章的上限（多的算回主屬性）。
 * 武器不存在、等級不到、能力值穿不上都丟錯，文字才不會叫玩家拿一把拿不到的武器。
 */
function characterWith(raw: string, weaponId: number, level: number, { job, statCap }: Pick<CalcTable, "job" | "statCap">, data: CalcData): { group: GroupConfig; skill: SkillPick } {
  const weapon = data.gear.weapons.find(entry => entry.id === weaponId);
  if (!weapon) throw new Error(`代號 ${raw}：武器 ${weaponId} 不在資料裡`);
  if (weapon.lv > level) throw new Error(`代號 ${raw}：${level} 等還拿不到${weapon.n}（要 ${weapon.lv} 等）`);
  const base = stateAt(data, job, level).groups[0];
  const stats = { ...base.stats };
  const main = rulesFor(data.gear.rules, job).main?.main;
  for (const [key, cap] of Object.entries(statCap ?? {}) as Array<[StatKey, number]>) {
    if (stats[key] <= cap) continue;
    if (main) stats[main] += stats[key] - cap;
    stats[key] = cap;
  }
  const short = (Object.entries(weapon.req ?? {}) as Array<[StatKey, number]>).filter(([key, need]) => stats[key] < need);
  if (short.length) throw new Error(`代號 ${raw}：${level} 等穿不上${weapon.n}（${short.map(([key, need]) => `${key} 要 ${need}，只有 ${stats[key]}`).join("、")}）`);
  const group: GroupConfig = { ...base, stats, weaponId, weaponAtk: null, ammoId: defaultAmmo(data.gear.ammo ?? [], weapon.s, level)?.id ?? null };
  return { group, skill: tableSkill(job, level, group, defaultSkill(data, job, group)) };
}

/** 練功目標：地圖上有刷怪資料、而且不是整張圖最多幾隻的王（跟傷害計算機、練功排行同一條 BOSS_SPAWN_MAX） */
function isFarmTarget(monster: Monster): boolean {
  const counts = (monster.sp ?? []).map(([, count]) => count);
  return counts.length > 0 && Math.max(...counts) > BOSS_SPAWN_MAX;
}

const finiteOrNull = (value: number | undefined) => (value !== undefined && Number.isFinite(value) ? value : null);

/** computeGroup 算好的範圍、爆擊、一次幾下，算成真的平均下數；算不出來 null */
function statsOfResult(result: GroupResult, hp: number): { avg: number; oneShot: number } | null {
  return result.ok && result.vs ? killStats(hp, result.vs.hit, result.vs.crit?.hit ?? null, result.critRate ?? 0, result.hits) : null;
}

/** 表印哪幾級：範圍裡頭第一個、最後一個 5 的倍數，加中段（31～50 是 35、40、45） */
export function tableLevels(from: number, to: number): number[] {
  const mid = Math.floor((from + to) / 2);
  return [...new Set([Math.ceil((from + 1) / 5) * 5, mid, Math.floor((to - 1) / 5) * 5])].sort((a, b) => a - b);
}

const gearAt = (gear: readonly ArticleGear[], level: number) => gear.find(piece => level >= piece.from && level <= piece.to);

/** 範圍內 guide.train 列的怪（去重、地圖是 null 的列不算），每隻算幾下打死、幾等不 MISS，順便回傳算表用的假設 */
export function buildCalcTable({ job, from, to, data, gear, statCap }: { job: number; from: number; to: number; data: CalcData; gear?: readonly ArticleGear[]; statCap?: JobArticle["statCap"] }): CalcTable {
  const midLevel = Math.floor((from + to) / 2);
  const limits = { job, statCap: statCap ?? null };
  const cache = new Map<number, { group: GroupConfig; skill: SkillPick }>();
  const articleCharacter = (pieces: readonly ArticleGear[], level: number) => {
    let found = cache.get(level);
    if (!found) {
      const piece = gearAt(pieces, level);
      if (!piece) throw new Error(`gear 沒寫 ${level} 等拿哪把`);
      const character = characterWith(`gear ${level} 等`, piece.weapon, level, limits, data);
      found = piece.skill === undefined ? character : { ...character, skill: { skillId: piece.skill, skillLevel: piece.skillLevel ?? character.group.levels[piece.skill] ?? 0 } };
      cache.set(level, found);
    }
    return found;
  };
  const midState = stateAt(data, job, midLevel);
  const mid = gear?.length ? articleCharacter(gear, midLevel) : { group: midState.groups[0], skill: tableSkill(job, midLevel, midState.groups[0], midState.shared) };
  const heal = mid.skill.skillId === HEAL;
  const targetsOf = (skill: SkillPick) => (skill.skillId === HEAL ? HEAL_TABLE_TARGETS : undefined);
  const magic = isMagicJob(job);
  const shared = (skill: SkillPick, monster: Monster | null, targets?: number): SharedConfig => ({ job, ...skill, monsterId: monster?.id ?? null, ...(targets === undefined ? {} : { targets }) });
  const killsOf = (result: GroupResult) => (result.ok ? finiteOrNull(result.vs?.kills.avg) : null);
  const averageOf = (result: GroupResult, hp: number) => statsOfResult(result, hp)?.avg ?? null;
  // 沒寫 gear 時預設角色每級會換武器，命中被動跟著跳（狂戰士斧頭 50、劍 69）：固定用中段那把算，才對得上假設行
  const characterForHit = (level: number) => (gear?.length ? articleCharacter(gear, level) : { group: { ...stateAt(data, job, level).groups[0], weaponId: mid.group.weaponId, weaponAtk: mid.group.weaponAtk, ammoId: mid.group.ammoId }, skill: mid.skill });
  const hitsAt = (monster: Monster, level: number): boolean => {
    const { group, skill } = characterForHit(level);
    const result = computeGroup(data, shared(skill, monster, targetsOf(skill)), group, monster);
    return Boolean(result.ok && result.vs && characterAccuracy(data, job, group).value >= result.vs.accuracy);
  };
  // 從範圍最後一級往回找：要一路達標到範圍結束才算，中間達標、後面又掉回去不算
  const firstHitLevel = (monster: Monster): number | null => {
    if (!hitsAt(monster, to)) return null;
    let level = to;
    while (level > from && hitsAt(monster, level - 1)) level--;
    return level;
  };

  const columnOf = (level: number, { group, skill }: { group: GroupConfig; skill: SkillPick }): CalcColumn => {
    const weapon = data.gear.weapons.find(entry => entry.id === group.weaponId);
    const ammo = (data.gear.ammo ?? []).find(entry => entry.id === group.ammoId);
    return {
      level,
      tab: group.tab,
      stats: { ...group.stats },
      weapon: weapon ? { id: weapon.id, name: weapon.n, type: weapon.s, power: (magic ? weapon.mag : weapon.atk) ?? 0 } : null,
      ammo: ammo ? { id: ammo.id, name: ammo.n, atk: ammo.atk } : null,
      skill: { id: skill.skillId, name: skillNameOf(data, skill.skillId), level: skill.skillLevel },
      accuracy: characterAccuracy(data, job, group),
      targets: targetsOf(skill) ?? null,
    };
  };
  const characters = (gear?.length ? tableLevels(from, to) : [midLevel]).map(level => ({ level, character: level === midLevel ? mid : articleCharacter(gear!, level) }));
  const resultAt = (character: typeof mid, monster: Monster, targets?: number) => computeGroup(data, shared(character.skill, monster, targets), character.group, monster);

  const byId = new Map(data.monsters.map(monster => [monster.id, monster]));
  const ids = [...new Set(rowsInRange(job, from, to, data.guides).filter(row => row.map !== null).flatMap(row => row.mobs))];
  const rows = ids
    .flatMap(id => byId.get(id) ?? [])
    .filter(monster => !monster.un && isFarmTarget(monster) && (!heal || monster.und))
    .sort((a, b) => (a.lv ?? 0) - (b.lv ?? 0) || a.id - b.id)
    .map(
      (monster): CalcRow => ({
        id: monster.id,
        name: monster.n,
        lv: monster.lv,
        hp: monster.hp,
        exp: monster.exp,
        def: magic ? monster.mdd : monster.pdd,
        hits: killsOf(resultAt(mid, monster, heal ? HEAL_TABLE_TARGETS : undefined)),
        hitsOne: heal ? killsOf(resultAt(mid, monster, 1)) : null,
        avg: averageOf(resultAt(mid, monster, heal ? HEAL_TABLE_TARGETS : undefined), monster.hp),
        avgOne: heal ? averageOf(resultAt(mid, monster, 1), monster.hp) : null,
        avgs: characters.map(({ character }) => averageOf(resultAt(character, monster, targetsOf(character.skill)), monster.hp)),
        hitLv: firstHitLevel(monster),
      }),
    );

  // 計算機的提醒照原文，但「可在下面改」只有計算機頁成立；同一句只留一次（35 等、45 等同一把會一樣）
  const notes = characters.flatMap(({ character }) => {
    const dummy = computeGroup(data, shared(character.skill, null), character.group, null);
    return dummy.ok ? [...dummy.warnings, ...dummy.notes] : [dummy.reason];
  });
  return {
    job,
    from,
    to,
    midLevel,
    statCap: statCap ?? null,
    gear: gear?.length ? gear : null,
    columns: characters.map(({ level, character }) => columnOf(level, character)),
    rows,
    assumptions: {
      ...columnOf(midLevel, mid),
      notes: [...new Set([...(heal ? [HEAL_ASSUMPTION] : []), ...notes].map(note => note.replace(MASTERY_EDIT_HINT, "")))],
    },
  };
}

/** 表上「幾等不 MISS」那格 */
export function hitLvText(row: Pick<CalcRow, "hitLv">, table: Pick<CalcTable, "to">): string {
  return row.hitLv === null ? `超過 ${table.to} 等` : String(row.hitLv);
}

const roundTo = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;
/** 平均下數的寫法：一位小數（表、{{avg}} 同一個），1.45 寫 1.5（toFixed 會被二進位小數帶成 1.4） */
export const avgText = (value: number | null) => (value === null ? "算不出來" : roundTo(value, 1).toFixed(1));

/** 一下打死的機率（整數 %）：沒到必死不准寫 100，有機會不准寫 0，比較時才不會把「幾乎」當「一定」 */
export function oneShotPercent(chance: number): number {
  if (chance >= 1) return 100;
  if (chance <= 0) return 0;
  return Math.min(99, Math.max(1, Math.round(chance * 100)));
}

/** 10 分鐘經驗進位到畫面上的精度：一萬以上到千位（0.1 萬），以下到百位 */
const xp10Rounded = (value: number) => (value >= 10000 ? Math.round(value / 1000) * 1000 : Math.round(value / 100) * 100);
/** 「約 3.1 萬」「約 8,600」 */
export function xp10Text(value: number): string {
  const rounded = xp10Rounded(value);
  return rounded >= 10000 ? `約 ${(rounded / 10000).toFixed(1)} 萬` : `約 ${rounded.toLocaleString("en-US")}`;
}

/** 表上「幾下打死」印的是平均值，連到計算機會看到進位後的整數：假設行要先講 */
const AVERAGE_NOTE = "幾下打死：平均值；計算機畫面會進位成整數";

const statsText = (column: CalcColumn) => `力量 ${column.stats.STR}、敏捷 ${column.stats.DEX}、智力 ${column.stats.INT}、幸運 ${column.stats.LUK}${column.tab ? `（${column.tab}）` : ""}`;
const weaponText = (column: CalcColumn, magic: boolean) => (column.weapon ? `${column.weapon.name}（${column.weapon.type}，${magic ? "魔攻" : "攻擊"} ${column.weapon.power}）` : "查不到");
const ammoText = (column: CalcColumn) => (column.ammo ? `；彈藥：${column.ammo.name}（攻擊 ${column.ammo.atk}）` : "");

/** 算表用的假設，一條一行；畫面跟給寫手看的都用這幾行，不另外編 */
export function assumptionLines(table: CalcTable): string[] {
  const { assumptions: a, columns } = table;
  const magic = a.accuracy.kind === "magic";
  if (columns.length > 1) {
    return [
      ...columns.map(column => `Lv.${column.level}：${statsText(column)}；${weaponText(column, magic)}${ammoText(column)}；${column.skill.name} ${column.skill.level} 級；${magic ? "魔法命中" : "命中"} ${column.accuracy.value}`),
      `武器都沒衝卷，其他裝備的攻擊、增益技能沒算${a.targets ? `；打 1 隻那欄是 Lv.${a.level} 按${a.skill.name}，寫範圍的是範圍內 ${a.targets} 隻（怪越多每隻分到越少）` : ""}`,
      AVERAGE_NOTE,
      magic ? "命中：魔法命中＝智力÷10＋幸運÷10，裝備上的智力、幸運沒算，實際會更早打得中" : "命中：敏捷×0.8＋幸運×0.5＋命中被動，裝備上的命中沒算，實際會更早打得中",
      ...a.notes,
    ];
  }
  const stats = `Lv.${a.level}：${statsText(a)}`;
  const weapon = a.weapon ? `武器：${weaponText(a, magic)}，沒衝卷${ammoText(a)}；其他裝備的攻擊、增益技能沒算` : "武器：查不到";
  const skill = `技能：${a.skill.name} ${a.skill.level} 級${a.targets ? `；另一欄是範圍內 ${a.targets} 隻（怪越多每隻分到越少）` : ""}`;
  const accuracy = magic
    ? `命中：魔法命中＝智力÷10＋幸運÷10（Lv.${a.level} 是 ${a.accuracy.value}），裝備上的智力、幸運沒算，實際會更早打得中`
    : `命中：敏捷×0.8＋幸運×0.5＋命中被動（Lv.${a.level} 是 ${a.accuracy.value}，${a.weapon?.name ?? "武器"}整段都用這把算），裝備上的命中沒算，實際會更早打得中`;
  return [stats, weapon, skill, AVERAGE_NOTE, accuracy, ...a.notes];
}

/** 群體治癒的「打 1 隻」排在同一級的範圍欄後面，表才會照等級由低到高；別的技能沒有這欄 */
export function withOneTargetCell<T>(table: CalcTable, cells: T[], one: T): T[] {
  if (table.assumptions.targets === null) return cells;
  const at = table.columns.findIndex(column => column.level === table.midLevel) + 1;
  return [...cells.slice(0, at), one, ...cells.slice(at)];
}

/** 表上面那行：每一欄拿哪把、放哪招，連續一樣的併起來（「35 等拿鋼鐵拳套放雙飛斬；40、45 等拿水晶刃放迴旋斬」） */
export function tableGearLine(table: CalcTable): string {
  const groups: Array<{ levels: number[]; text: string }> = [];
  for (const column of table.columns) {
    const text = `拿${column.weapon?.name ?? "查不到的武器"}放${column.skill.name}`;
    const last = groups[groups.length - 1];
    if (last?.text === text) last.levels.push(column.level);
    else groups.push({ levels: [column.level], text });
  }
  return groups.map(({ levels, text }) => `${groups.length > 1 ? `${levels.join("、")} 等` : ""}${text}`).join("；");
}

/** 表下面連到計算機：帶這張表的武器、招式、隻數，文章有配點上限再帶能力值，開出來就是表上中段那一組 */
export function articleDamageHref(table: CalcTable): string {
  const { assumptions: a } = table;
  const stats = table.statCap ? { str: a.stats.STR, dex: a.stats.DEX, int: a.stats.INT, luk: a.stats.LUK } : {};
  return damageLinkHref(table.job, table.midLevel, { weapon: a.weapon?.id, skill: a.skill.id, targets: a.targets, ...stats });
}

/* ------------------------------------------------------------------ 文字代號 */

const TOKEN = /\{\{(.*?)\}\}/g;

/** 楓幣寫成玩家講的樣子：250000 → 25 萬、375000 → 37.5 萬 */
const mesoText = (value: number) => (value >= 10000 ? `${value / 10000} 萬` : String(value));

/** 那一級拿那把武器打這隻怪：計算機同一套算出來的結果；怪、武器、等級不對丟錯。targets 是群體治癒範圍內幾隻（別的技能不能寫） */
function resultAtLevel(raw: string, mobId: number, level: number, weaponId: number, targets: number | undefined, table: CalcTable, data: CalcData) {
  checkTokenLevel(raw, level, table);
  const monster = data.monsters.find(entry => entry.id === mobId);
  if (!monster || monster.un) throw new Error(`代號 ${raw}：怪 ${mobId} 不在怪物資料裡`);
  const base = characterWith(raw, weaponId, level, table, data);
  // 寫了隻數（*3）是刻意算群體治癒，不照 gear
  const piece = table.gear && targets === undefined ? gearAt(table.gear, level) : undefined;
  // 跟表同一招：文章指定這一級這把放什麼，代號就算什麼
  const character = piece?.skill !== undefined && piece.weapon === weaponId ? { ...base, skill: { skillId: piece.skill, skillLevel: piece.skillLevel ?? base.group.levels[piece.skill] ?? 0 } } : base;
  const heal = character.skill.skillId === HEAL;
  if (targets !== undefined && !heal) throw new Error(`代號 ${raw}：${level} 等用的不是群體治癒，不能寫隻數`);
  if (targets !== undefined && (!Number.isInteger(targets) || targets < 1 || targets > HEAL_TARGETS_MAX)) throw new Error(`代號 ${raw}：隻數要 1～${HEAL_TARGETS_MAX}`);
  const count = heal ? targets ?? HEAL_TABLE_TARGETS : undefined;
  const result = computeGroup(data, { job: table.job, ...character.skill, monsterId: mobId, ...(count === undefined ? {} : { targets: count }) }, character.group, monster);
  return { monster, character, heal, result };
}

/** 那一級拿那把武器打這隻怪，計算機畫面寫的幾下（平均傷害無條件進位，跟表的 hits 同一套）；算不出來丟錯 */
function killsAtLevel(raw: string, kind: string, mobId: number, level: number, weaponId: number, table: CalcTable, data: CalcData): number {
  const { monster, heal, result } = resultAtLevel(raw, mobId, level, weaponId, undefined, table, data);
  if (kind === "hitsOne" && !heal) throw new Error(`代號 ${raw}：${level} 等用的不是群體治癒，沒有「打 1 隻」這一欄，用 hits`);
  const final = kind === "hitsOne" ? resultAtLevel(raw, mobId, level, weaponId, 1, table, data).result : result;
  const kills = final.ok ? finiteOrNull(final.vs?.kills.avg) : null;
  if (kills === null) throw new Error(`代號 ${raw}：${monster.n}算不出幾下${final.ok ? "" : `（${final.reason}）`}`);
  return kills;
}

export type ArticleKillStats = {
  /** 平均幾下打死（不進位） */
  avg: number;
  /** 一下打死的機率 0～1 */
  oneShot: number;
  /** 打死一隻平均幾毫秒＝平均下數×出手時間；出手時間查不到（海盜）null */
  killMs: number | null;
  /** 不停手不找怪 10 分鐘的經驗上限（用平均下數算；群體治癒範圍內每隻都算，跟計算機同一條 expPerSecond）；出手時間查不到 null */
  xp10: number | null;
  /** 算的時候用的東西（computeGroup 算的）：驗證、Monte Carlo 對照用 */
  hit: Range;
  crit: Range | null;
  critRate: number;
  hits: number;
  ms: number | null;
  /** 群體治癒範圍內幾隻；別的技能 1 */
  targets: number;
  skillId: number;
  skillLevel: number;
  /** 角色命中跟不 MISS 要的命中：下數沒算 MISS，have 小於 need 時平均下數是樂觀的。裝備上的命中不知道，have 會偏低 */
  accuracy: { have: number; need: number };
};

/**
 * {{avg}}、{{oneShot}}、{{killTime}}、{{xp10}} 算的東西。角色跟 {{hits:…@等級#武器id}} 同一套（預設角色、statCap、那把武器、招式重挑）。
 * 群體治癒沒給 targets 照表的 3 隻。算不出來丟錯。
 */
export function articleKillStats({ mobId, level, weaponId, targets, table, data, raw = `{{${mobId}@${level}#${weaponId}}}` }: { mobId: number; level: number; weaponId: number; targets?: number; table: CalcTable; data: CalcData; raw?: string }): ArticleKillStats {
  const { monster, character, result } = resultAtLevel(raw, mobId, level, weaponId, targets, table, data);
  const stats = statsOfResult(result, monster.hp);
  if (!result.ok || !result.vs || !stats) throw new Error(`代號 ${raw}：${monster.n}算不出幾下${result.ok ? "" : `（${result.reason}）`}`);
  const ms = result.speed?.ms ?? null;
  return {
    ...stats,
    killMs: ms === null ? null : stats.avg * ms,
    xp10: ms === null ? null : expPerSecond(monster.exp, stats.avg, ms, result.targets) * 600,
    hit: result.vs.hit,
    crit: result.vs.crit?.hit ?? null,
    critRate: result.critRate ?? 0,
    hits: result.hits,
    ms,
    targets: result.targets,
    skillId: character.skill.skillId,
    skillLevel: character.skill.skillLevel,
    accuracy: { have: characterAccuracy(data, table.job, character.group).value, need: result.vs.accuracy },
  };
}

function checkTokenLevel(raw: string, level: number, table: CalcTable): void {
  if (level < table.from || level > table.to) throw new Error(`代號 ${raw}：等級 ${level} 不在文章範圍 ${table.from}～${table.to} 內`);
}

const DATA_TOKEN = /^(hits|hitsOne):\d+@|^(avg|oneShot|killTime|xp10|acc|exp|spawn|weapon|req|price|spd):/;

/**
 * 會跟著資料變的代號（不用看表）：回傳畫面的字跟要比對的值，不是這一種回 null。比對的值進 assumes.pinned、assumes.relies，一變這篇就下架。
 */
function dataToken(raw: string, body: string, table: CalcTable, data: CalcData | undefined): { text: string; value: number } | null {
  if (!DATA_TOKEN.test(body)) return null;
  if (!data) throw new Error(`代號 ${raw}：要給計算資料`);
  const number = (value: number) => ({ text: String(value), value });
  const weaponOf = (id: number) => {
    const weapon = data.gear.weapons.find(entry => entry.id === id);
    if (!weapon) throw new Error(`代號 ${raw}：武器 ${id} 不在資料裡`);
    return weapon;
  };
  const mobOf = (id: number) => {
    const monster = data.monsters.find(entry => entry.id === id);
    if (!monster || monster.un) throw new Error(`代號 ${raw}：怪 ${id} 不在怪物資料裡`);
    return monster;
  };
  let match: RegExpExecArray | null;
  if ((match = /^(hits|hitsOne):(\d+)@(\d+)(?:#(\d+))?$/.exec(body))) {
    if (!match[4]) throw new Error(`代號 ${raw}：指定等級要寫哪把武器，${match[1]}:${match[2]}@${match[3]}#武器id，文字寫哪把就算哪把`);
    return number(killsAtLevel(raw, match[1], Number(match[2]), Number(match[3]), Number(match[4]), table, data));
  }
  if ((match = /^(avg|oneShot|killTime|xp10):(.*)$/.exec(body))) {
    const kind = match[1];
    const parts = /^(\d+)@(\d+)#(\d+)(?:\*(\d+))?$/.exec(match[2]);
    if (!parts) throw new Error(`代號 ${raw}：要寫 ${kind}:怪物id@等級#武器id（群體治癒可以再加 *隻數），文字寫哪把武器就算哪把`);
    const stats = articleKillStats({ raw, mobId: Number(parts[1]), level: Number(parts[2]), weaponId: Number(parts[3]), targets: parts[4] === undefined ? undefined : Number(parts[4]), table, data });
    if (kind === "avg") return { text: avgText(stats.avg), value: roundTo(stats.avg, 1) };
    if (kind === "oneShot") {
      const percent = oneShotPercent(stats.oneShot);
      return { text: `${percent}%`, value: percent };
    }
    if (stats.killMs === null || stats.xp10 === null) throw new Error(`代號 ${raw}：這一招的出手時間查不到，算不出時間`);
    if (kind === "killTime") {
      const seconds = roundTo(stats.killMs / 1000, 2);
      return { text: seconds.toFixed(2), value: seconds };
    }
    return { text: xp10Text(stats.xp10), value: xp10Rounded(stats.xp10) };
  }
  if ((match = /^acc:(\d+)#(\d+)$/.exec(body))) {
    checkTokenLevel(raw, Number(match[1]), table);
    return number(characterAccuracy(data, table.job, characterWith(raw, Number(match[2]), Number(match[1]), table, data).group).value);
  }
  if ((match = /^exp:(\d+)$/.exec(body))) return number(mobOf(Number(match[1])).exp);
  if ((match = /^spawn:(\d+)@(\d+)$/.exec(body))) {
    const monster = mobOf(Number(match[1]));
    const count = monster.sp?.find(([map]) => map === Number(match![2]))?.[1];
    if (!count) throw new Error(`代號 ${raw}：${monster.n}沒有刷在地圖 ${match[2]}`);
    return number(count);
  }
  if ((match = /^weapon:(\d+)$/.exec(body))) {
    const weapon = weaponOf(Number(match[1]));
    return { text: weapon.n, value: (isMagicJob(table.job) ? weapon.mag : weapon.atk) ?? 0 };
  }
  if ((match = /^req:(\d+):(STR|DEX|INT|LUK)$/.exec(body))) {
    const weapon = weaponOf(Number(match[1]));
    const need = weapon.req?.[match[2] as StatKey];
    if (need === undefined) throw new Error(`代號 ${raw}：${weapon.n}沒有這項需求`);
    return number(need);
  }
  if ((match = /^price:(\d+)$/.exec(body))) {
    const weapon = weaponOf(Number(match[1]));
    const prices = (weapon.src.shops ?? []).map(shop => shop.pr).filter((price): price is number => typeof price === "number");
    if (!prices.length) throw new Error(`代號 ${raw}：${weapon.n}店裡沒賣`);
    const value = Math.min(...prices);
    return { text: mesoText(value), value };
  }
  if ((match = /^spd:(\d+)$/.exec(body))) return number(weaponOf(Number(match[1])).spd ?? 0);
  throw new Error(`認不得的代號 ${raw}`);
}

/**
 * {{hits:怪物id}}、{{hitLv:怪物id}}、{{def:怪物id}} 換成表上算出來的數字；打不中的 hitLv 換成「超過 N」（後面接「等」）。
 * {{hitsOne:怪物id}} 是群體治癒「打 1 隻」那一欄（hits 是範圍 3 隻那一欄）。
 * {{hits:怪物id@等級#武器id}}、{{hitsOne:…}} 換成那一級的預設角色、預設技能等級、拿那把武器算的下數；{{acc:等級#武器id}} 是那一級拿那把的命中。
 * {{exp:怪物id}} 每隻經驗、{{spawn:怪物id@地圖id}} 那張圖刷幾隻、{{weapon:武器id}} 武器名、{{req:武器id:DEX}} 能力需求、{{price:武器id}} 店價（25 萬）、{{map:地圖id}} 圖名。
 * 比較誰快誰慢要用平均，不准比 hits（進位過，1.45 跟 1.15 都是 2，hitComparisonProblems 擋）：{{avg:怪物id@等級#武器id}} 平均幾下（一位小數）、
 * {{oneShot:…}} 一下打死機率（整數加 %）、{{killTime:…}} 打死一隻平均秒數（含出手時間，兩位小數，後面寫「秒」）、{{xp10:…}} 不停手不找怪 10 分鐘的經驗上限（約 3.1 萬）。
 * 這四個群體治癒沒寫隻數照表的 3 隻，打 1 隻寫 {{avg:怪物id@等級#武器id*1}}（*1～*5，別的技能不能寫）；下數都假設全部打中，MISS 不算。
 * 這些都要給 data，等級要在文章範圍內，怪不用在表上。
 * {{mob:怪名}}、{{mobs:怪名的一部分}} 換成字本身，名字查不查得到由 validateArticle 擋。換不掉就丟錯，不留原文。
 */
export function fillTokens(text: string, table: CalcTable, data?: CalcData): string {
  const filled = text.replace(TOKEN, (raw, body: string) => {
    const name = /^mobs?:(.+)$/.exec(body);
    if (name) return name[1];
    const fromData = dataToken(raw, body, table, data);
    if (fromData) return fromData.text;
    const mapToken = /^map:(\d+)$/.exec(body);
    if (mapToken) {
      const zh = data?.maps[mapToken[1]]?.zh;
      if (!zh) throw new Error(`代號 ${raw}：地圖 ${mapToken[1]} 沒有中文名`);
      return zh;
    }
    const match = /^(hits|hitsOne|hitLv|def):(\d+)$/.exec(body);
    if (!match) throw new Error(`認不得的代號 ${raw}（只有 hits、hitsOne、hitLv、def、mob、mobs、map、acc、exp、spawn、weapon、req、price、spd、avg、oneShot、killTime、xp10；hits、hitsOne 可以加 @等級#武器id，avg、oneShot、killTime、xp10 一定要加）`);
    const row = table.rows.find(entry => entry.id === Number(match[2]));
    if (!row) throw new Error(`代號 ${raw} 指到計算表沒有的怪 ${match[2]}（表上：${table.rows.map(entry => entry.name).join("、")}）`);
    if (match[1] === "def") return String(row.def);
    if (match[1] === "hitLv") return row.hitLv === null ? `超過 ${table.to}` : String(row.hitLv);
    if (match[1] === "hitsOne") {
      if (row.hitsOne === null) throw new Error(`代號 ${raw}：這張表沒有「打 1 隻」這一欄，用 hits`);
      return String(row.hitsOne);
    }
    if (row.hits === null) throw new Error(`代號 ${raw}：${row.name}算不出幾下`);
    return String(row.hits);
  });
  if (filled.includes("{{") || filled.includes("}}")) throw new Error(`代號沒寫完整：${text}`);
  return filled;
}

function mapStrings<T>(value: T, change: (text: string) => string): T {
  if (typeof value === "string") return change(value) as T;
  if (Array.isArray(value)) return value.map(entry => mapStrings(entry, change)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, mapStrings(entry, change)])) as T;
  }
  return value;
}

/** 整篇每個字串都換掉代號；換不掉丟錯，建置就會失敗 */
export function resolveArticle(article: JobArticle, table: CalcTable, data?: CalcData): JobArticle {
  return mapStrings(article, text => fillTokens(text, table, data));
}

/* ------------------------------------------------------------------ 防呆 */

/** 模板會補經典版、Google 只顯示約 150 字 */
const DESCRIPTION_MAX = 150;
/** Google 標題大約顯示 30 字：模板接在後面的「｜楓之谷經典版」要落在裡面（估算） */
const TITLE_MAX = 23;
/** 結論每條幾字內（換完代號算）：手機一條兩行多看完，再長就是把步驟卡的內容搬上來 */
export const ANSWER_MAX = 70;
const EMOJI = /[\u2300-\u23FF\u25A0-\u25FF\u2600-\u27BF]|[\u{1F300}-\u{10FFFF}]/u;
const STEP_TAGS: readonly string[] = ["tw", "community", "legacy", "calc", "game"];
const CLAIM_TAGS: readonly string[] = [...STEP_TAGS, "official"];

/** 內文不准出現真實品牌、站名（來源網址不算），也不准講「私服」（對外一律寫參考舊版資料） */
const BANNED_WORDS = ["楓錄", "巴哈", "beanfun", "Artale", "私服"];
const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function collectStrings(value: unknown, where: string, out: Array<{ where: string; text: string }>): void {
  if (typeof value === "string") out.push({ where, text: value });
  else if (Array.isArray(value)) value.forEach((entry, index) => collectStrings(entry, `${where}[${index}]`, out));
  else if (isRecord(value)) for (const [key, entry] of Object.entries(value)) collectStrings(entry, where ? `${where}.${key}` : key, out);
}

/** 官方網域：beanfun.com 跟它底下的子網域（maplestoryclassic-event.beanfun.com）；beanfun.com.example.com 不算 */
function isOfficial(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    return (protocol === "https:" || protocol === "http:") && (hostname === "beanfun.com" || hostname.endsWith(".beanfun.com"));
  } catch {
    return false;
  }
}

/** 這個職業（三轉含二轉）攻略裡寫過的所有出處 */
export function guideSources(job: number, guides: CalcData["guides"]): string[] {
  const urls = articleGuides(job, guides).flatMap(guide => [
    ...guide.stat.flatMap(row => row.s),
    ...guide.builds.flatMap(row => row.s),
    ...guide.train.flatMap(row => row.s),
    ...guide.notes.flatMap(row => row.s),
    ...guide.gaps.flatMap(row => row.s),
    ...guide.notOpenYet.flatMap(row => row.s),
  ]);
  return [...new Set(urls)];
}

export type ArticleContext = {
  job: number;
  from: number;
  to: number;
  data: CalcData;
  /** 已開放的圖（static-data 的 staticOpenMaps）；不給就只看攻略的 notOpenYet */
  openMaps?: Set<number>;
};

/** 這張圖能不能推薦：有中文名、已開放（等級重疊的 notOpenYet 也沒寫它）；不行回原因 */
function mapProblem(map: unknown, range: { from: number; to: number }, ctx: ArticleContext): string | null {
  const zh = typeof map === "number" ? ctx.data.maps[String(map)]?.zh : undefined;
  if (!zh) return `地圖 ${String(map)} 沒有中文名`;
  // 有已開放清單就照清單：攻略的 notOpenYet 是研究當時寫的，改版開放後不會自己變（冰原雪域、雲彩公園誤擋過）
  const closed = ctx.openMaps
    ? !ctx.openMaps.has(map as number)
    : articleGuides(ctx.job, ctx.data.guides).some(guide => guide.notOpenYet.some(row => overlaps(row, range.from, range.to) && row.place.includes(zh)));
  return closed ? `${zh}尚未開放，不能當推薦` : null;
}

/** 圖名去掉尾巴編號：螞蟻洞Ⅲ → 螞蟻洞 */
const mapFamily = (zh: string) => zh.replace(/[\s\dⅠ-ⅫIVX]+$/, "");

/** 這張圖在不在這個職業攻略的練功段；同系列的算（攻略寫螞蟻洞Ⅰ，文章可以直接帶玩家去殭屍菇菇最多的螞蟻洞Ⅲ） */
function mapInGuide(map: unknown, ctx: ArticleContext): boolean {
  const zh = typeof map === "number" ? ctx.data.maps[String(map)]?.zh : undefined;
  if (!zh) return false;
  const family = mapFamily(zh);
  return articleGuides(ctx.job, ctx.data.guides).some(guide => guide.train.some(row => row.map === map || (row.map !== null && mapFamily(ctx.data.maps[String(row.map)]?.zh ?? "") === family)));
}

/** 僧侶 31～70：結論主推（不是 alt）提到的圖要有不死系，提到的怪要有不死系 */
function checkAnswerUndead(line: Record<string, unknown>, where: string, low: number, ctx: ArticleContext, errors: string[]): void {
  if (line.alt === true || !undeadOnlyStage(ctx.job, low)) return;
  const text = String(line.text ?? "");
  const maps = [...text.matchAll(/\{\{map:(\d+)\}\}/g)].map(match => Number(match[1]));
  if (typeof line.go === "number") maps.push(line.go);
  const open = ctx.data.monsters.filter(monster => !monster.un);
  for (const map of new Set(maps)) {
    if (!open.some(monster => monsterSuitsJob(ctx.job, low, monster) && monster.sp?.some(([id]) => id === map))) errors.push(`${where}：僧侶 31～70 主推要打不死系，${ctx.data.maps[String(map)]?.zh ?? map}沒有不死系的怪（要提就標 alt: true 當備案）`);
  }
  const names = [...text.matchAll(/\{\{mob:(.+?)\}\}/g)].map(match => match[1]);
  if (names.length && !names.some(name => open.some(monster => monster.n === name && monsterSuitsJob(ctx.job, low, monster)))) errors.push(`${where}：僧侶 31～70 主推要打不死系，${names.join("、")}都不是（要提就標 alt: true 當備案）`);
}

/** 組隊任務的入口（guides/common.json 的 pq.entrance，測試對過）：不是練功圖，但主推組隊時結論按鈕要帶得到這裡 */
export const PQ_ENTRANCES: ReadonlySet<number> = new Set([100000200, 103000000, 200080101]);

/** 結論：go 的地圖要能去、在攻略練功段、是同一段的步驟；第一條起涵蓋整段等級、每條 ANSWER_MAX 字內；僧侶 31～70 主推只准不死系 */
function checkAnswer(lines: unknown[], steps: unknown, ctx: ArticleContext, table: CalcTable | null, errors: string[]): void {
  const { from, to, data } = ctx;
  const covered = new Set<number>();
  const stepRows = (Array.isArray(steps) ? steps : []).filter(isRecord);
  lines.forEach((line, index) => {
    if (!isRecord(line)) return;
    const where = `answer[${index}]`;
    const filled = (() => {
      if (!isText(line.text)) return "";
      try {
        return table ? fillTokens(line.text, table, data) : line.text;
      } catch {
        return line.text; // 代號的錯下面會一起報
      }
    })();
    const ranged = typeof line.from === "number" && typeof line.to === "number" && line.from <= line.to && line.from >= from && line.to <= to;
    const span = ranged ? { from: line.from as number, to: line.to as number } : { from, to };
    if (line.alt !== undefined && line.alt !== true) errors.push(`${where}：alt 只能是 true 或不寫`);
    if (line.go !== undefined) {
      const problem = mapProblem(line.go, span, ctx);
      if (problem) errors.push(`${where}.go：${problem}`);
      else if (!PQ_ENTRANCES.has(line.go as number) && !mapInGuide(line.go, ctx)) errors.push(`${where}.go：${data.maps[String(line.go)]?.zh}不在這個職業攻略的練功段`);
      else if (!PQ_ENTRANCES.has(line.go as number) && !stepRows.some(step => step.map === line.go && (line.alt === true || step.alt !== true) && overlaps({ from: Number(step.from), to: Number(step.to) }, span.from, span.to))) {
        errors.push(`${where}.go：${data.maps[String(line.go)]?.zh}要是 ${span.from}～${span.to} 等的${line.alt === true ? "" : "主推"}步驟，結論跟步驟卡才帶去同一張圖`);
      }
    }
    if (span.from <= 70 && span.to >= 31) checkAnswerUndead(line, where, Math.max(span.from, 31), ctx, errors);
    if (line.from !== undefined || line.to !== undefined) {
      if (!Number.isInteger(line.from) || !Number.isInteger(line.to)) errors.push(`${where}：from、to 要成對、都是整數`);
      else if (!ranged) errors.push(`${where}：等級要在文章範圍 ${from}～${to} 內、前小後大`);
      else {
        const [low, high] = [line.from as number, line.to as number];
        for (let level = low; level <= high; level++) covered.add(level);
        const label = low === high ? `${low} 等` : `${low}～${high}`;
        if (!filled.includes(label)) errors.push(`${where}：文字裡要看得到「${label}」（from、to 玩家看不到；範圍 ${from}～${to}）`);
      }
    }
    if (filled.length > ANSWER_MAX) errors.push(`${where}：每條 ${ANSWER_MAX} 字內（換完代號現在 ${filled.length}）`);
  });
  const first = lines[0];
  if (!isRecord(first) || first.from !== from) errors.push(`answer：第一條要從 ${from} 等講起（from: ${from}），玩家先看到自己這級要做什麼`);
  const missing: number[] = [];
  for (let level = from; level <= to; level++) if (!covered.has(level)) missing.push(level);
  if (missing.length) errors.push(`answer：結論沒講到 ${missing.join("、")} 等`);
}

/** 文章的 gear：要連續蓋滿整段；回傳形狀對的（武器穿不穿得上由 checkGearWearable 查） */
function checkGear(value: unknown, from: number, to: number, errors: string[]): ArticleGear[] | undefined {
  const shaped = Array.isArray(value) && value.length > 0 && value.every(piece => isRecord(piece) && [piece.from, piece.to, piece.weapon].every(Number.isInteger));
  if (!shaped) {
    errors.push('gear：每一級拿哪把，例 [{"from": 31, "to": 50, "weapon": 1402008}]');
    return undefined;
  }
  const pieces = value as ArticleGear[];
  const contiguous = pieces[0].from === from && pieces[pieces.length - 1].to === to && pieces.every((piece, index) => piece.from <= piece.to && (index === 0 || piece.from === pieces[index - 1].to + 1));
  if (!contiguous) {
    errors.push(`gear：要從 ${from} 等連續蓋到 ${to} 等，中間不能斷`);
    return undefined;
  }
  return pieces;
}

/** 每一把：這職業拿得到、那幾級穿得上；物理職業的精準技能要有點到 */
function checkGearWearable(gear: readonly ArticleGear[], midLevel: number, limits: Pick<CalcTable, "job" | "statCap">, data: CalcData, errors: string[]): boolean {
  const before = errors.length;
  for (const piece of gear) {
    // 不用計算機選單：俠盜 35 等前丟拳套，選單只列短刀，但職業拿得起
    const weapon = data.gear.weapons.find(entry => entry.id === piece.weapon);
    if (!weapon || canJobUse(weapon.job, limits.job) !== true || !obtainableBy(weapon.src, limits.job)) {
      errors.push(`gear：${weapon?.n ?? piece.weapon} 這個職業拿不到`);
      continue;
    }
    try {
      // 每一級都查：主屬性遇到配點換階會往下掉（刺客預設幸運 34→35 掉 5），不能只看第一級
      for (let level = piece.from; level <= piece.to; level++) {
        const { group } = characterWith(`gear ${level} 等`, piece.weapon, level, limits, data);
        if (piece.skill !== undefined && (piece.skillLevel ?? group.levels[piece.skill] ?? 0) <= 0) throw new Error(`${level} 等${skillNameOf(data, piece.skill)}還沒點`);
      }
    } catch (error) {
      errors.push(`gear：${(error as Error).message}`);
    }
    // 表下的連結開中段那一組，計算機選單沒有的武器會被當沒帶，開出來跟表不同
    if (piece.from <= midLevel && midLevel <= piece.to && !weaponChoices(data.gear, limits.job).some(entry => entry.id === piece.weapon)) {
      errors.push(`gear：${weapon.n}不在計算機的武器選單，${midLevel} 等不能拿這把（表下的連結開不出來）`);
    }
    const mastery = masterySkillFor(weapon.s, limits.job);
    if (mastery !== null && (stateAt(data, limits.job, piece.to).groups[0].levels[mastery] ?? 0) <= 0) {
      errors.push(`gear：${weapon.n}要吃${data.skills.get(mastery)?.n ?? "精準技能"}，但技能點法到 ${piece.to} 等都沒點，換別的武器或改文字`);
    }
  }
  return errors.length === before;
}

/** 文章的 statCap：能力代號對數字；回傳能用的 */
function checkStatCap(value: unknown, errors: string[]): JobArticle["statCap"] {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !Object.entries(value).every(([key, cap]) => ["STR", "DEX", "INT", "LUK"].includes(key) && typeof cap === "number" && cap > 0)) {
    errors.push('statCap：要是能力對上限，例 {"DEX": 60}');
    return undefined;
  }
  return value as JobArticle["statCap"];
}

function checkLines(lines: unknown, where: string, errors: string[]): void {
  if (lines === undefined) return;
  if (!Array.isArray(lines)) {
    errors.push(`${where}：要是陣列`);
    return;
  }
  lines.forEach((line, index) => {
    if (!isRecord(line) || !isText(line.text)) errors.push(`${where}[${index}]：要有 text`);
    else if (!CLAIM_TAGS.includes(String(line.tag))) errors.push(`${where}[${index}]：每一條都要標 tag，只能是 ${CLAIM_TAGS.join("、")}`);
  });
}

function checkStep(step: unknown, index: number, ctx: ArticleContext, errors: string[]): void {
  const where = `steps[${index}]`;
  if (!isRecord(step)) {
    errors.push(`${where}：要是物件`);
    return;
  }
  const { job, from, to, data } = ctx;
  if (typeof step.from !== "number" || typeof step.to !== "number" || step.from > step.to || step.from < from || step.to > to) {
    errors.push(`${where}：等級要在文章範圍 ${from}～${to} 內、前小後大`);
  }
  if (step.kind !== "solo" && step.kind !== "party") errors.push(`${where}：kind 只能是 solo、party`);
  if (!STEP_TAGS.includes(String(step.tag))) errors.push(`${where}：tag 只能是 ${STEP_TAGS.join("、")}`);
  if (!isText(step.title)) errors.push(`${where}：要有 title`);
  if (!isText(step.text)) errors.push(`${where}：要有 text`);
  if (step.alt !== undefined && step.alt !== true) errors.push(`${where}：alt 只能是 true 或不寫`);
  if (step.go !== undefined && !PQ_ENTRANCES.has(step.go as number)) errors.push(`${where}：go 只能是組隊任務入口`);

  const problem = mapProblem(step.map, { from: Number(step.from), to: Number(step.to) }, ctx);
  if (problem) errors.push(`${where}：${problem}`);
  const zh = typeof step.map === "number" ? data.maps[String(step.map)]?.zh : undefined;
  if (zh && !mapInGuide(step.map, ctx)) errors.push(`${where}：${zh}不在這個職業攻略的練功段`);

  const mobs = Array.isArray(step.mobs) ? (step.mobs as unknown[]) : [];
  if (!mobs.length) errors.push(`${where}：mobs 至少一隻`);
  const byId = new Map(data.monsters.map(monster => [monster.id, monster]));
  for (const id of mobs) {
    const monster = byId.get(id as number);
    if (!monster || monster.un) errors.push(`${where}：怪 ${String(id)} 不在怪物資料裡`);
    else if (zh && !monster.sp?.some(([map]) => map === step.map)) errors.push(`${where}：${monster.n}沒有刷在${zh}`);
  }

  // 僧侶 31～70 只推不死系（job-rules.ts）：主推的圖至少要有一隻打得到的
  if (step.alt !== true && typeof step.from === "number" && typeof step.to === "number") {
    const low = Math.max(step.from, 31);
    if (low <= Math.min(step.to, 70) && undeadOnlyStage(job, low)) {
      const hasUndead = mobs.some(id => {
        const monster = byId.get(id as number);
        return monster && monsterSuitsJob(job, low, monster);
      });
      if (!hasUndead) errors.push(`${where}：僧侶 31～70 主推的圖要有不死系的怪（不是主推就標 alt）`);
    }
  }
}

/** 表現在的前提，寫文章時貼進 assumes */
export function tableAssumes(table: CalcTable): ArticleAssumes {
  const { assumptions: a, rows } = table;
  return {
    weapon: a.weapon?.id ?? null,
    weaponPower: a.weapon?.power ?? null,
    ammo: a.ammo?.id ?? null,
    skill: a.skill.id,
    skillLevel: a.skill.level,
    accuracy: a.accuracy.value,
    hits: Object.fromEntries(rows.map(row => [String(row.id), row.hits])),
    hitLv: Object.fromEntries(rows.map(row => [String(row.id), row.hitLv])),
  };
}

/** 這個鍵（代號本體）現在的值；算不出來是 null（代號的錯另外報） */
function keyValue(key: string, table: CalcTable, data: CalcData): number | null {
  try {
    return dataToken(`{{${key}}}`, key, table, data)?.value ?? null;
  } catch {
    return null;
  }
}

/** 文章字串裡用到的資料代號（不看 assumes 自己），算成現在的值 */
function pinnedValues(article: unknown, table: CalcTable, data: CalcData): Record<string, number | null> {
  const strings: Array<{ where: string; text: string }> = [];
  collectStrings(article, "", strings);
  const values: Record<string, number | null> = {};
  for (const { where, text } of strings) {
    if (where.startsWith("assumes")) continue;
    for (const match of text.matchAll(TOKEN)) {
      if (match[1] in values || !DATA_TOKEN.test(match[1])) continue;
      values[match[1]] = keyValue(match[1], table, data);
    }
  }
  return values;
}

/** 講經驗誰贏誰輸的字：理由靠怪的經驗，那幾隻要進 assumes */
const EXP_CLAIM = /贏|輸|打平|追平|追過|差不多|更多|更低|更高|最好|最高|最低|最少|次之|划算/;

/** 文字裡比經驗的句子提到的怪（玩家回報的 10 分鐘經驗是回報，不是資料，寫手自己別用這些字比） */
function expClaimMobs(article: unknown, data: CalcData): Array<{ where: string; id: number; name: string }> {
  const strings: Array<{ where: string; text: string }> = [];
  collectStrings(article, "", strings);
  const out: Array<{ where: string; id: number; name: string }> = [];
  for (const { where, text } of strings) {
    if (where.startsWith("assumes") || where.startsWith("sources") || !text.includes("經驗") || !EXP_CLAIM.test(text)) continue;
    for (const match of text.matchAll(/\{\{mob:(.+?)\}\}/g)) {
      const monster = data.monsters.find(entry => entry.n === match[1]);
      if (monster) out.push({ where, id: monster.id, name: monster.n });
    }
  }
  return out;
}

/**
 * 整篇該貼進 assumes 的那一包：表的前提、文字用到的資料代號（pinned）、理由靠的值（relies：比經驗的句子提到的怪自動列，原本手寫的鍵照現在的值更新）。article:show 印這個。
 */
export function articleAssumes(article: unknown, table: CalcTable, data: CalcData): ArticleAssumes {
  const pinned = pinnedValues(article, table, data);
  const written = isRecord(article) && isRecord(article.assumes) && isRecord(article.assumes.relies) ? Object.keys(article.assumes.relies) : [];
  const keys = new Set([...written, ...expClaimMobs(article, data).map(({ id }) => `exp:${id}`).filter(key => !(key in pinned))]);
  const relies = Object.fromEntries([...keys].map(key => [key, keyValue(key, table, data)]));
  return { ...tableAssumes(table), ...(Object.keys(pinned).length ? { pinned } : {}), ...(keys.size ? { relies } : {}) };
}

/** 文字引用的值、理由靠的值：一變就算壞（不看先後） */
function checkPinned(article: Record<string, unknown>, assumes: Record<string, unknown>, table: CalcTable, data: CalcData, errors: string[]): void {
  const current = pinnedValues(article, table, data);
  const pasted = isRecord(assumes.pinned) ? assumes.pinned : {};
  for (const [key, value] of Object.entries(current)) {
    if (!(key in pasted)) errors.push(`assumes.pinned：文字用了 {{${key}}}，要貼進 assumes（npm run article:show 印的那一包）`);
    else if (pasted[key] !== value) errors.push(`assumes.pinned：${key} 文字寫的時候是 ${String(pasted[key])}，現在是 ${String(value)}，文字要重看`);
  }
  for (const key of Object.keys(pasted)) if (!(key in current)) errors.push(`assumes.pinned：${key} 文字已經沒用到，拿掉`);
  const relies = isRecord(assumes.relies) ? assumes.relies : {};
  for (const [key, value] of Object.entries(relies)) {
    const now = keyValue(key, table, data);
    if (!DATA_TOKEN.test(key)) errors.push(`assumes.relies：認不得 ${key}（要是 exp:怪物id 這種代號本體）`);
    else if (now !== value) errors.push(`assumes.relies：${key} 文字寫的時候是 ${String(value)}，現在是 ${String(now)}，文字要重看`);
  }
  for (const { where, id, name } of expClaimMobs(article, data)) {
    if (!(`exp:${id}` in relies) && !(`exp:${id}` in current)) errors.push(`${where}：這句在比${name}的經驗，exp:${id} 要進 assumes.relies（npm run article:show 印的那一包）`);
  }
}

const PREMISES: Array<[Exclude<keyof ArticleAssumes, "hits" | "hitLv" | "pinned" | "relies">, string]> = [
  ["weapon", "武器"],
  ["weaponPower", "武器攻擊"],
  ["ammo", "彈藥"],
  ["skill", "技能"],
  ["skillLevel", "技能等級"],
  ["accuracy", "命中"],
];

/** 文字依賴的前提跟表比對：武器、技能、命中要一樣；每隻怪幾下、幾等不 MISS 的先後要一樣（打不中當成最後） */
function checkAssumes(assumes: unknown, table: CalcTable, data: CalcData, errors: string[]): void {
  if (!isRecord(assumes)) {
    errors.push("要有 assumes（npm run article:table 印的那一包）");
    return;
  }
  const now = tableAssumes(table);
  for (const [key, label] of PREMISES) {
    if (assumes[key] !== now[key]) errors.push(`assumes.${key}：文字是照${label} ${String(assumes[key])} 寫的，表現在是 ${String(now[key])}，文字要重看`);
  }
  const nameOf = (id: string) => data.monsters.find(monster => String(monster.id) === id)?.n ?? id;
  for (const kind of ["hits", "hitLv"] as const) {
    const written = assumes[kind];
    if (!isRecord(written)) {
      errors.push(`assumes.${kind}：要有這一包`);
      continue;
    }
    const current = now[kind];
    const ids = Object.keys(current);
    for (const id of ids) if (!(id in written)) errors.push(`assumes.${kind}：表上多了${nameOf(id)}，文字要重看`);
    for (const id of Object.keys(written)) if (!(id in current)) errors.push(`assumes.${kind}：表上少了${nameOf(id)}，文字要重看`);
    const shared = ids.filter(id => id in written);
    // 打不中（null）當成排最後，兩隻都打不中算一樣
    const order = (a: unknown, b: unknown) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : Math.sign(Number(a) - Number(b)));
    for (const id of shared) {
      if ((written[id] === null) !== (current[id] === null)) errors.push(`assumes.${kind}：${nameOf(id)}文字寫的時候是 ${String(written[id])}，現在是 ${String(current[id])}，文字要重看`);
    }
    for (const a of shared) {
      for (const b of shared) {
        if (a < b && order(written[a], written[b]) !== order(current[a], current[b])) {
          errors.push(`assumes.${kind}：${nameOf(a)}跟${nameOf(b)}的先後變了，文字要重看`);
        }
      }
    }
  }
}

/** 地圖名（連同拿掉尾巴編號的）：猴子森林Ⅱ、猴子森林 裡的「猴子」不是在講怪 */
function mapWords(data: CalcData, monsterNames: Set<string>): string[] {
  const words = new Set<string>();
  for (const record of Object.values(data.maps)) {
    if (!record.zh) continue;
    words.add(record.zh);
    words.add(record.zh.replace(/[\s\dⅠ-ⅫIVX]+$/, ""));
  }
  return [...words].filter(word => word.length >= 2 && !monsterNames.has(word)).sort((a, b) => b.length - a.length);
}

/**
 * 內文直接打字的完整圖名、武器名擋掉（來源標題不管）：走 {{map:id}}、{{weapon:id}} 才看得到關掉、拿掉。{{map:}} 提到的圖也要開放。
 * 武器名跟武器系別同名的（拳套）是在講類別，不算。
 */
function checkNamedThings(strings: Array<{ where: string; text: string }>, ctx: ArticleContext, errors: string[]): void {
  const { data, from, to } = ctx;
  const monsterNames = new Set(data.monsters.map(monster => monster.n));
  const mapNames = [...new Set(Object.values(data.maps).flatMap(record => record.zh ?? []))].filter(name => name.length >= 3 && !monsterNames.has(name)).sort((a, b) => b.length - a.length);
  const types = new Set(data.gear.weapons.map(weapon => weapon.s));
  const weaponNames = [...new Set(data.gear.weapons.map(weapon => weapon.n))].filter(name => name.length >= 2 && !types.has(name)).sort((a, b) => b.length - a.length);
  // 職業名先拿掉：弩弓手裡有武器名「弩弓」
  const jobNames = [...new Set(Object.values(data.guides).flat().flatMap(guide => guide?.name ?? []))].sort((a, b) => b.length - a.length);
  for (const { where, text } of strings) {
    if (where.startsWith("sources") || where.startsWith("assumes")) continue;
    for (const match of text.matchAll(/\{\{map:(\d+)\}\}/g)) {
      const problem = mapProblem(Number(match[1]), { from, to }, ctx);
      if (problem) errors.push(`${where}：${problem}`);
    }
    let plain = text.replace(TOKEN, "\0");
    for (const name of jobNames) plain = plain.split(name).join("\0");
    for (const name of mapNames) {
      if (!plain.includes(name)) continue;
      errors.push(`${where}：圖名「${name}」要寫成 {{map:地圖id}}`);
      plain = plain.split(name).join("\0");
    }
    for (const name of weaponNames) {
      if (!plain.includes(name)) continue;
      errors.push(`${where}：武器名「${name}」要寫成 {{weapon:武器id}}`);
      plain = plain.split(name).join("\0");
    }
  }
}

/** 遊戲資料的句子寫刷怪隻數要走代號：這種數字資料一改就錯 */
function checkSpawnClaims(article: Record<string, unknown>, errors: string[]): void {
  const lines = (where: string, value: unknown) => {
    if (!Array.isArray(value)) return;
    value.forEach((line, index) => {
      if (isRecord(line) && line.tag === "game" && typeof line.text === "string" && /\d+\s*隻/.test(line.text.replace(TOKEN, ""))) errors.push(`${where}[${index}]：刷怪隻數要寫成 {{spawn:怪物id@地圖id}}`);
    });
  };
  lines("answer", article.answer);
  lines("steps", article.steps);
  if (Array.isArray(article.sections)) {
    article.sections.forEach((section, index) => {
      if (!isRecord(section)) return;
      lines(`sections[${index}].paragraphs`, section.paragraphs);
      lines(`sections[${index}].items`, section.items);
    });
  }
}

/** 比較字眼：查核最常錯的那些；「至少」「大多」這種不是在比的先拿掉（對五篇真檔試過，規格 v1.50） */
const COMPARE_WORD = /贏|輸|一樣|打平|差|少|多|快|慢|省|才值得|追平|不虧|比/;
const NOT_COMPARE = /多少|至少|最少|最多|很多|好多|許多|大多|多數|多半|不少|很少|少數|趕快|慢慢|差一點|比較/g;
/** 這些字一出現就是在比：只有一個 {{hits}} 也算（「跟那把一樣 {{hits}} 下」是查核抓到最多的句型，另一邊沒寫成代號） */
const STRONG_COMPARE = /贏|輸|一樣|打平|差不多|省|才值得|追平|不虧|比(?!較)/;
/** 寫死的下數：「3 下」「兩下」「一下死」「少一下」。單獨的「一下」太常是「看一下」、「第二下」是順序、「2～3 下」是範圍、「下面」「下層」不是下數 */
const FIXED_HITS = /(?<![\d～~-])\d+\s*下(?![面方去來層午])|(?<![第一])[兩二三四五六七八九十]下(?![面方去來層午])|一下(?:打)?死|[少多]一下/;

/**
 * 比較句不准比進位過的下數（三輪查核最多的錯）：計算機的 kills.avg 是平均傷害無條件進位，1.45 跟 1.15 都寫 2，「都 2 下所以一樣」差了兩成，也會翻盤。
 * 同一句（以「。」切）有比較字眼，又有 2 個以上 {{hits、{{hitsOne 代號，或寫死的下數，就擋；有 STRONG_COMPARE 的字時 1 個代號就擋。
 * {{avg}}、{{killTime}} 放行。來源標題、assumes 不管。
 */
export function hitComparisonProblems(strings: Array<{ where: string; text: string }>): string[] {
  const problems: string[] = [];
  for (const { where, text } of strings) {
    if (where.startsWith("sources") || where.startsWith("assumes")) continue;
    for (const sentence of text.split("。")) {
      const words = sentence.replace(TOKEN, "\0");
      const tokens = (sentence.match(/\{\{hits(?:One)?:/g) ?? []).length;
      const compares = COMPARE_WORD.test(words.replace(NOT_COMPARE, "\0"));
      const blocked = compares && (tokens >= 2 || FIXED_HITS.test(words));
      if (!blocked && !(tokens === 1 && STRONG_COMPARE.test(words))) continue;
      problems.push(`${where}：這句在比較，下數是進位過的（1.45 跟 1.15 都寫 2），改用 {{avg}} 或 {{killTime}}（{{avg:怪物id@等級#武器id}}）：「${sentence.trim().slice(0, 60)}」`);
    }
  }
  return problems;
}

/** 主推步驟（不是 alt）要涵蓋整段：玩家每一級都要有地方去，備案不算 */
function checkStepCoverage(steps: unknown[], from: number, to: number, errors: string[]): void {
  const covered = new Set<number>();
  for (const step of steps) {
    if (!isRecord(step) || step.alt === true || typeof step.from !== "number" || typeof step.to !== "number") continue;
    for (let level = step.from; level <= step.to; level++) covered.add(level);
  }
  const missing: number[] = [];
  for (let level = from; level <= to; level++) if (!covered.has(level)) missing.push(level);
  if (missing.length) errors.push(`steps：主推步驟沒講到 ${missing.join("、")} 等（只有備案不算）`);
}

/**
 * 文中提到的怪名要查得到：怪名一律寫成 {{mob:完整名字}}（玩家講的是一整個家族就 {{mobs:獨角獅}}），查不到就擋；
 * 直接打字的怪名、怪名的一部分也擋，不然打錯字、寫到別版的怪機器看不到。來源標題不管。
 * 機器看得到的只有「資料裡有的名字」：完全不在資料裡的字（別版才有的怪）還是要靠人對，所以寫手一律走代號。
 */
function checkMobNames(strings: Array<{ where: string; text: string }>, data: CalcData, errors: string[]): void {
  const open = data.monsters.filter(monster => !monster.un).map(monster => monster.n);
  const openSet = new Set(open);
  const all = [...new Set(data.monsters.map(monster => monster.n))].sort((a, b) => b.length - a.length);
  const fragments = new Map<string, string>();
  for (const name of all) for (let at = 0; at + 3 <= name.length; at++) if (!fragments.has(name.slice(at, at + 3))) fragments.set(name.slice(at, at + 3), name);
  const words = mapWords(data, new Set(all));

  for (const { where, text } of strings) {
    if (where.startsWith("sources")) continue;
    for (const match of text.matchAll(TOKEN)) {
      const token = /^(mobs?):(.+)$/.exec(match[1]);
      if (!token) continue;
      const found = token[1] === "mob" ? openSet.has(token[2]) : token[2].length >= 2 && open.some(name => name.includes(token[2]));
      if (!found) errors.push(`${where}：${match[0]} 查不到這隻怪`);
    }
    let plain = text.replace(TOKEN, "\0");
    for (const word of words) plain = plain.split(word).join("\0");
    for (const name of all) {
      if (!plain.includes(name)) continue;
      errors.push(`${where}：怪名「${name}」要寫成 {{mob:${name}}}`);
      plain = plain.split(name).join("\0");
    }
    for (let at = 0; at + 3 <= plain.length; at++) {
      const part = plain.slice(at, at + 3);
      const name = fragments.get(part);
      if (name) errors.push(`${where}：「${part}」像是怪名（${name}）的一部分，要寫成 {{mob:完整名字}} 或 {{mobs:${part}}}`);
    }
  }
}

const isDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  // 2026-02-30 會被進位成 3 月，轉回來對不上就是假日期
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
};

/** 今天的日期（台灣時間）：文章日期是台灣的日期，CI 在 UTC 上跑，早上 8 點前 UTC 還是昨天 */
const taiwanToday = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

/** 文章日期：真的日期，更新不早於發布，都不能是未來（手誤寫錯年月，檢查才擋得到） */
function checkDates(article: Record<string, unknown>, errors: string[]): void {
  if (!isDate(article.published)) errors.push("published：要是發布日 YYYY-MM-DD");
  if (!isDate(article.updated)) errors.push("updated：要是更新日 YYYY-MM-DD");
  else if (isDate(article.published) && article.updated < article.published) errors.push(`updated ${article.updated} 不能早於 published ${article.published}`);
  const today = taiwanToday();
  for (const key of ["published", "updated"]) {
    const value = article[key];
    if (isDate(value) && value > today) errors.push(`${key} ${value} 是未來的日期（今天 ${today}）`);
  }
}

/** 主圖替代文字：要寫一個主推步驟的圖跟那一步的怪，圖片、結論才講同一件事 */
function checkHeroAlt(article: Record<string, unknown>, data: CalcData, errors: string[]): void {
  if (!isText(article.heroAlt)) {
    errors.push("要有 heroAlt（主圖替代文字）");
    return;
  }
  const maps = [...article.heroAlt.matchAll(/\{\{map:(\d+)\}\}/g)].map(match => Number(match[1]));
  const names = [...article.heroAlt.matchAll(/\{\{mob:(.+?)\}\}/g)].map(match => match[1]);
  const steps = (Array.isArray(article.steps) ? article.steps : []).filter(isRecord).filter(step => step.alt !== true);
  const matched = steps.some(step => maps.includes(step.map as number) && Array.isArray(step.mobs) && step.mobs.some(id => names.includes(data.monsters.find(monster => monster.id === id)?.n ?? "")));
  if (!matched) errors.push("heroAlt：要寫主推步驟的圖跟那一步的怪（{{map:地圖id}}、{{mob:怪名}}），才跟文章主推一致");
}

/** 一篇文章的所有防呆，回傳錯誤（空陣列＝過）；欄位缺、型別錯也回錯誤，不丟例外 */
export function validateArticle(article: unknown, ctx: ArticleContext): string[] {
  if (!isRecord(article)) return ["文章要是物件"];
  const { job, from, to, data } = ctx;
  const errors: string[] = [];

  if (!articleEligible(job, from, to, data.guides)) errors.push(`${job}-${from}-${to}：這個範圍沒過門檻（至少 2 張非舊版來源、有地圖的練功圖）`);

  if (!isText(article.title)) errors.push("要有 title");
  else if (article.title.includes("經典版")) errors.push("title 不寫「經典版」，模板會補");
  if (!isText(article.intro)) errors.push("要有 intro");
  checkDates(article, errors);
  if (!isRecord(article.persona) || !isText(article.persona.name) || !isText(article.persona.line)) errors.push("persona：要有 name（個性當名字）、line（一句自介）");
  checkHeroAlt(article, data, errors);

  const statCap = checkStatCap(article.statCap, errors);
  const gear = checkGear(article.gear, from, to, errors);
  const gearOk = Boolean(gear) && checkGearWearable(gear!, Math.floor((from + to) / 2), { job, statCap: statCap ?? null }, data, errors);
  let table: CalcTable | null = null;
  try {
    table = buildCalcTable({ job, from, to, data, gear: gearOk ? gear : undefined, statCap });
  } catch (error) {
    errors.push(`計算表算不出來：${(error as Error).message}`);
  }

  if (isText(article.title)) {
    let length = article.title.length;
    try {
      if (table) length = fillTokens(article.title, table, data).length;
    } catch {
      // 代號的錯下面會一起報
    }
    if (length > TITLE_MAX) errors.push(`title 要 ${TITLE_MAX} 字內（現在 ${length}）：模板的「楓之谷經典版」才不會被截掉`);
  }

  if (table) {
    checkAssumes(article.assumes, table, data, errors);
    if (isRecord(article.assumes)) checkPinned(article, article.assumes, table, data, errors);
  }

  if (!isText(article.description)) errors.push("要有 description");
  else {
    let length = article.description.length;
    try {
      if (table) length = fillTokens(article.description, table, data).length;
    } catch {
      // 代號的錯下面會一起報
    }
    if (length > DESCRIPTION_MAX) errors.push(`description 要 ${DESCRIPTION_MAX} 字內（現在 ${length}）`);
  }

  if (!Array.isArray(article.answer) || article.answer.length < 2 || article.answer.length > 4) errors.push("answer 要 2～4 條");
  else {
    checkLines(article.answer, "answer", errors);
    checkAnswer(article.answer, article.steps, ctx, table, errors);
  }

  if (!Array.isArray(article.steps) || !article.steps.length) errors.push("steps 要是陣列、至少一步");
  else {
    article.steps.forEach((step, index) => checkStep(step, index, ctx, errors));
    if (article.steps.every(step => isRecord(step) && step.alt === true)) errors.push("steps 至少要有一步主推（全部標 alt 不行）");
    else checkStepCoverage(article.steps, from, to, errors);
  }

  if (!Array.isArray(article.sections)) errors.push("sections 要是陣列（沒有就給空陣列）");
  else {
    article.sections.forEach((section, index) => {
      if (!isRecord(section) || !isText(section.heading)) errors.push(`sections[${index}]：要有 heading`);
      else {
        checkLines(section.paragraphs, `sections[${index}].paragraphs`, errors);
        checkLines(section.items, `sections[${index}].items`, errors);
        if (section.topic !== undefined && !(SECTION_TOPICS as readonly unknown[]).includes(section.topic)) errors.push(`sections[${index}].topic 只能是 ${SECTION_TOPICS.join("、")}`);
      }
    });
  }

  if (!Array.isArray(article.sources) || !article.sources.length) errors.push("sources 要是陣列、至少一筆");
  else {
    const allowed = new Set(guideSources(job, data.guides));
    article.sources.forEach((source, index) => {
      if (!isRecord(source) || !isText(source.label) || !isText(source.url)) errors.push(`sources[${index}]：要有 label、url`);
      else if (!allowed.has(source.url) && !isOfficial(source.url)) errors.push(`sources[${index}]：出處 ${source.url} 不在這個職業的來源裡，也不是官方 beanfun.com`);
    });
  }

  const strings: Array<{ where: string; text: string }> = [];
  collectStrings(article, "", strings);
  checkMobNames(strings, data, errors);
  checkNamedThings(strings, ctx, errors);
  checkSpawnClaims(article, errors);
  errors.push(...hitComparisonProblems(strings));
  for (const { where, text } of strings) {
    if (EMOJI.test(text)) errors.push(`${where}：不准有 emoji`);
    if (!/\.url$/.test(where)) for (const word of BANNED_WORDS) if (text.includes(word)) errors.push(`${where}：不准寫「${word}」`);
    if (table) {
      try {
        fillTokens(text, table, data);
      } catch (error) {
        errors.push(`${where}：${(error as Error).message}`);
      }
    }
  }
  return errors;
}

export type ArticleKey = { job: number; from: number; to: number };

/**
 * 分出這份資料下還能出的文章跟被打壞的文章（資料更新時一篇壞掉不擋整站：建置只出 ok，壞的由 data-refresh 開 issue 通知）。
 * 一定不丟例外。
 */
export function splitArticles(entries: Array<ArticleKey & { article: unknown }>, data: CalcData, openMaps: Set<number>) {
  const ok: ArticleKey[] = [];
  const broken: Array<ArticleKey & { errors: string[] }> = [];
  for (const { job, from, to, article } of entries) {
    let errors: string[];
    try {
      errors = validateArticle(article, { job, from, to, data, openMaps });
    } catch (error) {
      errors = [`檢查時出錯：${(error as Error).message}`];
    }
    if (errors.length) broken.push({ job, from, to, errors });
    else ok.push({ job, from, to });
  }
  return { ok, broken };
}

/* ------------------------------------------------------------------ 給寫手看的 */

/** 寫一篇要看的東西：計算表、假設、這個範圍的攻略列（附圖名、怪名）、職業頁的配點點法與注意事項、能用的出處 */
export function writerBrief({ job, from, to, data, gear, statCap }: { job: number; from: number; to: number; data: CalcData; gear?: readonly ArticleGear[]; statCap?: JobArticle["statCap"] }) {
  const guides = articleGuides(job, data.guides);
  const table = buildCalcTable({ job, from, to, data, gear, statCap });
  const names = new Map(data.monsters.map(monster => [monster.id, monster.n]));
  return {
    job: { id: job, name: jobOption(job)?.name ?? String(job) },
    range: { from, to },
    path: articlePath(job, from, to),
    eligible: articleEligible(job, from, to, data.guides),
    table,
    assumptionLines: assumptionLines(table),
    assumes: tableAssumes(table),
    train: guides.flatMap(guide =>
      guide.train
        .filter(row => overlaps(row, from, to))
        .map(row => ({
          guideJob: guide.job,
          from: row.from,
          to: row.to,
          kind: row.kind,
          map: row.map,
          name: row.name,
          mapName: row.map === null ? null : data.maps[String(row.map)]?.zh ?? null,
          mobs: row.mobs,
          mobNames: row.mobs.map(id => names.get(id) ?? String(id)),
          why: row.why,
          v: row.v,
          s: row.s,
        })),
    ),
    stat: guides.flatMap(guide => guide.stat),
    builds: guides.flatMap(guide => guide.builds),
    notes: guides.flatMap(guide => guide.notes),
    gaps: guides.flatMap(guide => guide.gaps.filter(row => overlaps(row, from, to))),
    notOpenYet: guides.flatMap(guide => guide.notOpenYet.filter(row => overlaps(row, from, to))),
    allowedSources: guideSources(job, data.guides),
  };
}

/** 表上每隻怪四個平均代號的寫法跟現在的值，寫手照抄改等級、武器 */
function statTokenLines(table: CalcTable, data: CalcData): string[] {
  const weapon = table.assumptions.weapon?.id;
  if (weapon === undefined) return ["武器查不到，算不出來"];
  try {
    characterWith(table.assumptions.weapon!.name, weapon, table.midLevel, table, data);
  } catch (error) {
    return [`${(error as Error).message}；代號的 #武器id 換成文字寫的那把`];
  }
  return table.rows.map(row => {
    const tail = `${row.id}@${table.midLevel}#${weapon}`;
    const shown = (kind: string, unit = "") => {
      const body = `${kind}:${tail}`;
      try {
        return `{{${body}}} = ${dataToken(`{{${body}}}`, body, table, data)?.text}${unit}`;
      } catch (error) {
        return `{{${body}}} 算不出來（${(error as Error).message}）`;
      }
    };
    return `${row.name}：${shown("avg", " 下")} | ${shown("oneShot")} | ${shown("killTime", " 秒")} | ${shown("xp10")}`;
  });
}

/** 文字用的平均代號裡，角色命中不到不 MISS 門檻的：下數沒算 MISS，這幾個是樂觀的（裝備上的命中沒算，實際可能其實夠） */
function missLines(article: JobArticle, table: CalcTable, data: CalcData): string[] {
  const out: string[] = [];
  for (const key of Object.keys(pinnedValues(article, table, data))) {
    const parts = /^(?:avg|oneShot|killTime|xp10):(\d+)@(\d+)#(\d+)(?:\*(\d+))?$/.exec(key);
    if (!parts) continue;
    try {
      const { have, need } = articleKillStats({ mobId: Number(parts[1]), level: Number(parts[2]), weaponId: Number(parts[3]), targets: parts[4] === undefined ? undefined : Number(parts[4]), table, data }).accuracy;
      if (have < need) out.push(`${key}：角色命中 ${have}，不 MISS 要 ${need}`);
    } catch {
      // 代號的錯防呆那段會報
    }
  }
  return out.length ? ["== 下數沒算 MISS，這幾個代號命中不夠（裝備上的命中沒算），文字要交代 ==", ...out, ""] : [];
}

/**
 * npm run article:show 印的東西：換完代號的整篇文字（玩家看到的順序）、表、假設、該貼的 assumes、防呆。
 * 代號換不掉不丟錯，那一格寫「代號錯」，寫手才看得到全部哪裡有問題。
 */
export function articleShowText({ job, from, to, article, data, openMaps }: { job: number; from: number; to: number; article: JobArticle; data: CalcData; openMaps?: Set<number> }): string {
  const table = buildCalcTable({ job, from, to, data, gear: article.gear, statCap: article.statCap });
  const fill = (text: string) => {
    try {
      return fillTokens(text, table, data);
    } catch (error) {
      return `【代號錯：${(error as Error).message}】`;
    }
  };
  const tagged = (line: ArticleLine) => `${fill(line.text)}（${TAG_LABEL[line.tag] ?? line.tag}）`;
  const mapName = (map: number) => data.maps[String(map)]?.zh ?? `地圖 ${map} 查不到`;
  const mobName = (id: number) => data.monsters.find(monster => monster.id === id)?.n ?? `怪 ${id} 查不到`;
  const heal = table.assumptions.targets !== null;
  const out: string[] = [
    `${jobOption(job)?.name ?? job} ${articleRangeLabel(from, to)}（${articlePath(job, from, to)}）`,
    `標題：${fill(article.title)}`,
    `描述：${fill(article.description)}`,
    `發布 ${article.published} / 更新 ${article.updated}`,
    `本篇寫手：${article.persona?.name}｜${article.persona?.line ? fill(article.persona.line) : ""}`,
    `主圖替代文字：${article.heroAlt ? fill(article.heroAlt) : ""}`,
    ...(article.statCap ? [`配點上限：${JSON.stringify(article.statCap)}`] : []),
    "",
    "== 先講結論 ==",
    ...article.answer.map((line, index) => `${index + 1}. ${line.alt ? "備案：" : ""}${tagged(line)}${line.go === undefined ? "" : ` ［帶我去${mapName(line.go)}］`}`),
    "",
    "== 開場 ==",
    fill(article.intro),
    "",
    "== 每個等級去哪裡 ==",
    ...article.steps.flatMap(step => [
      `${step.from}～${step.to} ${fill(step.title)}（${step.alt ? "備案・" : ""}${step.kind === "party" ? "組隊" : "單練"}）`,
      `  ${fill(step.text)}（${TAG_LABEL[step.tag] ?? step.tag}）`,
      `  怪：${step.mobs.map(mobName).join("、")}；帶我去${mapName(step.go ?? step.map)}`,
    ]),
    "",
    `== 幾下打死、打不打得中（${tableGearLine(table)}）==`,
    `怪 | ${withOneTargetCell(table, table.columns.map(column => `${column.targets ? `範圍 ${column.targets} 隻幾下` : heal ? `${column.skill.name}幾下` : "幾下打死"} Lv.${column.level}`), `打 1 隻幾下 Lv.${table.midLevel}`).join(" | ")} | 幾等不 MISS | 等級 | HP | 防禦 | 經驗`,
    ...table.rows.map(row => [row.name, ...withOneTargetCell(table, row.avgs.map(avgText), avgText(row.avgOne)), hitLvText(row, table), row.lv ?? "—", row.hp, row.def, row.exp].join(" | ")),
    "",
    "== 這張表的假設 ==",
    ...assumptionLines(table),
    "",
    ...article.sections.flatMap(section => [
      `== ${fill(section.heading)} ==`,
      ...(section.paragraphs ?? []).map(tagged),
      ...(section.items ?? []).map(line => `- ${tagged(line)}`),
      "",
    ]),
    "== 資料來源 ==",
    ...article.sources.map(source => `${fill(source.label)}：${source.url}`),
    "",
    ...missLines(article, table, data),
    "== 該貼進文章檔的 assumes ==",
    JSON.stringify(articleAssumes(article, table, data)),
    "",
    "== 防呆 ==",
  ];
  const errors = validateArticle(article, { job, from, to, data, openMaps });
  out.push(...(errors.length ? errors : ["全部通過"]));
  out.push("", `== 平均代號怎麼寫（表上的怪、Lv.${table.midLevel}、表上那把；等級、武器照文字改${heal ? "；打 1 隻加 *1" : ""}）==`, ...statTokenLines(table, data));
  return out.join("\n");
}
