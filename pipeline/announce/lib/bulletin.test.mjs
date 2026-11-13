import assert from "node:assert/strict";
import { test } from "node:test";
import { classify, fetchBulletins, newRows, readSeen, renderComment, writeSeen } from "./bulletin.mjs";

const row = (id, title, startDate = "2026/11/10") => ({ bullentinId: id, title, startDate });

test("分類：開機公告＝改版跟資料要看", () => {
  const c = classify("新楓之谷：經典版 《1105(四)V002覺醒與突破例行維護開機公告》");
  assert.equal(c.kind, "maintenance");
  assert.match(c.hint, /改版整理/);
});

test("分類：活動、特賣＝活動攻略跟活動店結束日", () => {
  assert.equal(classify("【萬聖節限定商品特賣】").kind, "event");
  assert.equal(classify("【2026 橘子週年慶｜Gama Island 探險】").kind, "event");
  assert.equal(classify("《新楓之谷》2026 楓潮派對").kind, "event");
});

test("分類：轉蛋、美容院、彗星、神秘商人＝商城外觀（紙娃娃）", () => {
  for (const t of ["【轉蛋券】小畫家椅、送子鸛椅", "【皇家美容院】星星閃亮&蝴蝶舞髮型", "【閃亮彗星】喵喵管家", "【神秘商人】玩偶之夢"]) {
    assert.equal(classify(t).kind, "cash", t);
  }
});

test("分類：制裁公告不通知", () => {
  assert.equal(classify("新楓之谷：經典版《1106(五)遊戲異常行為制裁公告》").kind, "skip");
});

test("分類：認不得的照樣通知", () => {
  assert.equal(classify("【重要】帳號安全宣導").kind, "other");
});

test("新公告：沒看過的才算，照 id 小到大", () => {
  const rows = [row("84174", "b"), row("84170", "a"), row("84149", "c")];
  assert.deepEqual(newRows(rows, new Set(["84149"])).map(r => r.bullentinId), ["84170", "84174"]);
});

test("看過的 id 藏在 issue 內文，讀寫來回一樣", () => {
  const body = writeSeen("說明文字", ["84170", "84149"]);
  assert.match(body, /^說明文字/);
  assert.deepEqual([...readSeen(body)].sort(), ["84149", "84170"]);
  // 改寫時換掉舊的那一段，不會越疊越多
  const again = writeSeen(body, ["1", "2"]);
  assert.deepEqual([...readSeen(again)].sort(), ["1", "2"]);
  assert.equal(again.match(/seen:/g).length, 1);
});

test("看過的 id 只留最近 300 個（id 大的）", () => {
  const ids = Array.from({ length: 400 }, (_, i) => String(80000 + i));
  const seen = readSeen(writeSeen("", ids));
  assert.equal(seen.size, 300);
  assert.ok(seen.has("80399"));
  assert.ok(!seen.has("80000"));
});

test("留言：每則有連結、日期、要看哪裡；制裁不列", () => {
  const text = renderComment([
    row("84149", "新楓之谷：經典版 《1105(四)V002覺醒與突破例行維護開機公告》", "2026/11/05"),
    row("84174", "新楓之谷：經典版《1106(五)遊戲異常行為制裁公告》"),
  ]);
  assert.match(text, /https:\/\/maplestoryclassic\.beanfun\.com\/bulletin\?Bid=84149/);
  assert.match(text, /2026\/11\/05/);
  assert.match(text, /改版整理/);
  assert.doesNotMatch(text, /制裁/);
});

test("留言：全部都不用通知時回空字串", () => {
  assert.equal(renderComment([row("1", "《遊戲異常行為制裁公告》")]), "");
});

test("fetchBulletins：請求帶逾時 signal", async () => {
  let init;
  const fetcher = async (_u, i) => { init = i; return { ok: true, json: async () => ({ data: { myDataSet: { table: [{ bullentinId: 1, title: "a", startDate: "2026/11/01" }] } } }) }; };
  await fetchBulletins({ fetcher });
  assert.ok(init.signal);
});
