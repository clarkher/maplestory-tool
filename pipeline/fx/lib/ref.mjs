/**
 * 參考站（maple-classic-wiki.pages.dev/price）的 price.json：8591 抓不到時的備援，也拿來補我們開始收集之前的幾天。
 * 它每 2 小時抓一次 8591、市價算法跟我們相同（market.mjs）；history 只留最近 60 筆。
 * m=3 起是「市價」口徑，之前是全部掛單中位數——口徑不同，不收。
 */
import { LADDER_WIDTH } from "./market.mjs";

export const REF_URL = "https://maple-classic-wiki.pages.dev/data/price.json";
export const SERVER = "雪吉拉";

const isPositive = value => typeof value === "number" && Number.isFinite(value) && value > 0;
const isTime = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

export function refSnapshot(json, server = SERVER) {
  const current = json?.servers?.[server];
  if (!current || !isPositive(current.ask) || !isTime(json.t)) return null;
  const counts = new Map();
  for (const pair of Array.isArray(current.dist) ? current.dist : []) {
    const [rate, count] = Array.isArray(pair) ? pair : [];
    if (!isPositive(rate) || !Number.isInteger(count) || count <= 0) continue;
    const floor = Math.floor(rate / LADDER_WIDTH) * LADDER_WIDTH;
    counts.set(floor, (counts.get(floor) ?? 0) + count);
  }
  return {
    t: json.t,
    ask100: current.ask,
    listings: Number.isInteger(current.n) ? current.n : null,
    ladder: [...counts].sort((a, b) => a[0] - b[0]),
  };
}

export function refHistory(json, server = SERVER) {
  const rows = Array.isArray(json?.history) ? json.history : [];
  return rows
    .filter(row => row && row.m === 3 && isPositive(row[`${server}_ask`]) && isTime(row.t))
    .map(row => ({ t: row.t, ask100: row[`${server}_ask`] }))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}
