/**
 * 職業×等級範圍攻略文（/jobs/<職業>/<起>-<迄>，v1.43）：哪些範圍能出、表怎麼算、文字代號、防呆。
 * 規格 docs/superpowers/specs/2026-11-04-job-articles-design.md（使用者拍板 1A 2A 3A 4A）；測試 __tests__/job-article.test.ts。
 * 數字一律由程式算（傷害計算機的預設角色＋computeGroup），文字裡用代號引用，資料更新就跟著變；文字本身存 src/data/job-articles/。
 * 這支建置時在伺服器跑：不能 import "use client" 的模組（拿到假值，等級上限會變 NaN），測試有掃。
 */
import { BASIC_ATTACK, HEAL, masterySkillFor } from "./damage-skills";
import { computeGroup, defaultState, HEAL_ASSUMPTION, type CalcData, type CalcState, type GroupConfig, type SharedConfig } from "./damage-view";
import { isMagicJob, type StatKey } from "./gear";
import { monsterSuitsJob, undeadOnlyStage } from "./job-rules";
import { jobOption, jobTier, previousJob } from "./jobs";
import { BOSS_SPAWN_MAX } from "./now-plan";
import { jobLineage } from "./planner";
import type { GuideJob, GuideTrain, Monster } from "./types";

/* ------------------------------------------------------------------ 文章檔的格式 */

/** 步驟的來源等級：台服回報、社群整理、舊版路線（跟攻略的 v 同一套） */
export type StepTag = "tw" | "community" | "legacy";
/** 一般主張多三種：站上計算、遊戲資料（客戶端的數值、技能說明）、官方公告 */
export type ClaimTag = StepTag | "calc" | "game" | "official";

export const TAG_LABEL: Record<ClaimTag, string> = { tw: "台服回報", community: "社群整理", legacy: "舊版路線", calc: "站上計算", game: "遊戲資料", official: "官方公告" };

export type ArticleLine = { text: string; tag: ClaimTag };
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
};
export type ArticleSection = { heading: string; paragraphs?: ArticleLine[]; items?: ArticleLine[] };
export type ArticleSource = { label: string; url: string };

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
};

export type JobArticle = {
  /** 不寫「經典版」：全站模板會補 */
  title: string;
  /** 150 字內 */
  description: string;
  /** 先講結論，2～4 條，每條都標來源等級 */
  answer: Array<{ text: string; tag: ClaimTag }>;
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

export const articlePath = (job: number, from: number, to: number) => `/jobs/${job}/${from}-${to}`;
export const articleRangeLabel = (from: number, to: number) => `${from}～${to} 等`;

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
  /** 範圍中段等級時約幾下打死（群體治癒是範圍 3 隻）；算不出來 null */
  hits: number | null;
  /** 群體治癒打 1 隻約幾下；別的技能 null */
  hitsOne: number | null;
  /** 從這一級到範圍結束都不 MISS；範圍最後一級還打不中是 null，畫面寫「超過 N 等」。武器固定用中段那把（假設行寫的那把） */
  hitLv: number | null;
};

export type CalcAssumptions = {
  level: number;
  /** 點法標籤（一般點法、全幸）；這個職業只有一套 null */
  tab: string | null;
  stats: Record<StatKey, number>;
  weapon: { id: number; name: string; type: string; power: number } | null;
  ammo: { id: number; name: string; atk: number } | null;
  skill: { id: number; name: string; level: number };
  /** 群體治癒範圍內幾隻；別的技能 null */
  targets: number | null;
  /** 中段等級時的角色命中 */
  accuracy: { kind: "physical" | "magic"; value: number };
  /** 傷害計算機對這一招、這把武器的提醒（炸彈箭怎麼算、沒點精準技能、武器還拿不到…），照原文列 */
  notes: string[];
};

export type CalcTable = { job: number; from: number; to: number; midLevel: number; rows: CalcRow[]; assumptions: CalcAssumptions };

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

/** 表用哪一招：跟傷害計算機的預設同一招（讀者按表下面的連結看到同一個數字）；僧侶 31～70 例外固定群體治癒 */
function tableSkill(job: number, level: number, state: CalcState): { skillId: number; skillLevel: number } {
  const group = state.groups[0];
  if (undeadOnlyStage(job, level) && (group.levels[HEAL] ?? 0) > 0) return { skillId: HEAL, skillLevel: group.levels[HEAL] };
  return { skillId: state.shared.skillId, skillLevel: state.shared.skillLevel };
}

/** 練功目標：地圖上有刷怪資料、而且不是整張圖最多幾隻的王（跟傷害計算機、練功排行同一條 BOSS_SPAWN_MAX） */
function isFarmTarget(monster: Monster): boolean {
  const counts = (monster.sp ?? []).map(([, count]) => count);
  return counts.length > 0 && Math.max(...counts) > BOSS_SPAWN_MAX;
}

const finiteOrNull = (value: number | undefined) => (value !== undefined && Number.isFinite(value) ? value : null);

/** 範圍內 guide.train 列的怪（去重、地圖是 null 的列不算），每隻算幾下打死、幾等不 MISS，順便回傳算表用的假設 */
export function buildCalcTable({ job, from, to, data }: { job: number; from: number; to: number; data: CalcData }): CalcTable {
  const midLevel = Math.floor((from + to) / 2);
  const state = stateAt(data, job, midLevel);
  const group = state.groups[0];
  const skill = tableSkill(job, midLevel, state);
  const heal = skill.skillId === HEAL;
  const magic = isMagicJob(job);
  const shared = (monster: Monster, targets?: number): SharedConfig => ({ job, ...skill, monsterId: monster.id, ...(targets === undefined ? {} : { targets }) });
  const killsWith = (monster: Monster, targets?: number) => {
    const result = computeGroup(data, shared(monster, targets), group, monster);
    return result.ok ? finiteOrNull(result.vs?.kills.avg) : null;
  };
  // 預設角色每級會換武器，命中被動跟著跳（狂戰士斧頭 50、劍 69）：固定用中段那把算，才對得上假設行
  const hitsAt = (monster: Monster, level: number): boolean => {
    const levelGroup = { ...stateAt(data, job, level).groups[0], weaponId: group.weaponId, weaponAtk: group.weaponAtk, ammoId: group.ammoId };
    const result = computeGroup(data, shared(monster, heal ? HEAL_TABLE_TARGETS : undefined), levelGroup, monster);
    return Boolean(result.ok && result.vs && characterAccuracy(data, job, levelGroup).value >= result.vs.accuracy);
  };
  // 從範圍最後一級往回找：要一路達標到範圍結束才算，中間達標、後面又掉回去不算
  const firstHitLevel = (monster: Monster): number | null => {
    if (!hitsAt(monster, to)) return null;
    let level = to;
    while (level > from && hitsAt(monster, level - 1)) level--;
    return level;
  };

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
        hits: killsWith(monster, heal ? HEAL_TABLE_TARGETS : undefined),
        hitsOne: heal ? killsWith(monster, 1) : null,
        hitLv: firstHitLevel(monster),
      }),
    );

  const weapon = data.gear.weapons.find(entry => entry.id === group.weaponId);
  const ammo = (data.gear.ammo ?? []).find(entry => entry.id === group.ammoId);
  const dummy = computeGroup(data, { job, ...skill, monsterId: null }, group, null);
  return {
    job,
    from,
    to,
    midLevel,
    rows,
    assumptions: {
      level: midLevel,
      tab: group.tab,
      stats: { ...group.stats },
      weapon: weapon ? { id: weapon.id, name: weapon.n, type: weapon.s, power: (magic ? weapon.mag : weapon.atk) ?? 0 } : null,
      ammo: ammo ? { id: ammo.id, name: ammo.n, atk: ammo.atk } : null,
      skill: { id: skill.skillId, name: skillNameOf(data, skill.skillId), level: skill.skillLevel },
      targets: heal ? HEAL_TABLE_TARGETS : null,
      accuracy: characterAccuracy(data, job, group),
      notes: [...(heal ? [HEAL_ASSUMPTION] : []), ...(dummy.ok ? [...dummy.warnings, ...dummy.notes] : [dummy.reason])],
    },
  };
}

/** 表上「幾等不 MISS」那格 */
export function hitLvText(row: Pick<CalcRow, "hitLv">, table: Pick<CalcTable, "to">): string {
  return row.hitLv === null ? `超過 ${table.to} 等` : String(row.hitLv);
}

/** 算表用的假設，一條一行；畫面跟給寫手看的都用這幾行，不另外編 */
export function assumptionLines(table: CalcTable): string[] {
  const { assumptions: a } = table;
  const magic = a.accuracy.kind === "magic";
  const stats = `Lv.${a.level}：力量 ${a.stats.STR}、敏捷 ${a.stats.DEX}、智力 ${a.stats.INT}、幸運 ${a.stats.LUK}${a.tab ? `（${a.tab}）` : ""}`;
  const weapon = a.weapon ? `武器：${a.weapon.name}（${a.weapon.type}，${magic ? "魔攻" : "攻擊"} ${a.weapon.power}），沒衝卷${a.ammo ? `；彈藥：${a.ammo.name}（攻擊 ${a.ammo.atk}）` : ""}；其他裝備的攻擊、增益技能沒算` : "武器：查不到";
  const skill = `技能：${a.skill.name} ${a.skill.level} 級${a.targets ? `；另一欄是範圍內 ${a.targets} 隻（怪越多每隻分到越少）` : ""}`;
  const accuracy = magic
    ? `命中：魔法命中＝智力÷10＋幸運÷10（Lv.${a.level} 是 ${a.accuracy.value}），裝備上的智力、幸運沒算，實際會更早打得中`
    : `命中：敏捷×0.8＋幸運×0.5＋命中被動（Lv.${a.level} 是 ${a.accuracy.value}，${a.weapon?.name ?? "武器"}整段都用這把算），裝備上的命中沒算，實際會更早打得中`;
  return [stats, weapon, skill, accuracy, ...a.notes];
}

/* ------------------------------------------------------------------ 文字代號 */

const TOKEN = /\{\{(.*?)\}\}/g;

/**
 * {{hits:怪物id}}、{{hitLv:怪物id}}、{{def:怪物id}} 換成算出來的數字；打不中的 hitLv 換成「超過 N」（後面接「等」）。
 * {{mob:怪名}}、{{mobs:怪名的一部分}} 換成字本身，名字查不查得到由 validateArticle 擋。換不掉就丟錯，不留原文。
 */
export function fillTokens(text: string, table: CalcTable): string {
  const filled = text.replace(TOKEN, (raw, body: string) => {
    const name = /^mobs?:(.+)$/.exec(body);
    if (name) return name[1];
    const match = /^(hits|hitLv|def):(\d+)$/.exec(body);
    if (!match) throw new Error(`認不得的代號 ${raw}（只有 hits、hitLv、def、mob、mobs）`);
    const row = table.rows.find(entry => entry.id === Number(match[2]));
    if (!row) throw new Error(`代號 ${raw} 指到計算表沒有的怪 ${match[2]}（表上：${table.rows.map(entry => entry.name).join("、")}）`);
    if (match[1] === "def") return String(row.def);
    if (match[1] === "hitLv") return row.hitLv === null ? `超過 ${table.to}` : String(row.hitLv);
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
export function resolveArticle(article: JobArticle, table: CalcTable): JobArticle {
  return mapStrings(article, text => fillTokens(text, table));
}

/* ------------------------------------------------------------------ 防呆 */

/** 模板會補經典版、Google 只顯示約 150 字 */
const DESCRIPTION_MAX = 150;
/** Google 標題大約顯示 30 字：模板接在後面的「｜楓之谷經典版」要落在裡面（估算） */
const TITLE_MAX = 23;
const EMOJI = /[\u2300-\u23FF\u25A0-\u25FF\u2600-\u27BF]|[\u{1F300}-\u{10FFFF}]/u;
const STEP_TAGS: readonly string[] = ["tw", "community", "legacy"];
const CLAIM_TAGS: readonly string[] = [...STEP_TAGS, "calc", "game", "official"];

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

  const zh = typeof step.map === "number" ? data.maps[String(step.map)]?.zh : undefined;
  if (!zh) errors.push(`${where}：地圖 ${String(step.map)} 沒有中文名`);
  else {
    const guides = articleGuides(job, data.guides);
    if (!guides.some(guide => guide.train.some(row => row.map === step.map))) errors.push(`${where}：${zh}不在這個職業攻略的練功段`);
    const closed = ctx.openMaps && !ctx.openMaps.has(step.map as number);
    const stepRange = { from: Number(step.from), to: Number(step.to) };
    const stale = guides.some(guide => guide.notOpenYet.some(row => overlaps(row, stepRange.from, stepRange.to) && row.place.includes(zh)));
    if (closed || stale) errors.push(`${where}：${zh}尚未開放，不能當推薦`);
  }

  const mobs = Array.isArray(step.mobs) ? (step.mobs as unknown[]) : [];
  if (!mobs.length) errors.push(`${where}：mobs 至少一隻`);
  const byId = new Map(data.monsters.map(monster => [monster.id, monster]));
  for (const id of mobs) {
    const monster = byId.get(id as number);
    if (!monster || monster.un) errors.push(`${where}：怪 ${String(id)} 不在怪物資料裡`);
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

const PREMISES: Array<[Exclude<keyof ArticleAssumes, "hits" | "hitLv">, string]> = [
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

/** 一篇文章的所有防呆，回傳錯誤（空陣列＝過）；欄位缺、型別錯也回錯誤，不丟例外 */
export function validateArticle(article: unknown, ctx: ArticleContext): string[] {
  if (!isRecord(article)) return ["文章要是物件"];
  const { job, from, to, data } = ctx;
  const errors: string[] = [];

  if (!articleEligible(job, from, to, data.guides)) errors.push(`${job}-${from}-${to}：這個範圍沒過門檻（至少 2 張非舊版來源、有地圖的練功圖）`);

  if (!isText(article.title)) errors.push("要有 title");
  else if (article.title.includes("經典版")) errors.push("title 不寫「經典版」，模板會補");
  if (!isText(article.intro)) errors.push("要有 intro");

  let table: CalcTable | null = null;
  try {
    table = buildCalcTable({ job, from, to, data });
  } catch (error) {
    errors.push(`計算表算不出來：${(error as Error).message}`);
  }

  if (isText(article.title)) {
    let length = article.title.length;
    try {
      if (table) length = fillTokens(article.title, table).length;
    } catch {
      // 代號的錯下面會一起報
    }
    if (length > TITLE_MAX) errors.push(`title 要 ${TITLE_MAX} 字內（現在 ${length}）：模板的「楓之谷經典版」才不會被截掉`);
  }

  if (table) checkAssumes(article.assumes, table, data, errors);

  if (!isText(article.description)) errors.push("要有 description");
  else {
    let length = article.description.length;
    try {
      if (table) length = fillTokens(article.description, table).length;
    } catch {
      // 代號的錯下面會一起報
    }
    if (length > DESCRIPTION_MAX) errors.push(`description 要 ${DESCRIPTION_MAX} 字內（現在 ${length}）`);
  }

  if (!Array.isArray(article.answer) || article.answer.length < 2 || article.answer.length > 4) errors.push("answer 要 2～4 條");
  else {
    checkLines(article.answer, "answer", errors);
  }

  if (!Array.isArray(article.steps) || !article.steps.length) errors.push("steps 要是陣列、至少一步");
  else {
    article.steps.forEach((step, index) => checkStep(step, index, ctx, errors));
    if (article.steps.every(step => isRecord(step) && step.alt === true)) errors.push("steps 至少要有一步主推（全部標 alt 不行）");
  }

  if (!Array.isArray(article.sections)) errors.push("sections 要是陣列（沒有就給空陣列）");
  else {
    article.sections.forEach((section, index) => {
      if (!isRecord(section) || !isText(section.heading)) errors.push(`sections[${index}]：要有 heading`);
      else {
        checkLines(section.paragraphs, `sections[${index}].paragraphs`, errors);
        checkLines(section.items, `sections[${index}].items`, errors);
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
  for (const { where, text } of strings) {
    if (EMOJI.test(text)) errors.push(`${where}：不准有 emoji`);
    if (table) {
      try {
        fillTokens(text, table);
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
export function writerBrief({ job, from, to, data }: { job: number; from: number; to: number; data: CalcData }) {
  const guides = articleGuides(job, data.guides);
  const table = buildCalcTable({ job, from, to, data });
  const names = new Map(data.monsters.map(monster => [monster.id, monster.n]));
  return {
    job: { id: job, name: jobOption(job)?.name ?? String(job) },
    range: { from, to },
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
