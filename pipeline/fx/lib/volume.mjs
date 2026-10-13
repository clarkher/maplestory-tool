/**
 * 成交：8591 每筆掛單有「累計賣出件數」，跟上一次抓的相減就是這段時間真的賣掉幾件。
 * 只算同一筆掛單（同 id）、件數變多、一次不超過 1000 件的；第一次看到的只記基準。
 * ⚠️ 很多賣家要求「談好後開專屬賣場」，那種交易可能不算在公開掛單裡——數字是「看得到的成交」，不是全部（spec「成交量還沒驗證」）。
 */
export const MAX_UNITS_PER_RUN = 1000;

export function stateMap(kept) {
  return Object.fromEntries(kept.filter(item => item.sold !== null).map(item => [item.id, [item.sold, item.priceNtd, item.rate]]));
}

export function soldSince(prev, kept) {
  let volNtd = 0;
  let volMeso = 0;
  let units = 0;
  for (const item of kept) {
    const before = prev?.[item.id];
    if (!before || item.sold === null) continue;
    const delta = item.sold - before[0];
    if (!(delta > 0) || delta > MAX_UNITS_PER_RUN) continue;
    volNtd += delta * item.priceNtd;
    volMeso += (delta * item.priceNtd * item.rate) / 100;
    units += delta;
  }
  return { volNtd, volMeso: Math.round(volMeso * 100) / 100, units };
}
