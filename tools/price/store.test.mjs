import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { emptyData, loadData, saveData, addTrades, confirmTrade, deleteTrade, editTrade, tradeKey } from "./store.mjs";

const t = (o = {}) => ({ tradedAt: "2026-10-12", price: 1000, unitPrice: 1000, qty: 1, attrs: null, flags: [], box: { x: 1, y: 2, w: 3, h: 4 }, ...o });
const meta = { item: "日之鏢", shot: "a.png", recordedAt: "2026-10-13T21:00:00+08:00" };

test("檔案不存在就是空的；存了讀得回來", t2 => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "price-store-"));
  t2.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "auction", "scania.json");
  assert.deepEqual(loadData(file), emptyData());
  const d = emptyData();
  addTrades(d, [t()], meta);
  saveData(file, d);
  assert.equal(loadData(file).trades.length, 1);
  assert.equal(fs.existsSync(file + ".tmp"), false);
});

test("同品名＋價格＋交易日期＋屬性只留一筆", () => {
  const d = emptyData();
  assert.equal(addTrades(d, [t(), t()], meta).added.length, 1);
  const again = addTrades(d, [t(), t({ price: 2000, unitPrice: 2000 })], meta);
  assert.equal(again.added.length, 1);
  assert.equal(again.skipped, 1);
  assert.equal(d.updatedAt, meta.recordedAt);
});

test("有旗子的存成 review（黃色），沒旗子的 ok；欄位齊全", () => {
  const d = emptyData();
  addTrades(d, [t(), t({ price: 5, unitPrice: 5, flags: ["跟上次中間價差 5 倍以上"] })], meta);
  assert.deepEqual(d.trades.map(x => x.status), ["ok", "review"]);
  const rec = d.trades[0];
  assert.equal(rec.item, "日之鏢");
  assert.equal(rec.shot, "a.png");
  assert.deepEqual(rec.box, { x: 1, y: 2, w: 3, h: 4 });
  assert.match(rec.id, /^[0-9a-f-]{36}$/);
});

test("確認、改、刪", () => {
  const d = emptyData();
  addTrades(d, [t({ flags: ["x"] }), t({ price: 7, unitPrice: 7, flags: ["y"] }), t({ price: 9, unitPrice: 9 })], meta);
  const [a, b, c] = d.trades.map(x => x.id);
  assert.equal(confirmTrade(d, a), true);
  assert.equal(d.trades[0].status, "ok");
  assert.deepEqual(d.trades[0].flags, []);
  assert.equal(editTrade(d, b, { price: 70, unitPrice: 70 }), true);
  assert.deepEqual([d.trades[1].price, d.trades[1].status, d.trades[1].edited], [70, "ok", true]);
  assert.equal(editTrade(d, b, { price: -1 }), false, "價格要正整數");
  assert.equal(editTrade(d, b, { tradedAt: "10/12" }), false, "日期要 YYYY-MM-DD");
  assert.equal(deleteTrade(d, c), true);
  assert.equal(d.trades.length, 2);
  assert.equal(confirmTrade(d, "nope"), false);
});

test("tradeKey 屬性順序不影響", () => {
  assert.equal(tradeKey({ item: "a", price: 1, tradedAt: "d", attrs: { b: 1, a: 2 } }), tradeKey({ item: "a", price: 1, tradedAt: "d", attrs: { a: 2, b: 1 } }));
});
