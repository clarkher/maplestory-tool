// 拍賣價資料檔：price-data 分支的 auction/scania.json（雪吉拉）。去重鍵＝品名＋價格（總價）＋交易日期＋屬性（spec 原文）
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { attrKey } from "./stats.mjs";

export const DATA_REL = "auction/scania.json";

export const emptyData = () => ({ server: "雪吉拉", updatedAt: null, trades: [] });

export function loadData(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data.rejected) data.rejected = [];
    return data;
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
  if (!data.rejected) data.rejected = [];
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
    if (keys.has(k) || data.rejected.includes(k)) { skipped++; continue; }
    rec.ocrKey = k;
    keys.add(k);
    data.trades.push(rec);
    added.push(rec.id);
  }
  if (added.length > 0) data.updatedAt = recordedAt;
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
  const rec = data.trades[i];
  if (!data.rejected) data.rejected = [];
  if (!data.rejected.includes(rec.ocrKey)) data.rejected.push(rec.ocrKey);
  data.trades.splice(i, 1);
  return true;
}

const posInt = n => Number.isInteger(n) && n > 0;

/** 使用者看截圖改數字；改完算確認過 */
export function editTrade(data, id, patch) {
  const t = byId(data, id);
  if (!t) return false;
  if (!data.rejected) data.rejected = [];

  // Build candidate with proposed changes
  const candidate = {
    price: t.price,
    unitPrice: t.unitPrice,
    qty: t.qty,
    tradedAt: t.tradedAt,
  };

  // Apply patch to candidate
  for (const k of ["price", "unitPrice", "qty", "tradedAt"]) if (k in patch) candidate[k] = patch[k];

  // Validate numeric fields
  for (const k of ["price", "unitPrice", "qty"]) if (!posInt(candidate[k])) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.tradedAt)) return false;

  // Auto-calculate price or unitPrice if only one is specified
  if ("price" in patch && !("unitPrice" in patch)) {
    if (!posInt(candidate.qty)) return false;
    const calc = candidate.price / candidate.qty;
    if (!Number.isInteger(calc)) return false;
    candidate.unitPrice = calc;
  } else if ("unitPrice" in patch && !("price" in patch)) {
    if (!posInt(candidate.qty)) return false;
    candidate.price = candidate.unitPrice * candidate.qty;
  }

  // Final validation: price, unitPrice, qty all present and consistent
  if (!posInt(candidate.price) || !posInt(candidate.unitPrice) || !posInt(candidate.qty)) return false;
  if (candidate.unitPrice * candidate.qty !== candidate.price) return false;

  // Check for collision with existing record (different id)
  const newKey = [t.item, candidate.price, candidate.tradedAt, attrKey(t.attrs)].join("|");
  const collision = data.trades.find(tr => tr.id !== id && tradeKey(tr) === newKey);
  if (collision) {
    // Merge: remove edited record and track its original key
    const originalKey = t.ocrKey;
    if (!data.rejected.includes(originalKey)) data.rejected.push(originalKey);
    data.trades.splice(data.trades.indexOf(t), 1);
    return true;
  }

  // Apply changes to record
  t.price = candidate.price;
  t.unitPrice = candidate.unitPrice;
  t.qty = candidate.qty;
  t.tradedAt = candidate.tradedAt;
  t.status = "ok";
  t.flags = [];
  t.edited = true;

  // Track that this reading was edited
  if (!data.rejected.includes(t.ocrKey)) data.rejected.push(t.ocrKey);

  return true;
}
