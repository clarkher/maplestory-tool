/**
 * 一筆楓幣掛單的匯率，單位「每 100 元台幣換幾萬楓幣」（跟 8591 標題、參考站同單位）。
 * 8591 幫標題加的【100元=X萬楓幣】是四捨五入到整數的粗值；賣家在後面寫的「A萬楓幣=B元」才精確。
 * 精確值跟 X 差不到 1 才用（防止讀到標題裡別的數字），不然用 X。沒有括號＝不是幣價掛單，回 null。
 */
const BRACKET = /【\s*100\s*元\s*[=＝]\s*([\d.,]+)\s*萬\s*楓幣\s*】/;
const QUOTE = /([\d.,]+)\s*(億|萬)\s*楓?幣?\s*[=＝]\s*([\d.,]+)\s*元/;

export function parseRate(title) {
  const bracket = title.match(BRACKET);
  if (!bracket) return null;
  const rough = toNumber(bracket[1]);
  if (!(rough > 0)) return null;
  const quote = title.slice(bracket.index + bracket[0].length).match(QUOTE);
  if (quote) {
    const meso = toNumber(quote[1]) * (quote[2] === "億" ? 10000 : 1);
    const ntd = toNumber(quote[3]);
    if (meso > 0 && ntd > 0) {
      const precise = (meso / ntd) * 100;
      if (Math.abs(precise - rough) < 1) return Math.round(precise * 100) / 100;
    }
  }
  return rough;
}

const toNumber = text => Number(String(text).replace(/,/g, ""));
