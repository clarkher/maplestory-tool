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
  // 卡片 i 跟旁白 i（正片、Shorts 都是）講同一件事：任一邊對不到來源，兩邊一起拿掉，畫面跟聲音才不會錯開
  const cards = script.cards ?? [];
  const narr = script.narration ?? [];
  const shorts = script.shortsNarration ?? [];
  const cardOk = cards.map((c) => grounded(c.big, sourceText) && grounded(c.line, sourceText));
  const narrOk = narr.map((s) => grounded(s, sourceText));
  const shortsOk = shorts.map((s) => grounded(s, sourceText));
  const pairOk = cards.map((_, i) => cardOk[i] && (i >= narr.length || narrOk[i]) && (i >= shorts.length || shortsOk[i]));
  cards.forEach((c, i) => { if (!pairOk[i]) dropped.push(`${c.big} ${c.line}`); });
  const lineKeep = (list, okList) => list.filter((s, i) => {
    const ok = okList[i] && (i >= cards.length || pairOk[i]);
    if (!ok) dropped.push(s);
    return ok;
  });
  out.cards = cards.filter((_, i) => pairOk[i]);
  out.narration = lineKeep(narr, narrOk);
  out.shortsNarration = lineKeep(shorts, shortsOk);
  out.description = String(script.description ?? "").split("\n").filter((l) => keep(l)).join("\n");
  return { script: out, dropped };
}

/** 夠做一支片：卡片至少 2 張、旁白至少 4 句 */
export function isUsable(script) {
  return (script.cards?.length ?? 0) >= 2 && (script.narration?.length ?? 0) >= 4;
}

/**
 * 卡片後面的補充句（不配卡片的那些）只留有事實的：至少要有一個數字／日期／時間，最多留 max 句。
 * 沒事實的補充句多半是「這次重點就是…」這種重複前面的空話（84140 實例），整句拿掉。
 * 回傳新的 script 跟被拿掉的句子。
 * @param {Script} script
 */
export function trimExtras(script, max = 2) {
  const n = script.cards?.length ?? 0;
  const dropped = [];
  const trim = (lines) => {
    const head = lines.slice(0, n);
    const kept = [];
    for (const l of lines.slice(n)) {
      if (factTokens(l).length && kept.length < max) kept.push(l);
      else dropped.push(l);
    }
    return [...head, ...kept];
  };
  return { script: { ...script, narration: trim(script.narration ?? []), shortsNarration: trim(script.shortsNarration ?? []) }, dropped };
}
