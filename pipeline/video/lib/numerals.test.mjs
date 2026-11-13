import test from "node:test";
import assert from "node:assert/strict";
import { cnToInt, arabicNumerals, arabicScript } from "./numerals.mjs";

test("cnToInt：常見寫法", () => {
  assert.equal(cnToInt("十"), 10);
  assert.equal(cnToInt("十九"), 19);
  assert.equal(cnToInt("三十"), 30);
  assert.equal(cnToInt("二十三"), 23);
  assert.equal(cnToInt("一百二十"), 120);
  assert.equal(cnToInt("兩千零五"), 2005);
  assert.equal(cnToInt("三"), 3);
});

test("arabicNumerals：日期、多字數字、帶單位的數字換成阿拉伯數字", () => {
  assert.equal(arabicNumerals("十一月十九日開跑"), "11月19日開跑");
  assert.equal(arabicNumerals("到十二月十六號"), "到12月16號");
  assert.equal(arabicNumerals("連續三十天"), "連續30天");
  assert.equal(arabicNumerals("送三張、打五隻、等十五分鐘"), "送3張、打5隻、等15分鐘");
  assert.equal(arabicNumerals("機率百分之三十"), "機率30%");
});

test("arabicNumerals：一般用語不動", () => {
  for (const s of ["一起去", "一定要", "一次看完", "十分划算", "三轉以後", "一個好機會", "一下子", "楓葉商會"]) {
    assert.equal(arabicNumerals(s), s);
  }
});

test("arabicScript：畫面上每個欄位都換", () => {
  const s = arabicScript({
    title: "十一月十九日開跑", subtitle: "三十天", ticker: ["送三張"], cards: [{ big: "十二月十六日", line: "五隻" }],
    narration: ["十一月十九日"], shortsNarration: ["三十天"], ytTitle: "十一月十九日", description: "{{LINK}}\n三十天", images: ["https://x/一.jpg"],
  });
  assert.equal(s.title, "11月19日開跑");
  assert.equal(s.cards[0].big, "12月16日");
  assert.equal(s.cards[0].line, "5隻");
  assert.deepEqual(s.ticker, ["送3張"]);
  assert.deepEqual(s.narration, ["11月19日"]);
  assert.equal(s.description, "{{LINK}}\n30天");
  assert.deepEqual(s.images, ["https://x/一.jpg"]);
});
