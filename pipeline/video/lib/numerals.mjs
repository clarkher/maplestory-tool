// 畫面上的日期、數字一律阿拉伯數字（使用者 11/13 規定）：「十一月十九日」→「11月19日」、「三十天」→「30天」。
// 一般用語（一起、一定、一次、十分、三轉、一個）不動：單一個國字數字只有接在單位前面才換。
const DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const UNIT = { 十: 10, 百: 100, 千: 1000, 萬: 10000 };
const CN = "零〇一二兩三四五六七八九十百千萬";

export function cnToInt(s) {
  let total = 0;
  let section = 0;
  let num = 0;
  for (const c of s) {
    if (c in DIGIT) num = DIGIT[c];
    else if (c === "萬") {
      total += (section + num) * 10000;
      section = 0;
      num = 0;
    } else if (c in UNIT) {
      section += (num || 1) * UNIT[c];
      num = 0;
    }
  }
  return total + section + num;
}

const N = `[${CN}]+`;
const DATE = new RegExp(`(${N})月(${N})([日號])`, "g");
const MONTH = new RegExp(`(?<![${CN}])(${N})月(?=[底初中])`, "g");
const PERCENT = new RegExp(`百分之(${N})`, "g");
const COUNTER = "張|天|週|周|小時|分鐘|秒|級|等|倍|名|隻|件|顆|抽|組|樂豆點|點|元|格|顆|人|場|日";
const WITH_COUNTER = new RegExp(`(?<![${CN}])(${N})(?=(?:${COUNTER}))`, "g");
// 兩個字以上而且帶十／百／千（十九、三十、一百二十）：單獨出現也算數字
const MULTI = new RegExp(`(?<![${CN}])([${CN}]*[十百千萬][${CN}]*)(?![${CN}])`, "g");

export function arabicNumerals(text) {
  return String(text ?? "")
    .replace(DATE, (_, m, d, u) => `${cnToInt(m)}月${cnToInt(d)}${u}`)
    .replace(MONTH, (_, m) => `${cnToInt(m)}月`)
    .replace(PERCENT, (_, n) => `${cnToInt(n)}%`)
    .replace(WITH_COUNTER, (m) => String(cnToInt(m)))
    .replace(MULTI, (m) => (m.length >= 2 ? String(cnToInt(m)) : m));
}

/** 稿子裡會上畫面、進 youtube.txt 的欄位都換（images 是網址不動） */
export function arabicScript(script) {
  const f = arabicNumerals;
  return {
    ...script,
    title: f(script.title),
    subtitle: f(script.subtitle),
    ticker: (script.ticker ?? []).map(f),
    cards: (script.cards ?? []).map((c) => ({ big: f(c.big), line: f(c.line) })),
    narration: (script.narration ?? []).map(f),
    shortsNarration: (script.shortsNarration ?? []).map(f),
    ytTitle: f(script.ytTitle),
    description: f(script.description),
  };
}
