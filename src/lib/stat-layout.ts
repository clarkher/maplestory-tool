/**
 * 數值格子（components/DbBrowser.tsx 的 StatGrid，道具卡、怪物卡共用）要不要佔兩欄。
 *
 * 值太長會在格子裡斷行，同一列另一格被撐高、空一大塊（「劍士、弓箭手、盜賊」「上衣＋褲裙（佔兩格）」）。
 * 2026-10-06 在測試機量過（15px 粗體）：中文字與全形標點一個 15px、數字約 9px；
 * 值能用的寬度最窄是 640px 寬的四欄（107.5px）跟 360px 手機的兩欄（119px），放得下 7 個中文字，第 8 個就斷行。
 * 所以超過 7 個中文字寬就佔兩欄；佔兩欄後最窄也有約 240px，五個職業全列（15 個字）也放得下。
 */
const MAX_ONE_COLUMN_WIDTH = 7;

/** 半形字（數字、英文、逗號）大約是中文字的六成寬 */
const HALF_WIDTH = 0.6;

export function statSpansTwo(value: string | number): boolean {
  let width = 0;
  for (const char of String(value)) width += (char.codePointAt(0) ?? 0) > 0xff ? 1 : HALF_WIDTH;
  return width > MAX_ONE_COLUMN_WIDTH;
}

export type StatSpan = "one" | "two" | "fill";

/**
 * 每一格在手機兩欄時佔幾欄：太長的佔兩欄（statSpansTwo）；格子加起來是奇數時最後一排會空一格，
 * 把最後一個單格拉滿整排（fill）。StatGrid 用 grid-flow-row-dense，空位一定落在最後，所以只看總數就夠。
 * 桌機四欄不拉（fill 在 sm 以上照樣一欄）。
 */
export function statSpans(values: ReadonlyArray<string | number>): StatSpan[] {
  const spans: StatSpan[] = values.map(value => (statSpansTwo(value) ? "two" : "one"));
  const units = spans.reduce((sum, span) => sum + (span === "two" ? 2 : 1), 0);
  if (units % 2 === 1) spans[spans.lastIndexOf("one")] = "fill";
  return spans;
}
