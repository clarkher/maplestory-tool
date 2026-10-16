/**
 * 楓幣匯率頁共用的資料：讀資料、單位換算、均線、漲跌、價位分布、更新時間。
 * 數字全是執行時讀到的真資料，沒有任何寫死的數字。
 */

const BASE = "https://raw.githubusercontent.com/clarkher/maplestory-tool/fx-data/fx/scania";

export type Day = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  closeMesoPerNtd: number;
  listings: number | null;
  samples: number;
  /** ref＝只有參考站的資料、manual＝全是手動補的、mixed＝混著（舊資料可能沒有） */
  source: "ref" | "manual" | "mixed" | string;
};

export type Daily = { server: string; unit: string; source: string; updatedAt: string; days: Day[] };
/** src：manual＝人手動補的一筆（沒有掛單數與價位分布）；沒有這欄（舊資料）或 ref＝參考站 */
export type Latest = { t: string; fetchedAt: string; ask100: number; listings: number | null; ladder: [number, number][]; src?: "ref" | "manual" };
export type FxData = { daily: Daily; latest: Latest };

const isNum = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function checkDaily(raw: unknown): Daily {
  const daily = raw as Daily;
  if (!daily || !Array.isArray(daily.days)) throw new Error("daily 格式不對");
  const days = daily.days.filter(day => isNum(day.open) && isNum(day.high) && isNum(day.low) && isNum(day.close) && /^\d{4}-\d{2}-\d{2}$/.test(day.date));
  if (!days.length) throw new Error("daily 沒有資料");
  return { ...daily, days };
}

function checkLatest(raw: unknown): Latest {
  const latest = raw as Latest;
  if (!latest || !isNum(latest.ask100) || latest.ask100 <= 0 || !Number.isFinite(Date.parse(latest.t))) throw new Error("latest 格式不對");
  return { ...latest, ladder: Array.isArray(latest.ladder) ? latest.ladder.filter(row => isNum(row[0]) && isNum(row[1]) && row[1] > 0) : [] };
}

/** 讀不到就丟錯，頁面照實說讀不到，不放示範資料。`broken` 只給驗收看錯誤畫面用。 */
export async function loadFx(broken = false): Promise<FxData> {
  const base = broken ? `${BASE}-missing` : BASE;
  const [dailyRes, latestRes] = await Promise.all([fetch(`${base}/daily.json`), fetch(`${base}/latest.json`)]);
  if (!dailyRes.ok || !latestRes.ok) throw new Error(`HTTP ${dailyRes.status}/${latestRes.status}`);
  return { daily: checkDaily(await dailyRes.json()), latest: checkLatest(await latestRes.json()) };
}

// ---------- 換算 ----------

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;

/** 每 100 元換幾萬 → 1 億楓幣幾元 */
export const perYi = (ask100: number) => round1(1_000_000 / ask100);
/** 1 億楓幣幾元 → 1 元換幾萬 */
export const wanPerNtd = (yuanPerYi: number) => round2(10_000 / yuanPerYi);

export const fmtYuan = (value: number) => Math.round(value).toLocaleString("zh-TW");
export const fmtWan = (value: number) => value.toFixed(2);
export const fmtPct = (value: number) => `${Math.abs(value).toFixed(2)}%`;

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
export function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { md: `${m}/${String(d).padStart(2, "0")}`, week: WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
}

export const taipeiDate = (iso: string) => new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(0, 10);
const taipeiClock = (iso: string) => new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(11, 16);

// ---------- 均線 ----------

export function movingAverage(days: Day[], span: number): (number | null)[] {
  return days.map((_, index) => {
    if (index + 1 < span) return null;
    const slice = days.slice(index + 1 - span, index + 1);
    return round1(slice.reduce((sum, day) => sum + day.close, 0) / span);
  });
}

/** 20 日線還要幾天：20 －目前天數（夠了回 0） */
export const daysUntil = (days: Day[], span: number) => Math.max(0, span - days.length);

// ---------- 現在的報價與漲跌 ----------

export type Direction = "up" | "down" | "flat";

export type Quote = {
  yuan: number; // 1 億楓幣幾元（現在）
  wan: number; // 1 元換幾萬（現在）
  ask100: number;
  prev: Day | null; // 前一天收盤
  diffYuan: number; // 整數元
  pct: number;
  dir: Direction; // 楓幣的方向：up＝1 億楓幣值更多台幣
};

export function quoteOf({ daily, latest }: FxData): Quote {
  const yuan = perYi(latest.ask100);
  const wan = round2(latest.ask100 / 100);
  const today = taipeiDate(latest.t);
  const prev = daily.days.filter(day => day.date < today).at(-1) ?? null;
  const diffYuan = prev ? Math.round(yuan - prev.close) : 0;
  const pct = prev ? ((yuan - prev.close) / prev.close) * 100 : 0;
  const dir: Direction = diffYuan > 0 ? "up" : diffYuan < 0 ? "down" : "flat";
  return { yuan, wan, ask100: latest.ask100, prev, diffYuan, pct, dir };
}

/** 一天的 K 棒顏色：收比開高＝漲（紅），低＝跌（綠），收盤跟開盤一樣＝平（K 棒全部實心，靠顏色與文字分） */
export function candleDir(day: Day): Direction {
  const diff = round1(day.close - day.open);
  return diff > 0 ? "up" : diff < 0 ? "down" : "flat";
}

/** 這天收盤跟前一天收盤比 */
export function dayChange(days: Day[], index: number): { diff: number; pct: number; dir: Direction } | null {
  if (index <= 0) return null;
  const prev = days[index - 1].close;
  const diff = Math.round(days[index].close - prev);
  return { diff, pct: ((days[index].close - prev) / prev) * 100, dir: diff > 0 ? "up" : diff < 0 ? "down" : "flat" };
}

// ---------- 更新時間 ----------

export type Freshness = { text: string; stale: boolean; hours: number; at: string };

export function freshnessOf(latest: Latest, now = Date.now()): Freshness {
  const minutes = Math.max(0, Math.floor((now - Date.parse(latest.t)) / 60_000));
  const hours = Math.floor(minutes / 60);
  const { md } = dayLabel(taipeiDate(latest.t));
  const at = `${md} ${taipeiClock(latest.t)}`;
  if (hours >= 12) return { text: `已經 ${hours >= 48 ? `${Math.floor(hours / 24)} 天` : `${hours} 小時`}沒更新（最後一筆 ${at}）`, stale: true, hours, at };
  const ago = minutes < 1 ? "剛剛" : minutes < 60 ? `${minutes} 分鐘前` : `${hours} 小時前`;
  return { text: `最後更新 ${ago}`, stale: false, hours, at };
}

// ---------- 手動補一筆 ----------

/** 最新一筆是人手動補的（參考站停更時） */
export const isManualLatest = (latest: Latest) => latest.src === "manual";

/** 那天的資料含手動補的（全是手動或混著） */
export const hasManualInput = (day: Day) => day.source === "manual" || day.source === "mixed";

/** 沒有價位分布時委賣檔位那張卡要說的話；有價位分布回 null */
export function ladderNote(latest: Latest): string | null {
  if (latest.ladder.length) return null;
  return isManualLatest(latest) ? "這一筆是手動輸入，沒有掛單價位" : "這次沒有拿到掛單價位";
}

// ---------- 價位分布 ----------

export const BUCKET = 10;

export type LadderRow = {
  lo: number; // 100 元換 lo～lo+9 萬
  count: number;
  yuanMid: number; // 1 億楓幣約幾元（桶中間）
  yuanLo: number;
  yuanHi: number;
  market: boolean;
};

/** 照楓幣由便宜到貴排（100 元換得越多越便宜）。includeEmpty：中間沒有掛單的價位也列出來（畫分布圖用） */
export function ladderRows(latest: Latest, includeEmpty = false): LadderRow[] {
  const marketLo = Math.floor(latest.ask100 / BUCKET) * BUCKET;
  const counts = new Map(latest.ladder.map(([lo, count]) => [lo, count]));
  const los = includeEmpty && latest.ladder.length
    ? (() => {
        const all = latest.ladder.map(([lo]) => lo);
        const out: number[] = [];
        for (let lo = Math.max(...all); lo >= Math.min(...all); lo -= BUCKET) out.push(lo);
        return out;
      })()
    : [...counts.keys()].sort((a, b) => b - a);
  return los.map(lo => ({
    lo,
    count: counts.get(lo) ?? 0,
    yuanMid: 1_000_000 / (lo + BUCKET / 2),
    yuanLo: 1_000_000 / (lo + BUCKET),
    yuanHi: 1_000_000 / lo,
    market: lo === marketLo,
  }));
}

export const ladderTotal = (latest: Latest) => latest.ladder.reduce((sum, [, count]) => sum + count, 0);

// ---------- 圖的座標 ----------

/** 漂亮的刻度：1、2、5 × 10^n */
export function niceTicks(min: number, max: number, target = 4): number[] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + 1e-9; value += step) out.push(Math.round(value * 1000) / 1000);
  return out;
}

export function priceDomain(days: Day[], extra: (number | null)[][]): [number, number] {
  const values = days.flatMap(day => [day.high, day.low]).concat(extra.flat().filter((v): v is number => v !== null));
  const lo = Math.min(...values), hi = Math.max(...values);
  const pad = (hi - lo || hi * 0.02) * 0.12;
  return [lo - pad, hi + pad];
}

/** 這版要停在哪一天：?pin=2026-10-12；沒給就不停（十字線收起來） */
export function pinIndex(days: Day[], pin: string | null): number | null {
  if (!pin) return null;
  const index = days.findIndex(day => day.date === pin);
  return index >= 0 ? index : null;
}

/** 有記到掛單數的日子 */
export const listingDays = (days: Day[]) => days.map((day, index) => ({ day, index })).filter(({ day }) => day.listings !== null);

export const REF_SITE = "https://maple-classic-wiki.pages.dev/price";
export const REF_NAME = "maple-classic-wiki.pages.dev";

// ---------- 給版面用的小工具 ----------

export const fmtInt = (value: number) => Math.round(value).toLocaleString("zh-TW");

/** 委賣檔位表單獨列出的最低價位：100 元換 200 萬以上的每一格都列，不到的併成一列 */
export const LADDER_CUT = 200;

/** 委賣檔位：100 元換 200 萬以上的每個有掛單的價位單獨列（便宜的先），不到 200 萬的併成一列「更貴的」 */
export function ladderBook(latest: Latest) {
  const rows = ladderRows(latest);
  const head = rows.filter(row => row.lo >= LADDER_CUT);
  const rest = rows.filter(row => row.lo < LADDER_CUT);
  return {
    head,
    rest: rest.length
      ? { count: rest.reduce((sum, row) => sum + row.count, 0), loMin: Math.min(...rest.map(row => row.lo)), loMax: Math.max(...rest.map(row => row.lo)) + BUCKET - 1 }
      : null,
  };
}

/** 圖最多畫幾天：每天至少 10px 寬，最少 7 天；回傳要從第幾天開始畫（天數不夠就是 0） */
export function visibleWindow(total: number, plotWidth: number) {
  const count = Math.max(7, Math.floor(plotWidth / 10));
  return Math.max(0, total - count);
}

/** 跟前一天比的字：前一天剛好是昨天就說「昨天」，不然寫日期 */
export function prevWord(quote: Quote, latest: Latest) {
  if (!quote.prev) return null;
  const today = taipeiDate(latest.t);
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return quote.prev.date === yesterday ? "昨天" : dayLabel(quote.prev.date).md;
}

export const dirWord = (dir: Direction) => (dir === "up" ? "漲" : dir === "down" ? "跌" : "平");
