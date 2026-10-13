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

test("改數字撞到既有一筆就併掉", () => {
  const d = emptyData();
  addTrades(d, [t({ price: 1000, unitPrice: 1000 }), t({ price: 7, unitPrice: 7, flags: ["yellow"] })], meta);
  const [id1, id2] = d.trades.map(x => x.id);
  const originalOcrKey = d.trades.find(r => r.id === id2).ocrKey;
  assert.equal(editTrade(d, id2, { price: 1000, unitPrice: 1000 }), true);
  assert.equal(d.trades.length, 1, "編輯記錄被併進既有一筆");
  assert.equal(d.trades[0].id, id1, "留下的是原本 1000 那筆");
  assert.deepEqual(d.rejected, [originalOcrKey]);
});

test("刪掉記住不再回來", () => {
  const d = emptyData();
  const trades = [t({ price: 100, unitPrice: 100 })];
  const res1 = addTrades(d, trades, meta);
  const key = d.trades[0].ocrKey;
  deleteTrade(d, d.trades[0].id);
  const res2 = addTrades(d, trades, meta);
  assert.equal(res2.added.length, 0);
  assert.equal(res2.skipped, 1);
  assert.deepEqual(d.rejected, [key]);
});

test("改過也記住", () => {
  const d = emptyData();
  const trades = [t({ price: 7, unitPrice: 7, flags: ["x"] })];
  addTrades(d, trades, meta);
  const originalKey = d.trades[0].ocrKey;
  editTrade(d, d.trades[0].id, { price: 70, unitPrice: 70 });
  const res = addTrades(d, trades, meta);
  assert.equal(res.added.length, 0, "原始讀值被拒");
  assert.equal(res.skipped, 1);
  assert(d.rejected.includes(originalKey));
});

test("只改總價就自動算單價", () => {
  const d = emptyData();
  addTrades(d, [t({ price: 100, unitPrice: 20, qty: 5 })], meta);
  const id = d.trades[0].id;
  assert.equal(editTrade(d, id, { price: 150 }), true);
  assert.equal(d.trades[0].price, 150);
  assert.equal(d.trades[0].unitPrice, 30, "自動算出 150/5");
  assert.equal(editTrade(d, id, { price: 151 }), false, "151/5 不是整數");
  assert.equal(d.trades[0].price, 150, "失敗時不改");
});

test("只改單價就自動算總價", () => {
  const d = emptyData();
  addTrades(d, [t({ price: 100, unitPrice: 20, qty: 5 })], meta);
  const id = d.trades[0].id;
  assert.equal(editTrade(d, id, { unitPrice: 40 }), true);
  assert.equal(d.trades[0].price, 200, "自動算出 40*5");
  assert.equal(d.trades[0].unitPrice, 40);
});

test("改失敗的話記錄不變", () => {
  const d = emptyData();
  addTrades(d, [t({ price: 100, unitPrice: 20, qty: 5 })], meta);
  const id = d.trades[0].id;
  const before = JSON.parse(JSON.stringify(d.trades[0]));
  assert.equal(editTrade(d, id, { price: -1 }), false);
  assert.deepEqual(d.trades[0], before, "欄位完全不變");
});

test("沒有交易加進來的話 updatedAt 不動", () => {
  const d = emptyData();
  addTrades(d, [t()], meta);
  const first = d.updatedAt;
  const newMeta = { ...meta, recordedAt: "2026-10-14T10:00:00+08:00" };
  addTrades(d, [t()], newMeta);
  assert.equal(d.updatedAt, first, "加 0 筆時 updatedAt 不改");
});

test("黃色那幾筆（單價空著）也改得了", () => {
  const d = emptyData();
  addTrades(d, [t({ price: 500, unitPrice: null, qty: 5 })], meta);
  const id = d.trades[0].id;
  assert.equal(editTrade(d, id, { price: 600 }), true);
  assert.equal(d.trades[0].price, 600);
  assert.equal(d.trades[0].unitPrice, 120, "自動算出 600/5");
});

test("黃色那幾筆（總價空著）也改得了", () => {
  const d = emptyData();
  addTrades(d, [t({ price: null, unitPrice: null, qty: 3 })], meta);
  const id = d.trades[0].id;
  assert.equal(editTrade(d, id, { unitPrice: 100 }), true);
  assert.equal(d.trades[0].unitPrice, 100);
  assert.equal(d.trades[0].price, 300, "自動算出 100*3");
});

test("黃色那幾筆（數量空著）也改得了", () => {
  const d = emptyData();
  addTrades(d, [t({ price: 100, unitPrice: 70, qty: null })], meta);
  const id = d.trades[0].id;
  assert.equal(editTrade(d, id, { price: 70, unitPrice: 70 }), true);
  assert.equal(d.trades[0].qty, 1, "自動算出 70/70");
  assert.equal(d.trades[0].price, 70);
  assert.equal(d.trades[0].unitPrice, 70);
});

test("黃色那幾筆不一致就真的改不了", () => {
  const d = emptyData();
  addTrades(d, [t({ price: 100, unitPrice: 70, qty: null })], meta);
  const id = d.trades[0].id;
  const before = JSON.parse(JSON.stringify(d.trades[0]));
  assert.equal(editTrade(d, id, { tradedAt: "2026-10-11" }), false, "只改日期但總單價不一致");
  assert.deepEqual(d.trades[0], before, "記錄完全不變");
});

test("確認時單價空著的話不能按", () => {
  const d = emptyData();
  addTrades(d, [t({ price: 500, unitPrice: null, qty: 5 })], meta);
  const id = d.trades[0].id;
  assert.equal(d.trades[0].status, "ok");
  assert.equal(confirmTrade(d, id), false, "unitPrice 空著不能確認");
  assert.equal(d.trades[0].status, "ok", "狀態沒動");
});

test("刪掉沒有 ocrKey 的記錄也記住", () => {
  const d = emptyData();
  addTrades(d, [t({ price: 100, unitPrice: 50, qty: 2 })], meta);
  const rec = d.trades[0];
  const manualOcrKey = tradeKey(rec);
  delete rec.ocrKey;
  assert.equal(deleteTrade(d, rec.id), true);
  assert(d.rejected.includes(manualOcrKey), "用 tradeKey() 補上");
});
