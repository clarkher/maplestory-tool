import { attackSpeedLabel, equipStatLabel, equipStatValue, formatNumber } from "./format";
import { baseJob, jobOption } from "./jobs";
import type { Item, Profile, ShopRow } from "./types";

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

/** 篩選「現在就能穿的」：職業能用、而且需求等級到了（沒寫等級的算到了）；沒填等級就不判斷 */
export function wearableNow(item: Item, profile: Profile): boolean {
  if (profile.level <= 0 || !usableBy(item, profile.job)) return false;
  return Number(item.eq?.reqLevel ?? 0) <= profile.level;
}

/** 拿得到：有怪掉、有任務給，或已開放的地方有店賣（sp 只收已開放地點，見 pipeline/lib/shops.mjs） */
function hasSource(item: Item): boolean {
  return Boolean(item.dm?.length || item.qr?.length || item.sp?.length);
}

/**
 * 清單不列：分類、種類都寫「裝備」而且拿不到的。
 * 遊戲資料把認不得種類的裝備都歸成「裝備」，2026-10-07 查有 38 件、全都沒有來源：
 * 24 件影武者的刀、12 件龍魔導士的龍裝備（經典版沒有這兩個職業，資料卻寫盜賊、法師能用）、2 件虎爪。
 * 以後哪件有了來源就會自動列回來。網址直接打開照樣看得到細節。
 */
export function hiddenFromList(item: Item): boolean {
  return item.c === "裝備" && item.s === "裝備" && !hasSource(item);
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
  if (byCategory) return byCategory;
  if (a.c === "裝備") {
    const levelA = Number(a.eq?.reqLevel ?? 0) || Infinity;
    const levelB = Number(b.eq?.reqLevel ?? 0) || Infinity;
    if (levelA !== levelB) return levelA - levelB;
  }
  // 同一個等級（沒有等級的分類就是整類）裡，拿得到的排前面，其餘維持原本順序
  return Number(hasSource(b)) - Number(hasSource(a));
}

/** 分類下拉跟清單用同一個順序 */
export function sortCategories(categories: string[]): string[] {
  return [...categories].sort((a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b));
}

/**
 * 搜尋時額外比對的字：說明、種類（短刀）、需求職業（劍士、盜賊）。
 * 沒有職業限制的不放職業名，免得搜「劍士」被全職業裝備洗版（要看全部能用的，用「只看我能用的」篩選）；
 * 時裝也不放（「劍士一、二轉技能效果」這類不是玩家搜職業時要找的）。
 */
export function itemKeywords(item: Item): string {
  const reqJob = item.c === "裝備" ? reqJobOf(item) : undefined;
  // 認不得的值 equipStatValue 會照原數字寫，那個數字對搜尋沒意義，不放
  const jobs = typeof reqJob === "number" && reqJob !== 0 && isKnownReqJob(reqJob) ? equipStatValue("reqJob", reqJob) : "";
  return [item.d, item.s, jobs].filter(Boolean).join(" ");
}

/** 搜尋字是職業系或初心者的話，回它在需求職業裡的位元（初心者是 -1）；其他字回 null */
const JOB_SEARCH_BITS: Record<string, number> = { 劍士: 1, 法師: 2, 弓箭手: 4, 盜賊: 8, 海盜: 16, 初心者: -1 };

export function jobSearchBit(keyword: string): number | null {
  return JOB_SEARCH_BITS[keyword.trim()] ?? null;
}

/**
 * 搜職業名時排最前面的：「裝備」分類裡需求職業寫了這個職業系的（劍士＋盜賊的短刀，搜劍士、搜盜賊都算）；
 * 初心者只算初心者專用的（-1）。沒有職業限制的、時裝不算，跟搜尋關鍵字同一套規則。
 */
export function fitsJobSearch(item: Item, bit: number): boolean {
  if (item.c !== "裝備") return false;
  const reqJob = reqJobOf(item);
  if (typeof reqJob !== "number") return false;
  if (bit === -1) return reqJob === -1;
  return reqJob > 0 && isKnownReqJob(reqJob) && (reqJob & bit) !== 0;
}

/** 道具清單右邊的小字：需求等級（清單依等級排，放最前面）、種類（沒有種類寫分類）、武器的攻擊速度。認不得的攻擊速度不寫。 */
export function itemNote(item: Item): string {
  const level = Number(item.eq?.reqLevel ?? 0);
  const speed = item.eq?.attackSpeed;
  const label = typeof speed === "number" ? attackSpeedLabel(speed) : null;
  return [level > 0 ? `Lv.${level}` : null, item.s || item.c, label].filter(Boolean).join(" · ");
}

/** 種類下拉：這個分類裡有的種類，件數多的排前面 */
export function subcategoryOptions(items: Item[], category: string): string[] {
  const counts = new Map<string, number>();
  for (const item of items) if (item.c === category && item.s) counts.set(item.s, (counts.get(item.s) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
}

/**
 * 裝備的種類分組看道具編號前四碼（道具編號 ÷ 10000），不看種類名稱——種類的寫法之後可能改成遊戲用字。
 * 武器 130–149（單手劍、短刀、槍、弓、指虎、火槍…）；防具：帽子 100、上衣 104、套服 105、褲裙 106、鞋子 107、
 * 手套 108、盾牌 109、披風 110；飾品：臉飾 101、眼飾 102、耳環 103、戒指 111、墜飾 112、腰帶 113、勳章 114；其餘（騎寵等）歸其他。
 */
function equipGroupOf(id: number): string {
  const kind = Math.floor(id / 10000);
  if (kind >= 130 && kind < 150) return "武器";
  if ([100, 104, 105, 106, 107, 108, 109, 110].includes(kind)) return "防具";
  if ([101, 102, 103, 111, 112, 113, 114].includes(kind)) return "飾品";
  return "其他";
}

const EQUIP_GROUPS = ["武器", "防具", "飾品", "其他"];

/** 種類下拉分組：裝備分成武器、防具、飾品、其他（空的組不列，組裡照 subcategoryOptions 的順序）；其他分類不分組（label 是 null） */
export function subcategoryGroups(items: Item[], category: string): Array<{ label: string | null; options: string[] }> {
  const options = subcategoryOptions(items, category);
  if (category !== "裝備") return options.length ? [{ label: null, options }] : [];
  const groupOf = new Map<string, string>();
  for (const item of items) if (item.c === category && item.s && !groupOf.has(item.s)) groupOf.set(item.s, equipGroupOf(item.id));
  return EQUIP_GROUPS
    .map(label => ({ label, options: options.filter(name => groupOf.get(name) === label) }))
    .filter(group => group.options.length > 0);
}

/** later：這家店的地點 10/15 才開放（畫面標「10/15 開放」） */
export type ShopPlace = { place: string; npc?: string; later: boolean };
export type ShopGroup = { price: string; places: ShopPlace[] };

/** 標價寫法：楓幣、商城的樂豆點（客戶端「{0}楓幣」「{0}個{1}樂豆點」）；整組賣的寫「10 個 1,980 樂豆點」，件數也加千分位 */
function shopPriceText(row: ShopRow): string {
  const amount = `${formatNumber(row.pr)} ${row.c ? "樂豆點" : "楓幣"}`;
  return row.k ? `${formatNumber(row.k)} 個 ${amount}` : amount;
}

/**
 * 「哪裡買得到」：同一個標價的店家排在一起，價錢只寫一次（一般道具每家都賣一樣的價錢）。
 * opensLater 判斷店的地點是不是 10/15 才開放（呼叫端用 maps.json 跟現在日期判斷）；這種店排在同一組最後——
 * 紅色藥水這類到處都賣的，玩家現在要買，先看到現在去得了的地方。其餘照資料順序。
 * 價錢組本身也一樣：整組地點都是 10/15 才開的（例：冷酷之心 75,000 楓幣只有天空之城賣）排在現在就買得到的價錢組後面，
 * 免得玩家先看到買不到的價錢。其餘價錢組維持資料順序。
 * fromOldData：有任何一家取自舊版資料，畫面要標「參考舊版資料，可能有出入」。
 */
export function shopGroups(
  item: Item,
  opensLater: (mapId: number) => boolean = () => false,
): { groups: ShopGroup[]; fromOldData: boolean } {
  const groups: ShopGroup[] = [];
  for (const row of item.sp ?? []) {
    const price = shopPriceText(row);
    let group = groups.find(entry => entry.price === price);
    if (!group) {
      group = { price, places: [] };
      groups.push(group);
    }
    group.places.push({ place: row.p, npc: row.n, later: row.m !== undefined && opensLater(row.m) });
  }
  // sort 是穩定排序：later 一樣的維持資料順序
  for (const group of groups) group.places.sort((a, b) => Number(a.later) - Number(b.later));
  const allLater = (group: ShopGroup) => group.places.every(place => place.later);
  groups.sort((a, b) => Number(allLater(a)) - Number(allLater(b)));
  return { groups, fromOldData: (item.sp ?? []).some(row => row.o === 1) };
}
