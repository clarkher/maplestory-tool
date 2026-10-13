// 拍賣價資料檔：price-data 分支的 auction/scania.json（雪吉拉）。去重鍵＝品名＋價格（總價）＋交易日期＋屬性（spec 原文）
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { attrKey } from "./stats.mjs";
import { isRealDate } from "./list.mjs";

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

/**
 * 去重鍵。價格讀不到（null）的幾列，品名＋日期一樣但其實是不同列，
 * 所以再加「哪張截圖」跟「那列在圖上的高度」：同一張圖同一列才算重複，不同列、不同截圖各算各的。
 */
export const tradeKey = t => {
  const parts = [t.item, t.price, t.tradedAt, attrKey(t.attrs)];
  if (t.price == null) parts.push(t.shot ?? "", t.box?.y ?? "");
  return parts.join("|");
};

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
    rec.ocrKey = k; // 辨識當下讀到的原始值的鍵；之後被改或刪，都用它記住「這個讀法不要再收」
    keys.add(k);
    data.trades.push(rec);
    added.push(rec.id);
  }
  if (added.length > 0) data.updatedAt = recordedAt;
  return { added, skipped };
}

const byId = (data, id) => data.trades.find(t => t.id === id);
const posInt = n => Number.isInteger(n) && n > 0;
const remember = (data, key) => { if (!data.rejected.includes(key)) data.rejected.push(key); };

export function confirmTrade(data, id) {
  const t = byId(data, id);
  if (!t) return false;
  // 單價要是正整數才能確認
  if (!posInt(t.unitPrice)) return false;
  // 總價、單價、數量三個都有的話，要對得起來才能確認（不然旗子一清，錯的數字就進中間價）
  if (t.price != null && t.qty != null && t.unitPrice * t.qty !== t.price) return false;
  t.status = "ok";
  t.flags = [];
  return true;
}

export function deleteTrade(data, id) {
  const i = data.trades.findIndex(t => t.id === id);
  if (i < 0) return false;
  const rec = data.trades[i];
  if (!data.rejected) data.rejected = [];
  // 原始讀值跟目前的值（改過再刪的話兩個不同）都記住，哪個讀法下次來都不再收
  remember(data, rec.ocrKey ?? tradeKey(rec));
  remember(data, tradeKey(rec));
  data.trades.splice(i, 1);
  return true;
}

/** 使用者看截圖改數字；改完算確認過 */
export function editTrade(data, id, patch) {
  const t = byId(data, id);
  if (!t) return false;
  if (!data.rejected) data.rejected = [];
  // 在動任何欄位之前先算好「原始讀值」的鍵（沒存 ocrKey 的舊資料，改完再算就變成新值的鍵了）
  const ocrKey = t.ocrKey ?? tradeKey(t);

  // 步驟 1：只檢查 patch 裡有給的欄位
  for (const k of ["price", "unitPrice", "qty"]) {
    if (k in patch && !posInt(patch[k])) return false;
  }
  if ("tradedAt" in patch && !isRealDate(patch.tradedAt)) return false;

  // 步驟 2：候選值＝原本的值，被 patch 蓋過
  const candidate = {
    price: t.price,
    unitPrice: t.unitPrice,
    qty: t.qty,
    tradedAt: t.tradedAt,
  };
  for (const k of ["price", "unitPrice", "qty", "tradedAt"]) {
    if (k in patch) candidate[k] = patch[k];
  }

  // 步驟 3：缺的欄位照順序補
  // 只改了總價（沒給單價）、數量是正整數 → 單價＝總價÷數量（要整除）
  if ("price" in patch && !("unitPrice" in patch) && posInt(candidate.qty)) {
    const calc = candidate.price / candidate.qty;
    if (!Number.isInteger(calc)) return false;
    candidate.unitPrice = calc;
  }
  // 只改了單價（沒給總價）、數量是正整數 → 總價＝單價×數量
  else if ("unitPrice" in patch && !("price" in patch) && posInt(candidate.qty)) {
    candidate.price = candidate.unitPrice * candidate.qty;
  }

  // 單價還是空的，總價跟數量都是正整數 → 單價＝總價÷數量
  if (candidate.unitPrice === null || candidate.unitPrice === undefined) {
    if (posInt(candidate.price) && posInt(candidate.qty)) {
      const calc = candidate.price / candidate.qty;
      if (!Number.isInteger(calc)) return false;
      candidate.unitPrice = calc;
    }
  }

  // 總價還是空的，單價跟數量都是正整數 → 總價＝單價×數量
  if (candidate.price === null || candidate.price === undefined) {
    if (posInt(candidate.unitPrice) && posInt(candidate.qty)) {
      candidate.price = candidate.unitPrice * candidate.qty;
    }
  }

  // 數量還是空的，總價跟單價都是正整數 → 數量＝總價÷單價（要整除）
  if (candidate.qty === null || candidate.qty === undefined) {
    if (posInt(candidate.price) && posInt(candidate.unitPrice)) {
      const calc = candidate.price / candidate.unitPrice;
      if (!Number.isInteger(calc)) return false;
      candidate.qty = calc;
    }
  }

  // 步驟 4：最後檢查——三個都要是正整數而且對得起來
  if (!posInt(candidate.price) || !posInt(candidate.unitPrice) || !posInt(candidate.qty)) return false;
  if (candidate.unitPrice * candidate.qty !== candidate.price) return false;

  // 步驟 5：改完的鍵撞到別筆 → 併掉（這筆刪掉、原始讀值記起來）
  const newKey = tradeKey({ ...t, price: candidate.price, tradedAt: candidate.tradedAt });
  const collision = data.trades.find(tr => tr.id !== id && tradeKey(tr) === newKey);
  if (collision) {
    remember(data, ocrKey);
    data.trades.splice(data.trades.indexOf(t), 1);
    return true;
  }

  // 套用到記錄
  t.price = candidate.price;
  t.unitPrice = candidate.unitPrice;
  t.qty = candidate.qty;
  t.tradedAt = candidate.tradedAt;
  t.status = "ok";
  t.flags = [];
  t.edited = true;
  if (!t.ocrKey) t.ocrKey = ocrKey; // 舊資料補上，之後再刪也找得到原始讀值

  // 記住這個原始讀法被改過，同一張圖再讀到不會又加回來
  remember(data, ocrKey);

  return true;
}
