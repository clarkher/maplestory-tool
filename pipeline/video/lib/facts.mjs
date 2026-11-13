// 來源比對：腳本裡的數字、日期、時間，來源文字找不到就整句拿掉（不編造）
/**
 * @typedef {{big: string, line: string}} Card
 * @typedef {{title: string, subtitle: string, ticker: string[], cards: Card[], narration: string[],
 *   shortsNarration: string[], ytTitle: string, description: string, images: string[]}} Script
 */

const DEFAULT_TITLE = "官方公告重點";

const FULL = (s) =>
  s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/．(?=\d)/g, ".").replace(/％/g, "%").replace(/：/g, ":").replace(/／/g, "/");

const okDate = (m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31;

// 由左到右依序比：完整日期、M月D日、時間、M/D、一般數字（小數點寫法 1.5 一律當數字，不當日期）
// 注意：單獨的數字（月份、日、數量）只要來源有「相同數字」就算有據，對月份／日單獨宣稱的保護較弱
const RE = new RegExp(
  [
    String.raw`(?<![\d])(\d{4})[/.\-年](\d{1,2})[/.\-月](\d{1,2})(?!\d)`,
    String.raw`(\d{1,2})月(\d{1,2})[日號]`,
    String.raw`(?<![\d:])(\d{1,2}):(\d{2})(?![\d:])`,
    String.raw`(?<![\d/])(\d{1,2})/(\d{1,2})(?![\d/])`,
    String.raw`\d+(?:\.\d+)?%?`,
  ].join("|"),
  "g",
);

/** 抽出日期（M/D）、時間（HH:MM）、其他數字（百分比保留 %、千分位去逗號） */
export function factTokens(s) {
  const t = FULL(String(s ?? "")).replace(/(\d),(?=\d{3}(?!\d))/g, "$1");
  const out = [];
  for (const m of t.matchAll(RE)) {
    if (m[1] !== undefined) {
      if (okDate(+m[2], +m[3])) out.push(m[1], `${+m[2]}/${+m[3]}`);
      else out.push(m[0]);
    } else if (m[4] !== undefined) out.push(`${+m[4]}/${+m[5]}`);
    else if (m[6] !== undefined) out.push(`${m[6].padStart(2, "0")}:${m[7]}`);
    else if (m[8] !== undefined) out.push(`${+m[8]}/${+m[9]}`);
    else out.push(m[0]);
  }
  return out;
}

/** 句子的每個數字／日期都要在來源裡；沒數字的句子一律算有據 */
export function grounded(sentence, sourceText) {
  const need = factTokens(sentence);
  if (!need.length) return true;
  const have = new Set(factTokens(sourceText));
  return need.every((x) => have.has(x));
}

/** 逐句過濾；被丟掉的原文都記在 dropped */
export function filterScript(script, sourceText) {
  const dropped = [];
  const keep = (s) => (grounded(s, sourceText) ? true : (dropped.push(s), false));
  const out = { ...script };
  out.title = keep(script.title) ? script.title : DEFAULT_TITLE;
  out.subtitle = keep(script.subtitle) ? script.subtitle : "";
  out.ticker = (script.ticker ?? []).filter(keep);
  out.ytTitle = keep(script.ytTitle) ? script.ytTitle : out.title;
  out.cards = (script.cards ?? []).filter((c) => {
    const ok = grounded(c.big, sourceText) && grounded(c.line, sourceText);
    if (!ok) dropped.push(`${c.big} ${c.line}`);
    return ok;
  });
  out.narration = (script.narration ?? []).filter(keep);
  out.shortsNarration = (script.shortsNarration ?? []).filter(keep);
  out.description = String(script.description ?? "").split("\n").filter((l) => keep(l)).join("\n");
  return { script: out, dropped };
}

/** 夠做一支片：卡片至少 2 張、旁白至少 4 句 */
export function isUsable(script) {
  return (script.cards?.length ?? 0) >= 2 && (script.narration?.length ?? 0) >= 4;
}
