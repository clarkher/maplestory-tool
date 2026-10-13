// 品名比對：Windows 文字辨識的中文會錯一兩個字（10/13 合成圖實測「攻擊」讀成「攻鑿」），數字幾乎不錯。
// 所以中文對上七成就算，數字（10%、60%、100%）一定要一模一樣。

/** 去掉所有空白（Windows 會在中文字之間塞空格） */
export const squash = s => String(s ?? "").replace(/\s+/g, "");

/** 最長共同子序列長度（照字，不照位元組） */
export function lcs(a, b) {
  const A = [...a], B = [...b];
  const dp = new Array(B.length + 1).fill(0);
  for (const ch of A) {
    let prev = 0;
    for (let j = 1; j <= B.length; j++) {
      const keep = dp[j];
      dp[j] = ch === B[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = keep;
    }
  }
  return dp[B.length];
}

export const NAME_THRESHOLD = 0.7;

/** text 是不是在講 expected 這件：數字（10%、60% 等）一定要一樣、中文字（數字以外的字）對上七成。回 0（不是）或 0.7～1 的分數。 */
export function nameScore(expected, text) {
  const e = squash(expected), t = squash(text);
  if (!e || !t) return 0;
  const tDigits = new Set(t.match(/\d+%?/g) ?? []);
  for (const d of e.match(/\d+%?/g) ?? []) if (!tDigits.has(d)) return 0;
  const core = e.replace(/\d+%?/g, "");
  if (core === "") return 1;
  const score = lcs(core, t) / [...core].length;
  return score >= NAME_THRESHOLD ? score : 0;
}

/** 一張圖的所有行裡，最像 expected 的分數 */
export function bestNameScore(expected, texts) {
  return Math.max(0, ...texts.map(t => nameScore(expected, t)));
}
