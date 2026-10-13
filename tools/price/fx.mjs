// 楓幣換台幣：讀 maple-fx（v0.96）收的雪吉拉每日匯率。格式見 docs/superpowers/specs/2026-10-13-meso-fx-design.md
// days[] 由舊到新、一天一筆、沒抓到的日子不出現；close 單位是「元／1 億楓幣」

export const FX_URL = "https://raw.githubusercontent.com/clarkher/maplestory-tool/fx-data/fx/scania/daily.json";
export const FX_LOOKBACK_DAYS = 3;

/** 抓每日匯率；檔案還沒有（404）、網路壞掉、格式不對都回 null（頁面寫「匯率資料累積中」） */
export async function fetchFx(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(FX_URL);
    if (!res.ok) return null;
    const j = await res.json();
    return Array.isArray(j?.days) ? j : null;
  } catch {
    return null;
  }
}

export function shiftDate(ymd, delta) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** 那天的匯率；那天沒有就往前最近一天，最多往前 3 天 */
export function fxFor(date, days) {
  if (!date || !days?.length) return null;
  const byDate = new Map(days.map(d => [d.date, d]));
  for (let back = 0; back <= FX_LOOKBACK_DAYS; back++) {
    const d = shiftDate(date, -back);
    const hit = byDate.get(d);
    if (hit && Number.isFinite(hit.close) && hit.close > 0) return { close: hit.close, date: d, exact: back === 0 };
  }
  return null;
}

/** 楓幣 → 台幣 */
export const toNtd = (meso, close) => meso * close / 1e8;
