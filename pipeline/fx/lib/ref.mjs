/**
 * 楓幣匯率的資料來源：參考站（maple-classic-wiki.pages.dev/price）的 price.json。
 * 它每 2 小時整理一次 8591 公開掛單的市價（排除代練與引流單、MAD 去離群、最便宜四分之一的中位數）。
 * 我們不直接抓 8591：它的服務條款禁止爬蟲，10/13 實測也會擋老實寫身分的程式，使用者 10/14 拍板不繞過。
 * history 只留最近 60 筆（約 5 天），所以每次把新的接進 fx-data 存起來。
 * m=3 起是「市價」口徑，之前是全部掛單中位數——口徑不同，不收。
 */
export const REF_URL = "https://maple-classic-wiki.pages.dev/data/price.json";
export const REF_PAGE = "https://maple-classic-wiki.pages.dev/price";
export const SERVER = "雪吉拉";
export const LADDER_WIDTH = 10;
export const USER_AGENT = "MapleBook-fx/1.0 (+https://github.com/clarkher/maplestory-tool; meso rate)";

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

/**
 * 這次要接進 ref-samples.jsonl 的列：比檔案最後一筆（lastT，毫秒）新的歷史。
 * 掛單數只有當下那一刻有（歷史沒記），跟當下市價同一刻的那筆補上去。
 */
export function newRows(json, lastT, server = SERVER) {
  const now = refSnapshot(json, server);
  return refHistory(json, server)
    .filter(row => Date.parse(row.t) > lastT)
    .map(row => (now && row.t === now.t && now.listings !== null ? { ...row, listings: now.listings } : row));
}