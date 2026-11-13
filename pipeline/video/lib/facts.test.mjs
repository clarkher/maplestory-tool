import test from "node:test";
import assert from "node:assert/strict";
import { factTokens, grounded, filterScript, isUsable } from "./facts.mjs";

test("factTokens：日期、百分比、時間、千分位、全形", () => {
  const t = factTokens("11月19日開跑，12/9 最後掉幣，機率 0.5%");
  assert.ok(t.includes("11/19") && t.includes("12/9") && t.includes("0.5%"));
  for (const s of ["11/19", "11月19日", "2026/11/19"]) assert.ok(factTokens(s).includes("11/19"), s);
  assert.deepEqual(factTokens("11/19～12/16").filter((x) => x.includes("/")), ["11/19", "12/16"]);
  assert.ok(factTokens("每天 14:00 開始").includes("14:00"));
  assert.ok(factTokens("1,000 個").includes("1000"));
  assert.deepEqual(factTokens("０．５％"), ["0.5%"]);
  assert.ok(factTokens("2026 年").includes("2026"));
  assert.deepEqual(factTokens("1.5 倍"), ["1.5"]);
  assert.deepEqual(factTokens("11.09"), ["11.09"]);
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
  shortsNarration: ["11/19 開跑", "12/20 截止"], ytTitle: "t", description: "11/19 開跑\n12/20 結束\n歡迎", images: [],
});

test("filterScript：丟編造的句子並記錄", () => {
  const { script, dropped } = filterScript(base(), "活動 11/19 起，送 5 個");
  assert.deepEqual(script.cards, [{ big: "11/19", line: "開跑" }, { big: "好康", line: "送 5 個" }]);
  assert.deepEqual(script.narration, ["11/19 開跑。", "歡迎來玩。"]);
  assert.deepEqual(script.ticker, ["11/19 開跑"]);
  assert.deepEqual(script.shortsNarration, ["11/19 開跑"]);
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

test("小數不當日期：互不相通", () => {
  assert.equal(grounded("1.5 倍", "1月5日"), false);
  assert.equal(grounded("1月5日", "1.5 倍"), false);
  assert.equal(grounded("3.5 倍", "3月5日"), false);
  assert.equal(grounded("1.5", "1.05"), false);
  assert.equal(grounded("11.9", "11.09"), false);
  assert.equal(grounded("1.5 倍", "活動 1.5 倍"), true);
});

test("全形句號不造小數", () => {
  const t = factTokens("限量100。5天後");
  assert.ok(t.includes("100") && t.includes("5") && !t.includes("100.5"));
});

test("filterScript：ytTitle 編造換成（已過濾的）title", () => {
  const s = base(); s.ytTitle = "12/20 結束！";
  const { script, dropped } = filterScript(s, "活動 11/19 起，送 5 個");
  assert.equal(script.ytTitle, "標題");
  assert.ok(dropped.includes("12/20 結束！"));
});

test("filterScript：卡片 i 跟旁白 i 成對，一邊對不到兩邊一起拿掉；卡片後面的旁白各自判斷", () => {
  const s = {
    title: "t", subtitle: "", ticker: [], ytTitle: "t", description: "", images: [],
    cards: [{ big: "新外觀", line: "喵喵管家" }, { big: "12/20", line: "結束" }, { big: "先看", line: "試穿" }],
    narration: ["新外觀是喵喵管家", "活動到 12/20", "3 張圖", "先試穿", "最後一句 9 個"],
    shortsNarration: ["新外觀", "12/20 結束"],
  };
  const { script, dropped } = filterScript(s, "喵喵管家 11/19 3 張");
  // 卡片 2（12/20）沒據 → 旁白 2、Shorts 2 一起拿掉；第 3 組都有據留著；卡片後面的旁白各自判斷
  assert.deepEqual(script.cards.map((c) => c.big), ["新外觀", "先看"]);
  assert.deepEqual(script.narration, ["新外觀是喵喵管家", "3 張圖", "先試穿"]);
  assert.deepEqual(script.shortsNarration, ["新外觀"]);
  assert.ok(dropped.includes("12/20 結束") && dropped.includes("活動到 12/20") && dropped.includes("最後一句 9 個"));
});

test("filterScript：旁白對不到來源 → 配的卡片也拿掉", () => {
  const s = { title: "t", subtitle: "", ticker: [], ytTitle: "t", description: "", images: [], shortsNarration: [],
    cards: [{ big: "開跑", line: "打怪掉硬幣" }, { big: "換武器", line: "楓葉武器" }],
    narration: ["12/31 開跑", "硬幣換楓葉武器"] };
  const { script } = filterScript(s, "11/19");
  assert.deepEqual(script.cards.map((c) => c.big), ["換武器"]);
  assert.deepEqual(script.narration, ["硬幣換楓葉武器"]);
});
