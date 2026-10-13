// 價格表的數字：中間價用「單價」算（成堆賣的東西總價沒意義），只算確認過的（status ok）
import { EQUIPS } from "./list.mjs";
import { fxFor, toNtd } from "./fx.mjs";

/** 不到 3 天不畫走勢線 */
export const MIN_TREND_DAYS = 3;

export function median(nums) {
  const a = nums.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export const attrKey = attrs => attrs ? Object.keys(attrs).sort().map(k => `${k}+${attrs[k]}`).join("、") : "";

const usable = t => t.status === "ok" && Number.isFinite(t.unitPrice);
const dayOf = iso => iso.slice(0, 10);

function groupBy(records) {
  const map = new Map();
  for (const t of records) {
    const k = attrKey(t.attrs);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(t);
  }
  return [...map].sort(([a], [b]) => a.localeCompare(b, "zh-Hant"))
    .map(([key, ts]) => ({ key, median: median(ts.map(t => t.unitPrice)), count: ts.length }));
}

/** 一件的摘要：最近一天記的那批算中間價，跟前一次記的那批比漲跌 */
export function summarize(records, item, fxDays) {
  const mine = records.filter(t => t.item === item && usable(t));
  if (!mine.length) return { item, count: 0 };
  const days = [...new Set(mine.map(t => dayOf(t.recordedAt)))].sort();
  const latest = mine.filter(t => dayOf(t.recordedAt) === days.at(-1));
  const prev = days.length > 1 ? mine.filter(t => dayOf(t.recordedAt) === days.at(-2)) : [];
  const med = median(latest.map(t => t.unitPrice));
  const prevMed = prev.length ? median(prev.map(t => t.unitPrice)) : null;
  const lastTradedAt = latest.map(t => t.tradedAt).sort().at(-1);
  const fx = fxFor(lastTradedAt, fxDays);
  return {
    item,
    count: latest.length,
    few: latest.length <= 2,
    median: med,
    changePct: prevMed ? Math.round((med - prevMed) / prevMed * 1000) / 10 : null,
    lastTradedAt,
    ntd: fx ? Math.round(toNtd(med, fx.close) * 10) / 10 : null,
    fxDate: fx?.date ?? null,
    fxExact: fx?.exact ?? null,
    groups: EQUIPS.has(item) ? groupBy(latest) : null,
  };
}

/** 走勢：照交易日期一天一點（中間價）；key 給了就只看那個屬性 */
export function series(records, item, key = null) {
  const byDay = new Map();
  for (const t of records) {
    if (t.item !== item || !usable(t)) continue;
    if (key != null && attrKey(t.attrs) !== key) continue;
    if (!byDay.has(t.tradedAt)) byDay.set(t.tradedAt, []);
    byDay.get(t.tradedAt).push(t.unitPrice);
  }
  return [...byDay].sort(([a], [b]) => a.localeCompare(b))
    .map(([date, us]) => ({ date, median: median(us), count: us.length }));
}
