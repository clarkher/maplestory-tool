import test from "node:test";
import assert from "node:assert/strict";
import { factTokens, grounded, filterScript, isUsable } from "./facts.mjs";

test("factTokens：日期、百分比、時間、千分位、全形", () => {
  const t = factTokens("11月19日開跑，12/9 最後掉幣，機率 0.5%");
  assert.ok(t.includes("11/19") && t.includes("12/9") && t.includes("0.5%"));
  for (const s of ["11/19", "11月19日", "2026/11/19", "11.19"]) assert.ok(factTokens(s).includes("11/19"), s);
  assert.deepEqual(factTokens("11/19～12/16").filter((x) => x.includes("/")), ["11/19", "12/16"]);
  assert.ok(factTokens("每天 14:00 開始").includes("14:00"));
  assert.ok(factTokens("1,000 個").includes("1000"));
  assert.deepEqual(factTokens("０．５％"), ["0.5%"]);
  assert.ok(factTokens("2026 年").includes("2026"));
  assert.ok(factTokens("1.5 倍").length === 1);
});

test("grounded：來源有才算；沒數字的句子永遠算", () => {
  assert.equal(grounded("11/19 開跑", "活動 2026/11/19 起"), true);
  assert.equal(grounded("12/20 結束", "活動 2026/11/19 起"), false);
  assert.equal(grounded("大家快來玩", "沒有數字"), true);
  assert.equal(grounded("機率 0.5%", "機率 0.5％"), true);
  assert.equal(grounded("1000 個", "共 1,000 個"), true);
  assert.equal(grounded("2026 年 11 月", "2026年"), false);
});

const base = () => ({
  title: "標題", subtitle: "副標", ticker: ["11/19 開跑", "12/20 結束"],
  cards: [{ big: "11/19", line: "開跑" }, { big: "12/20", line: "結束" }, { big: "好康", line: "送 5 個" }],
  narration: ["11/19 開跑。", "12/20 結束。", "歡迎來玩。"],
  shortsNarration: ["12/20 截止"], ytTitle: "t", description: "11/19 開跑\n12/20 結束\n歡迎", images: [],
});

test("filterScript：丟編造的句子並記錄", () => {
  const { script, dropped } = filterScript(base(), "活動 11/19 起，送 5 個");
  assert.deepEqual(script.cards, [{ big: "11/19", line: "開跑" }, { big: "好康", line: "送 5 個" }]);
  assert.deepEqual(script.narration, ["11/19 開跑。", "歡迎來玩。"]);
  assert.deepEqual(script.ticker, ["11/19 開跑"]);
  assert.deepEqual(script.shortsNarration, []);
  assert.equal(script.description, "11/19 開跑\n歡迎");
  assert.ok(dropped.includes("12/20 結束。") && dropped.includes("12/20 截止") && dropped.includes("12/20 結束"));
});

test("filterScript：title 編造改預設、subtitle 編造清空", () => {
  const s = base(); s.title = "12/20 大特賣"; s.subtitle = "只到 12/20";
  const { script, dropped } = filterScript(s, "11/19");
  assert.equal(script.title, "官方公告重點");
  assert.equal(script.subtitle, "");
  assert.ok(dropped.includes("12/20 大特賣") && dropped.includes("只到 12/20"));
});

test("isUsable：cards>=2 且 narration>=4", () => {
  const ok = { cards: [1, 2], narration: [1, 2, 3, 4] };
  assert.equal(isUsable(ok), true);
  assert.equal(isUsable({ cards: [1], narration: [1, 2, 3, 4] }), false);
  assert.equal(isUsable({ cards: [1, 2], narration: [1, 2, 3] }), false);
});
