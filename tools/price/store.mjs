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
  // Can't confirm if unitPrice is not a positive integer
  if (!posInt(t.unitPrice)) return false;
  t.status = "ok";
  t.flags = [];
  return true;
}

export function deleteTrade(data, id) {
  const i = data.trades.findIndex(t => t.id === id);
  if (i < 0) return false;
  const rec = data.trades[i];
  if (!data.rejected) data.rejected = [];
  const ocrKeyToTrack = rec.ocrKey ?? tradeKey(rec);
  if (!data.rejected.includes(ocrKeyToTrack)) data.rejected.push(ocrKeyToTrack);
  data.trades.splice(i, 1);
  return true;
}

const posInt = n => Number.isInteger(n) && n > 0;

/** 使用者看截圖改數字；改完算確認過 */
export function editTrade(data, id, patch) {
  const t = byId(data, id);
  if (!t) return false;
  if (!data.rejected) data.rejected = [];

  // Step 1: Validate only fields present in patch
  for (const k of ["price", "unitPrice", "qty"]) {
    if (k in patch && !posInt(patch[k])) return false;
  }
  if ("tradedAt" in patch && !/^\d{4}-\d{2}-\d{2}$/.test(patch.tradedAt)) return false;

  // Step 2: Build candidate with record fields overridden by patch
  const candidate = {
    price: t.price,
    unitPrice: t.unitPrice,
    qty: t.qty,
    tradedAt: t.tradedAt,
  };
  for (const k of ["price", "unitPrice", "qty", "tradedAt"]) {
    if (k in patch) candidate[k] = patch[k];
  }

  // Step 3: Auto-fill missing fields in specific order
  // If price patched, unitPrice not, qty is positive int → unitPrice = price/qty (must be integer)
  if ("price" in patch && !("unitPrice" in patch) && posInt(candidate.qty)) {
    const calc = candidate.price / candidate.qty;
    if (!Number.isInteger(calc)) return false;
    candidate.unitPrice = calc;
  }
  // If unitPrice patched, price not, qty is positive int → price = unitPrice * qty
  else if ("unitPrice" in patch && !("price" in patch) && posInt(candidate.qty)) {
    candidate.price = candidate.unitPrice * candidate.qty;
  }

  // If unitPrice still null/missing and price & qty are positive ints → unitPrice = price / qty
  if (candidate.unitPrice === null || candidate.unitPrice === undefined) {
    if (posInt(candidate.price) && posInt(candidate.qty)) {
      const calc = candidate.price / candidate.qty;
      if (!Number.isInteger(calc)) return false;
      candidate.unitPrice = calc;
    }
  }

  // If price still null/missing and unitPrice & qty are positive ints → price = unitPrice * qty
  if (candidate.price === null || candidate.price === undefined) {
    if (posInt(candidate.unitPrice) && posInt(candidate.qty)) {
      candidate.price = candidate.unitPrice * candidate.qty;
    }
  }

  // If qty still null/missing and price & unitPrice are positive ints → qty = price / unitPrice
  if (candidate.qty === null || candidate.qty === undefined) {
    if (posInt(candidate.price) && posInt(candidate.unitPrice)) {
      const calc = candidate.price / candidate.unitPrice;
      if (!Number.isInteger(calc)) return false;
      candidate.qty = calc;
    }
  }

  // Step 4: Final check - all must be positive integers and consistent
  if (!posInt(candidate.price) || !posInt(candidate.unitPrice) || !posInt(candidate.qty)) return false;
  if (candidate.unitPrice * candidate.qty !== candidate.price) return false;

  // Step 5: Check for collision with existing record
  const newKey = [t.item, candidate.price, candidate.tradedAt, attrKey(t.attrs)].join("|");
  const collision = data.trades.find(tr => tr.id !== id && tradeKey(tr) === newKey);
  if (collision) {
    // Merge: remove edited record and track its original key
    const ocrKeyToTrack = t.ocrKey ?? tradeKey(t);
    if (!data.rejected.includes(ocrKeyToTrack)) data.rejected.push(ocrKeyToTrack);
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
  const ocrKeyToTrack = t.ocrKey ?? tradeKey(t);
  if (!data.rejected.includes(ocrKeyToTrack)) data.rejected.push(ocrKeyToTrack);

  return true;
}
