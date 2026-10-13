// 拍賣價資料檔：price-data 分支的 auction/scania.json（雪吉拉）。去重鍵＝品名＋價格（總價）＋交易日期＋屬性（spec 原文）
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { attrKey } from "./stats.mjs";

export const DATA_REL = "auction/scania.json";

export const emptyData = () => ({ server: "雪吉拉", updatedAt: null, trades: [] });

export function loadData(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return emptyData();
    throw e;
  }
}

export function saveData(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1) + "\n");
  fs.renameSync(tmp, file);
}

export const tradeKey = t => [t.item, t.price, t.tradedAt, attrKey(t.attrs)].join("|");

/** 加進資料；重複的跳過。有旗子的存成 review（黃色，等使用者看），沒旗子的 ok */
export function addTrades(data, trades, { item, shot, recordedAt }) {
  const keys = new Set(data.trades.map(tradeKey));
  const added = [];
  let skipped = 0;
  for (const t of trades) {
    const rec = {
      id: crypto.randomUUID(), item,
      price: t.price, unitPrice: t.unitPrice, qty: t.qty, tradedAt: t.tradedAt, attrs: t.attrs ?? null,
      flags: t.flags ?? [], status: t.flags?.length ? "review" : "ok",
      shot, box: t.box ?? null, recordedAt,
    };
    const k = tradeKey(rec);
    if (keys.has(k)) { skipped++; continue; }
    keys.add(k);
    data.trades.push(rec);
    added.push(rec.id);
  }
  data.updatedAt = recordedAt;
  return { added, skipped };
}

const byId = (data, id) => data.trades.find(t => t.id === id);

export function confirmTrade(data, id) {
  const t = byId(data, id);
  if (!t) return false;
  t.status = "ok";
  t.flags = [];
  return true;
}

export function deleteTrade(data, id) {
  const i = data.trades.findIndex(t => t.id === id);
  if (i < 0) return false;
  data.trades.splice(i, 1);
  return true;
}

const posInt = n => Number.isInteger(n) && n > 0;

/** 使用者看截圖改數字；改完算確認過 */
export function editTrade(data, id, patch) {
  const t = byId(data, id);
  if (!t) return false;
  for (const k of ["price", "unitPrice", "qty"]) if (k in patch && !posInt(patch[k])) return false;
  if ("tradedAt" in patch && !/^\d{4}-\d{2}-\d{2}$/.test(patch.tradedAt)) return false;
  for (const k of ["price", "unitPrice", "qty", "tradedAt"]) if (k in patch) t[k] = patch[k];
  t.status = "ok";
  t.flags = [];
  t.edited = true;
  return true;
}
