/**
 * 每天一根 K 棒（台灣時間 00:00–24:00）。
 * 自己抓的 8591 樣本全收；參考站的只補「前後 3 小時內沒有自己資料」的空檔（8591 被擋、還沒開始收集之前）。
 * 價格先換成「1 億楓幣幾元」才取開高低收：存的 ask100 越大楓幣越便宜，直接取最高最低會倒過來。
 */
const HOUR = 3600 * 1000;
export const GAP_MS = 3 * HOUR;

export function taipeiIso(date) {
  return `${new Date(date.getTime() + 8 * HOUR).toISOString().slice(0, 19)}+08:00`;
}

export function taipeiDate(iso) {
  return new Date(Date.parse(iso) + 8 * HOUR).toISOString().slice(0, 10);
}

const round1 = value => Math.round(value * 10) / 10;
const round2 = value => Math.round(value * 100) / 100;
const sum = values => values.reduce((total, value) => total + value, 0);

export const perYi = ask100 => round1(1_000_000 / ask100);

export function mergeStreams(own, ref, gapMs = GAP_MS) {
  const ownTimes = own.map(sample => Date.parse(sample.t));
  const fill = ref
    .filter(sample => !ownTimes.some(time => Math.abs(time - Date.parse(sample.t)) < gapMs))
    .map(sample => ({ ...sample, src: "ref" }));
  return [...own, ...fill].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

export function dailyBars(merged) {
  const byDate = new Map();
  for (const sample of merged) {
    const date = taipeiDate(sample.t);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(sample);
  }
  return [...byDate]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, samples]) => {
      const values = samples.map(sample => perYi(sample.ask100));
      const own = samples.filter(sample => sample.src === "8591");
      const volNtd = own.length ? sum(own.map(sample => sample.volNtd ?? 0)) : null;
      const volMeso = own.length ? round2(sum(own.map(sample => sample.volMeso ?? 0))) : null;
      return {
        date,
        open: values[0],
        high: Math.max(...values),
        low: Math.min(...values),
        close: values.at(-1),
        closeMesoPerNtd: round2(samples.at(-1).ask100 / 100),
        listings: own.at(-1)?.listings ?? null,
        volNtd,
        volMeso,
        // 成交楓幣單位是萬，÷ 10000 換成億
        vwap: volMeso ? round1(volNtd / (volMeso / 10000)) : null,
        samples: samples.length,
        source: own.length === samples.length ? "8591" : own.length === 0 ? "ref" : "mixed",
      };
    });
}
