import test from "node:test";
import assert from "node:assert/strict";
import { normalizeText, rowsOf, parseRow, parseShot, isBlack } from "./parse.mjs";

const TODAY = "2026-10-13";

/** 假的辨識結果：每列一個字串陣列（每個字串是一個 word），y 照列往下排 */
function fakeOcr(rows, { meanLuma = 120, stdLuma = 40 } = {}) {
  return {
    width: 1366, height: 768, meanLuma, stdLuma,
    lines: rows.map((words, i) => ({
      text: words.join(" "),
      words: words.map((text, j) => ({ text, x: 100 + j * 40, y: 100 + i * 30, w: 30, h: 16 })),
    })),
  };
}

test("normalizeText：數字、日期、加號旁邊的空白拿掉，中文字之間的空白拿掉", () => {
  assert.equal(normalizeText("手 套 攻 鑿 卷 軸 10 % 1 , 320 , 000 2026 / 10 / 12"), "手套攻鑿卷軸 10%1,320,000 2026/10/12");
  assert.equal(normalizeText("魔 法 攻 力 + 48"), "魔法攻力+48");
});

test("一個價格：價格＝單價、數量 1", () => {
  assert.deepEqual(parseRow("手 套 攻 擊 卷 軸 10 % 1 , 320 , 000 2026 / 10 / 12", TODAY),
    { tradedAt: "2026-10-12", price: 1320000, unitPrice: 1320000, qty: 1, attrs: null, flags: [] });
});

test("兩個價格：大的是總價、小的是單價，數量用除的；漏了逗號也讀得到", () => {
  assert.deepEqual(parseRow("寵 物 速 度 卷 軸 100 % 15 , 000 , 000 3000 , 000 2026 / 10 / 11", TODAY),
    { tradedAt: "2026-10-11", price: 15000000, unitPrice: 3000000, qty: 5, attrs: null, flags: [] });
});

test("有 x5 就用寫的數量", () => {
  const t = parseRow("日 之 鏢 x5 1,500,000 300,000 2026/10/12", TODAY);
  assert.equal(t.qty, 5);
  assert.equal(t.unitPrice, 300000);
});

test("裝備屬性：辨識錯字（魔法攻力）也對到魔法攻擊力", () => {
  const t = parseRow("黃 色 雨 傘 魔 法 攻 力 + 48 3 , 850 , 000 2026 / 10 / 11", TODAY);
  assert.deepEqual(t.attrs, { "魔法攻擊力": 48 });
  assert.equal(t.price, 3850000);
});

test("短屬性名不被品名吃掉：攻擊力", () => {
  const t = parseRow("黃 色 雨 傘 攻 擊 力 + 5 1,000,000 2026/10/12", TODAY);
  assert.deepEqual(t.attrs, { "攻擊力": 5 });
  assert.equal(t.price, 1000000);
});

test("短屬性名不被品名吃掉：力量", () => {
  const t = parseRow("黃色雨傘 力量 +5 1,000,000 2026/10/12", TODAY);
  assert.deepEqual(t.attrs, { "力量": 5 });
  assert.equal(t.price, 1000000);
});

test("磨法攻擊力（首字誤讀）還是對到魔法攻擊力", () => {
  const t = parseRow("黃色雨傘 磨法攻擊力+48 3,850,000 2026/10/11", TODAY);
  assert.deepEqual(t.attrs, { "魔法攻擊力": 48 });
  assert.equal(t.price, 3850000);
});

test("讀到屬性但認不出的話標黃", () => {
  const t = parseRow("黃色雨傘 嗚嗚+3 1,000,000 2026/10/12", TODAY);
  assert.equal(t.attrs, null);
  assert.equal(t.price, 1000000);
  assert.match(t.flags[0] ?? "", /讀到屬性但認不出是哪一項/);
});

test("只有月/日：今年；比今天晚就算去年", () => {
  assert.equal(parseRow("雷之鏢 350,000 10/12", TODAY).tradedAt, "2026-10-12");
  assert.equal(parseRow("雷之鏢 350,000 12/30", TODAY).tradedAt, "2025-12-30");
});

test("時間拿掉不當價格", () => {
  assert.equal(parseRow("雷之鏢 350,000 2026/10/12 14:35", TODAY).price, 350000);
});

test("沒有日期或沒有數字的行不是成交", () => {
  assert.equal(parseRow("市 價 搜 尋", TODAY), null);
  assert.equal(parseRow("2026/10/12", TODAY), null);
});

test("三個以上數字：分不出來，價格留空並標原因", () => {
  const t = parseRow("雷之鏢 100 200 300 2026/10/12", TODAY);
  assert.equal(t.price, null);
  assert.match(t.flags[0], /3 個數字/);
});

test("rowsOf 照高度把字排成列，同一列照左到右", () => {
  const ocr = { width: 10, height: 10, meanLuma: 100, stdLuma: 30, lines: [
    { text: "b", words: [{ text: "B", x: 50, y: 101, w: 10, h: 16 }] },
    { text: "a", words: [{ text: "A", x: 10, y: 100, w: 10, h: 16 }, { text: "C", x: 10, y: 140, w: 10, h: 16 }] },
  ] };
  assert.deepEqual(rowsOf(ocr).map(r => r.text), ["A B", "C"]);
});

test("isBlack：整張很暗又幾乎沒變化", () => {
  assert.equal(isBlack({ meanLuma: 5, stdLuma: 1 }), true);
  assert.equal(isBlack({ meanLuma: 120, stdLuma: 40 }), false);
});

test("parseShot：正常的市價頁讀出每一筆，帶位置", () => {
  const ocr = fakeOcr([
    ["楓", "之", "谷", "拍", "賣"], ["市", "價"],
    ["手", "套", "攻", "鑿", "卷", "軸", "10", "%", "1,320,000", "2026/10/12"],
    ["手", "套", "攻", "擊", "卷", "軸", "10", "%", "1,280,000", "2026/10/11"],
  ]);
  const r = parseShot(ocr, { item: "手套攻擊卷軸10%", today: TODAY });
  assert.equal(r.kind, "ok");
  assert.deepEqual(r.trades.map(t => t.unitPrice), [1320000, 1280000]);
  assert.equal(r.trades[0].box.y, 160);
});

test("parseShot：黑畫面、不是市價頁、品名對不上、沒讀到價格", () => {
  assert.equal(parseShot(fakeOcr([], { meanLuma: 3, stdLuma: 1 }), { item: "日之鏢", today: TODAY }).kind, "black");
  assert.equal(parseShot(fakeOcr([["背", "包"]]), { item: "日之鏢", today: TODAY }).kind, "not-auction");
  const wrong = parseShot(fakeOcr([["市", "價"], ["雷", "之", "鏢", "350,000", "2026/10/12"]]), { item: "日之鏢", today: TODAY });
  assert.equal(wrong.kind, "wrong-item");
  assert.equal(wrong.reason, "對不上，請重截");
  assert.equal(parseShot(fakeOcr([["市", "價"], ["日", "之", "鏢"]]), { item: "日之鏢", today: TODAY }).kind, "empty");
});
