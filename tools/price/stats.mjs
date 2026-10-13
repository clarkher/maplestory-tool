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

const pct = (med, prevMed) => (prevMed ? Math.round((med - prevMed) / prevMed * 1000) / 10 : null);

/** 最近一天記的那批，照屬性分組；每組各自跟「那個屬性自己的前一次記錄」比漲跌（all＝這件全部可用的紀錄） */
function groupBy(latest, all) {
  const map = new Map();
  for (const t of latest) {
    const k = attrKey(t.attrs);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(t);
  }
  return [...map].sort(([a], [b]) => a.localeCompare(b, "zh-Hant"))
    .map(([key, ts]) => {
      const own = all.filter(t => attrKey(t.attrs) === key);
      const days = [...new Set(own.map(t => dayOf(t.recordedAt)))].sort();
      const prev = days.length > 1 ? own.filter(t => dayOf(t.recordedAt) === days.at(-2)) : [];
      const med = median(ts.map(t => t.unitPrice));
      return { key, median: med, count: ts.length, changePct: prev.length ? pct(med, median(prev.map(t => t.unitPrice))) : null };
    });
}

/** 一件的摘要：最近一天記的那批算中間價，跟前一次記的那批比漲跌。裝備（黃色雨傘）不同屬性價差很大，頂層不給漲跌，每個屬性在 groups 裡各自比 */
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
  const equip = EQUIPS.has(item);
  return {
    item,
    count: latest.length,
    few: latest.length <= 2,
    median: med,
    changePct: equip ? null : pct(med, prevMed),
    lastTradedAt,
    ntd: fx ? Math.round(toNtd(med, fx.close) * 10) / 10 : null,
    fxDate: fx?.date ?? null,
    fxExact: fx?.exact ?? null,
    groups: equip ? groupBy(latest, mine) : null,
  };
}

/**
 * 「上次中間價」（給 5 倍檢查用）：裝備只拿同屬性、最近一天記的那批的中間價（屬性混在一起的中間價沒意義）；
 * 其他件就是 summarize 的中間價。沒有可比的就是 null。
 */
export function prevMedianFor(records, item, attrs) {
  if (!EQUIPS.has(item)) return summarize(records, item, null).median ?? null;
  const key = attrKey(attrs);
  const same = records.filter(t => t.item === item && usable(t) && attrKey(t.attrs) === key);
  if (!same.length) return null;
  const day = same.map(t => dayOf(t.recordedAt)).sort().at(-1);
  return median(same.filter(t => dayOf(t.recordedAt) === day).map(t => t.unitPrice));
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
