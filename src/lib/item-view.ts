import { equipStatLabel, equipStatValue } from "./format";
import { baseJob, jobOption } from "./jobs";
import type { Item, Profile } from "./types";

/** 「穿戴條件」那一組，照遊戲說明框的順序：等級、職業、力敏智幸 */
const REQUIREMENT_KEYS = ["reqLevel", "reqJob", "reqSTR", "reqDEX", "reqINT", "reqLUK"];

/**
 * 這個職業能不能用：reqJob 跟 format.ts 的需求職業是同一套位元（1 劍士、2 法師、4 弓箭手、8 盜賊、16 海盜），
 * 職業代碼的百位數就是第幾個位元（100 劍士 → 1、200 法師 → 2…）。
 * 沒寫或 0 誰都能用；-1 只有初心者（職業 0）能用；初心者不能用有職業限制的。認不得的值回 null，不猜。
 */
export function canJobUse(reqJob: number | undefined, job: number): boolean | null {
  if (!reqJob) return true;
  if (reqJob === -1) return job === 0;
  if (!isKnownReqJob(reqJob)) return null;
  if (job === 0) return false;
  if (!jobOption(job)) return null;
  return (reqJob & (1 << (baseJob(job) / 100 - 1))) !== 0;
}

/** 認得的需求職業值：-1（只限初心者）、0（不限）、1～31（五個職業系的位元組合） */
function isKnownReqJob(reqJob: number): boolean {
  return reqJob === -1 || (reqJob >= 0 && reqJob < 32);
}

/** 職業代碼的稱呼：0 是初心者，其他照職業選單的名字；認不得的回 null */
export function jobLabel(job: number): string | null {
  if (job === 0) return "初心者";
  return jobOption(job)?.name ?? null;
}

/** 這件道具寫的需求職業：沒寫是 undefined，資料怪掉（不是數字）回 null */
function reqJobOf(item: Item): number | undefined | null {
  const value = item.eq?.reqJob;
  return value === undefined || typeof value === "number" ? value : null;
}

/** 篩選「只看我的職業能用的裝備」：只算「裝備」分類而且有數值的，認不得的職業值不算 */
export function usableBy(item: Item, job: number): boolean {
  if (item.c !== "裝備" || !item.eq) return false;
  const reqJob = reqJobOf(item);
  return reqJob !== null && canJobUse(reqJob, job) === true;
}

export type WearFit = { tone: "sky" | "gold" | "maple"; text: string };

/**
 * 穿戴條件旁的小標籤：對照角色列的職業和等級（藍：能用、金：還差幾級、紅：職業不能用）。
 * 力量這類能力值網站不知道，不判斷；時裝、消耗品這些不是「裝備」的不顯示。
 * （job-rules.ts 的 jobFit 是「練功圖適不適合這個職業」，跟這個無關。）
 */
export function wearFit(item: Item, profile: Profile): WearFit | null {
  if (item.c !== "裝備" || !item.eq || profile.job < 0 || profile.level <= 0) return null;
  const name = jobLabel(profile.job);
  const reqJob = reqJobOf(item);
  if (!name || reqJob === null) return null;
  const usable = canJobUse(reqJob, profile.job);
  if (usable === null) return null;
  if (!usable) return { tone: "maple", text: `${name}不能用` };
  const short = Number(item.eq.reqLevel ?? 0) - profile.level;
  return short > 0 ? { tone: "gold", text: `${name}還差 ${short} 級` } : { tone: "sky", text: `${name}能用` };
}

export type StatRow = [string, string];

/** 武器的「裝備數值」先排攻擊力、攻擊速度：挑武器時這兩個一起看。其他照資料順序（就是遊戲說明框的順序）。 */
const WEAPON_LEAD_KEYS = ["incPAD", "attackSpeed"];

/**
 * 「佔兩格」只寫真的那一類：套服（105 開頭）、雙手武器（140–149 開頭的雙手劍／斧／棍、弓、弩）。
 * 有 91 件 104 開頭的上衣（多半是時裝）跟 61 件 170 開頭的武器外觀，資料也標 MaPn／WpSi，
 * 但遊戲把它們分在上衣、武器外觀，標題也這樣寫；穿了會不會真的佔兩格查不到，寫了只會跟標題打架，所以不寫。
 */
function showsSlot(item: Item, islot: string): boolean {
  const kind = Math.floor(item.id / 10000);
  if (islot === "MaPn") return kind === 105;
  if (islot === "WpSi") return kind >= 140 && kind < 150;
  return true;
}

/** 一格數值；equipStatValue 回 null（只佔一格的裝備欄位，標題已經寫了）就不給這格 */
function statRows(key: string, value: number | string): StatRow[] {
  const text = equipStatValue(key, value);
  return text === null ? [] : [[equipStatLabel(key), text]];
}

/**
 * 道具卡的數值拆兩組：「穿戴條件」（等級、職業、力敏智幸，固定順序）跟「裝備數值」。
 * 「裝備數值」照資料順序；武器（有攻擊速度）把攻擊力、攻擊速度提到最前面。
 * 「裝備」沒寫職業限制就補一格「不限職業」，玩家才知道誰都能用；時裝不補。
 */
export function equipGroups(item: Item): { requirements: StatRow[]; stats: StatRow[] } {
  const eq = item.eq;
  if (!eq) return { requirements: [], stats: [] };
  const requirements: StatRow[] = [];
  for (const key of REQUIREMENT_KEYS) {
    const value = key === "reqJob" && eq.reqJob === undefined && item.c === "裝備" ? 0 : eq[key];
    if (value !== undefined) requirements.push(...statRows(key, value));
  }
  const lead = eq.attackSpeed === undefined ? [] : WEAPON_LEAD_KEYS.filter(key => eq[key] !== undefined);
  const rest = Object.keys(eq).filter(key => !REQUIREMENT_KEYS.includes(key) && !lead.includes(key));
  const stats = [...lead, ...rest]
    .filter(key => key !== "islot" || showsSlot(item, String(eq.islot)))
    .flatMap(key => statRows(key, eq[key]));
  return { requirements, stats };
}

/** 道具清單的分類順序：新手最常找的裝備在前，時裝最後；沒列到的分類排在最後 */
const CATEGORY_ORDER = ["裝備", "消耗", "其他", "裝飾", "現金", "時裝"];

function categoryRank(category: string): number {
  const rank = CATEGORY_ORDER.indexOf(category);
  return rank < 0 ? CATEGORY_ORDER.length : rank;
}

/**
 * 道具清單的預設排序：裝備在最前面、依需求等級由低到高，沒寫等級的（多半是勳章、活動道具）排在裝備最後；
 * 其他分類照 CATEGORY_ORDER。同一組回 0，靠穩定排序維持資料原本的順序（依名稱）。
 */
export function compareItems(a: Item, b: Item): number {
  const byCategory = categoryRank(a.c) - categoryRank(b.c);
  if (byCategory || a.c !== "裝備") return byCategory;
  const levelA = Number(a.eq?.reqLevel ?? 0) || Infinity;
  const levelB = Number(b.eq?.reqLevel ?? 0) || Infinity;
  return levelA === levelB ? 0 : levelA - levelB;
}

/** 分類下拉跟清單用同一個順序 */
export function sortCategories(categories: string[]): string[] {
  return [...categories].sort((a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b));
}

/**
 * 搜尋時額外比對的字：說明、種類（短刀）、需求職業（劍士、盜賊）。
 * 沒有職業限制的不放職業名，免得搜「劍士」被全職業裝備洗版（要看全部能用的，用「只看我能用的」篩選）。
 */
export function itemKeywords(item: Item): string {
  const reqJob = reqJobOf(item);
  // 認不得的值 equipStatValue 會照原數字寫，那個數字對搜尋沒意義，不放
  const jobs = typeof reqJob === "number" && reqJob !== 0 && isKnownReqJob(reqJob) ? equipStatValue("reqJob", reqJob) : "";
  return [item.d, item.s, jobs].filter(Boolean).join(" ");
}

/** 種類下拉：這個分類裡有的種類，件數多的排前面 */
export function subcategoryOptions(items: Item[], category: string): string[] {
  const counts = new Map<string, number>();
  for (const item of items) if (item.c === category && item.s) counts.set(item.s, (counts.get(item.s) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
}
