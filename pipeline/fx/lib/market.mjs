/**
 * 一次抓取的市價（跟參考站 maple-classic-wiki.pages.dev/price 同一套算法，備援時兩邊的數字才接得起來）：
 *  1. 排除標題有「代練」「代肝」的（掛在楓幣分類的代練服務，價格是佔位數字）、匯率低於 10 的（「1 萬楓幣 = 100 元」這種引流單）
 *  2. 中位數 ± 3.5×MAD 以外的丟掉；剔完剩不到 3 筆就整批還原
 *  3. 市價＝匯率由高到低（楓幣由便宜到貴）前四分之一的中位數——就是打開清單真的會下單的那一區；不到 4 筆不給值
 * 單位都是「每 100 元台幣換幾萬楓幣」。
 */
import { parseRate } from "./rate.mjs";

const EXCLUDE = /代練|代肝/;
const MIN_RATE = 10;
const MAD_LIMIT = 3.5;
export const LADDER_WIDTH = 10;

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function trimOutliers(rated) {
  const rates = rated.map(item => item.rate);
  const center = median(rates);
  const mad = median(rates.map(rate => Math.abs(rate - center)));
  const kept = rated.filter(item => Math.abs(item.rate - center) <= MAD_LIMIT * mad);
  return kept.length < 3 ? rated : kept;
}

/** 由高到低前四分之一（無條件進位、至少 1 筆） */
function topQuarter(rates) {
  const sorted = [...rates].sort((a, b) => b - a);
  return sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 4)));
}

export function marketAsk(rates) {
  if (rates.length < 4) return null;
  return Math.round(median(topQuarter(rates)) * 100) / 100;
}

export function ladder(rates, width = LADDER_WIDTH) {
  const counts = new Map();
  for (const rate of rates) {
    const floor = Math.floor(rate / width) * width;
    counts.set(floor, (counts.get(floor) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => a[0] - b[0]);
}

export function summarize(listings) {
  const rated = [];
  for (const listing of listings) {
    if (EXCLUDE.test(listing.title)) continue;
    const rate = parseRate(listing.title);
    if (rate === null || rate < MIN_RATE) continue;
    rated.push({ ...listing, rate });
  }
  const kept = rated.length ? trimOutliers(rated) : [];
  const rates = kept.map(item => item.rate);
  const top = rates.length ? topQuarter(rates) : [];
  return {
    ask100: marketAsk(rates),
    kept,
    ladder: ladder(rates),
    band: top.length ? [Math.min(...top), Math.max(...top)] : null,
  };
}
