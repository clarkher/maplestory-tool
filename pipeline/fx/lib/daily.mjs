/**
 * 每天一根 K 棒（台灣時間 00:00–24:00），資料是參考站每 2 小時一筆的市價（ref-samples.jsonl 的列：{ t, ask100, listings? }）。
 * 價格先換成「1 億楓幣幾元」才取開高低收：ask100 越大楓幣越便宜，直接取最高最低會倒過來。
 * 掛單數只有我們抓到的那幾刻才有（參考站的歷史沒記），取當天最後一筆有記的。
 * 壞掉的列（市價不是有限正數、時間讀不懂）跳過，不讓一筆壞資料把整天變成 NaN。
 */
const HOUR = 3600 * 1000;

export function taipeiIso(date) {
  return `${new Date(date.getTime() + 8 * HOUR).toISOString().slice(0, 19)}+08:00`;
}

export function taipeiDate(iso) {
  return new Date(Date.parse(iso) + 8 * HOUR).toISOString().slice(0, 10);
}

const round1 = value => Math.round(value * 10) / 10;
const round2 = value => Math.round(value * 100) / 100;

export const perYi = ask100 => round1(1_000_000 / ask100);

const isValid = row => typeof row?.ask100 === "number" && Number.isFinite(row.ask100) && row.ask100 > 0 && Number.isFinite(Date.parse(row.t));

export function dailyBars(rows) {
  const byDate = new Map();
  for (const row of rows.filter(isValid).sort((a, b) => Date.parse(a.t) - Date.parse(b.t))) {
    const date = taipeiDate(row.t);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(row);
  }
  // 照時間排過才分組，Map 的順序就是日期由舊到新
  return [...byDate].map(([date, day]) => {
    const values = day.map(row => perYi(row.ask100));
    return {
      date,
      open: values[0],
      high: Math.max(...values),
      low: Math.min(...values),
      close: values.at(-1),
      closeMesoPerNtd: round2(day.at(-1).ask100 / 100),
      listings: day.filter(row => Number.isInteger(row.listings)).at(-1)?.listings ?? null,
      samples: day.length,
      source: "ref",
    };
  });
}