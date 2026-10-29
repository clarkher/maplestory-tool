// src/lib/speed/potions.ts
import type { Frame } from "./frame";
import { iconOf } from "./quickslot";
import { QUICKSLOT_FONT } from "./quickslot-font";
import type { Item } from "../types";

/** 格子大小（跟 quickslot.ts 的格子一樣：寬 32、高 30） */
const SLOT_W = 32;
const SLOT_H = 30;

/**
 * 把道具圖示放進一個空白（全透明）的格子再縮成 16×16 RGBA，跟 readQuickslot 讀出來的 icon 同一套縮法（iconOf）。
 * 擺法照遊戲格子：水平置中、貼齊格子底部（比格子大的切掉）。沒蓋到的地方 alpha 是 0，matchPotion 只比圖示有畫到的點。
 */
export function refIconOf(icon: Frame, dx = 0, dy = 0): Uint8ClampedArray {
  const data = new Uint8ClampedArray(SLOT_W * SLOT_H * 4);
  const left = Math.floor((SLOT_W - icon.width) / 2) + dx;
  const top = SLOT_H - icon.height + dy;
  for (let y = 0; y < icon.height; y++) {
    for (let x = 0; x < icon.width; x++) {
      const fx = left + x;
      const fy = top + y;
      if (fx < 0 || fx >= SLOT_W || fy < 0 || fy >= SLOT_H) continue;
      const s = (y * icon.width + x) * 4;
      data.set(icon.data.subarray(s, s + 4), (fy * SLOT_W + fx) * 4);
    }
  }
  return iconOf({ width: SLOT_W, height: SLOT_H, data }, { x: 0, y: 0, w: SLOT_W, h: SLOT_H })!;
}

/** 參考圖示要夠不透明才拿來比（縮小後 alpha 低的邊緣是混了透明的顏色，不可靠） */
const MIN_ALPHA = 200;
/** 比的時候只留最像的這一成數（圖示邊緣、數字邊緣的點會差比較多） */
const KEEP = 0.8;
/** 參考圖示有畫到、而且沒被蓋住的點少於這個數就不比（回 Infinity） */
const MIN_POINTS = 25;
/** 格子上緣的按鍵名（Shift、Ins、Pup…）蓋住的列：16×16 的第 0～4 列（約格子上緣 10 格）不比 */
const LABEL_ROWS = 5;
/** 數量的字從格子左緣、第 9 列（格子上緣往下 18 格）起蓋住圖示 */
const DIGIT_ROW = 9;

/**
 * 真截圖裡圖示不是剛好置中貼底：站上圖示是裁掉透明邊的小圖，遊戲格子裡的位置差 1～3 格，量法見 potions.test.ts。
 * 每個參考圖示預先擺 (2×SHIFT+1)² 種位置，比的時候取最像的那種。
 */
const SHIFT = 2;

/** 一個參考圖示：編號跟它擺在不同位置縮出來的 16×16 RGBA 們 */
export type PotionRef = { id: number; icons: Uint8ClampedArray[] };

/** 站上道具圖示（RGBA）做成參考：置中貼底為基準，上下左右各挪 SHIFT 格內的每一種位置 */
export function potionRefOf(id: number, icon: Frame): PotionRef {
  const icons: Uint8ClampedArray[] = [];
  for (let dy = -SHIFT; dy <= SHIFT; dy++) for (let dx = -SHIFT; dx <= SHIFT; dx++) icons.push(refIconOf(icon, dx, dy));
  return { id, icons };
}

/** 數量的字蓋住 16×16 裡左邊幾欄（字寬照客戶端數字點陣字，字跟字不重疊，貼格子左緣） */
export function digitCells(count: number | null): number {
  if (count === null) return 0;
  let w = 0;
  for (const ch of String(count)) w += QUICKSLOT_FONT[ch]?.[0].length ?? 0;
  return Math.ceil(w / 2) + 1;
}

/**
 * 認得藥水的門檻：格子圖示跟參考圖示的差（0～255 的色差，見 iconDistance）。
 * 2026-10-29 量的（potions.test.ts 會印）：真截圖（window-1364.png）認對的格子最大差 11.4（藍色藥水，圖糊）、其他 3.6～5.6，
 * 技能格最小差 28.4；合成畫面（紅橘白藍四種、兩種底色、有無數字）認錯的最小差 22.3。門檻放在認對最大跟認錯最小的中間偏前，寧可認不出也不認錯。
 */
export const POTION_MAX_DISTANCE = 16;

/**
 * 格子圖示跟一個參考圖示（某個位置）的差：只比參考圖示有畫到的點、扣掉按鍵名那幾列跟數字蓋住的地方，
 * 每個點取 RGB 差的平均，留最像的 KEEP 比例求平均。長度不是 16×16×4 回 Infinity。
 */
export function iconDistance(icon: Uint8ClampedArray, ref: Uint8ClampedArray, digits = 0): number {
  if (icon.length !== 16 * 16 * 4 || ref.length !== 16 * 16 * 4) return Infinity;
  const diffs: number[] = [];
  for (let y = LABEL_ROWS; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (y >= DIGIT_ROW && x < digits) continue;
      const i = (y * 16 + x) * 4;
      if (ref[i + 3] < MIN_ALPHA) continue;
      let sum = 0;
      for (let c = 0; c < 3; c++) sum += Math.abs(icon[i + c] - ref[i + c]);
      diffs.push(sum / 3);
    }
  }
  if (diffs.length < MIN_POINTS) return Infinity;
  diffs.sort((a, b) => a - b);
  const n = Math.ceil(diffs.length * KEEP);
  return diffs.slice(0, n).reduce((a, b) => a + b, 0) / n;
}

/** 一個參考的最小差（每種位置都試） */
export function refDistance(icon: Uint8ClampedArray, ref: PotionRef, count: number | null = null): number {
  const digits = digitCells(count);
  let best = Infinity;
  for (const variant of ref.icons) best = Math.min(best, iconDistance(icon, variant, digits));
  return best;
}

/** 差距在這個範圍內算一樣像（圖示長得一樣的幾個道具，距離會一模一樣） */
const TIE_EPSILON = 0.05;

/**
 * 格子圖示是哪一種藥水（count＝這格讀到的數量，數字蓋住的地方不比）：差不超過門檻、而且最像的才算；其他回 null。
 * 站上有些道具圖示長得一樣（藍色藥水＝藍色濃縮藥水、三種香水…），最像的並列時全部回傳（ids 由小到大），不硬猜是哪一個。
 */
export function matchPotion(icon: Uint8ClampedArray, refs: PotionRef[], count: number | null = null): { ids: number[] } | null {
  const scored = refs.map(ref => ({ id: ref.id, d: refDistance(icon, ref, count) }));
  const best = Math.min(POTION_MAX_DISTANCE, ...scored.map(x => x.d));
  if (!scored.some(x => x.d <= POTION_MAX_DISTANCE)) return null;
  const ids = scored.filter(x => x.d <= best + TIE_EPSILON).map(x => x.id).sort((a, b) => a - b);
  return { ids };
}

/** 一格的道具鍵：只有一種就是編號，長得一樣的好幾種就是由小到大的編號用逗號接起來（同一格同一組才算同一種） */
export type PotionKey = number | string;
export const potionKey = (ids: number[]): PotionKey => (ids.length === 1 ? ids[0] : [...ids].sort((a, b) => a - b).join(","));
export const keyIds = (key: PotionKey): number[] => (typeof key === "number" ? [key] : key.split(",").map(Number));

export type PotionSlot = {
  itemId: PotionKey;
  startCount: number;
  lastCount: number;
  used: number;
  restocked: boolean;
  /** 一次掉太多、被當讀錯擋下的新數字，跟連續讀到幾次（連續 DROP_REBASE 次一樣就當真的，見 nextPotions） */
  drop?: { count: number; reads: number };
  /** 中間有一段（一次掉超過 MAX_DROP、後來一直是新數字）沒算進用量：數字照新的接著算，但那一段用了多少不知道 */
  skipped?: boolean;
};
/** pending＝這格新讀到、還沒連續讀到兩次的數量（讀錯一次不算） */
export type PotionTrack = { slots: Record<number, PotionSlot>; pending?: Record<number, { itemId: PotionKey; count: number }> };

/** 一次減這麼多以上當讀錯（例 702 被讀成 70），不算用量 */
export const MAX_DROP = 50;
/** 被擋下的大跌幅，同一個新數字連續讀到這麼多次（含擋下那次）就當真的：從新數字重新起算、標 skipped */
export const DROP_REBASE = 4;

/**
 * 吃一輪讀到的快捷鍵。數量要「同一格同一個數字連續讀到兩次」才採用（最後一位被蓋住時 702 會讀成 70，不能信單次）：
 * - 第一次見到某格（或藥水種類換了）：兩次一樣就重開，startCount＝lastCount＝那個數字
 * - 同格同種：採用的新數字比 lastCount 小就把差加到 used；大就標 restocked、從新數字接著算；
 *   一次減超過 MAX_DROP 先當讀錯、不採用；但同一個新數字連續讀到 DROP_REBASE 次就當真的（例：換了一組藥水、丟掉一堆）：
 *   lastCount 改成新數字、不加進 used、標 skipped（那一段用量算不出來）
 * - itemId 或 count 是 null：這輪跳過（待確認的也清掉）
 */
export function nextPotions(
  t: PotionTrack,
  reads: { index: number; itemId: PotionKey | null; count: number | null }[],
): PotionTrack {
  const slots = { ...t.slots };
  const pending = { ...(t.pending ?? {}) };
  for (const { index, itemId, count } of reads) {
    if (itemId === null || count === null) {
      delete pending[index];
      continue;
    }
    const slot = slots[index];
    const waiting = pending[index];
    // 跟已採用的一樣：沒事，待確認的也清掉
    if (slot && slot.itemId === itemId && slot.lastCount === count) {
      delete pending[index];
      if (slot.drop) slots[index] = { ...slot, drop: undefined };
      continue;
    }
    // 要連續兩次一樣才採用
    if (!waiting || waiting.itemId !== itemId || waiting.count !== count) {
      pending[index] = { itemId, count };
      if (slot?.drop && slot.drop.count !== count) slots[index] = { ...slot, drop: undefined };
      continue;
    }
    if (!slot || slot.itemId !== itemId) {
      delete pending[index];
      slots[index] = { itemId, startCount: count, lastCount: count, used: 0, restocked: false };
    } else if (count < slot.lastCount) {
      if (slot.lastCount - count > MAX_DROP) {
        // 先當讀錯；待確認的留著，之後每讀到一樣的就多算一次
        const reads = slot.drop?.count === count ? slot.drop.reads + 1 : 1;
        if (reads >= DROP_REBASE) {
          delete pending[index];
          slots[index] = { ...slot, lastCount: count, drop: undefined, skipped: true };
        } else slots[index] = { ...slot, drop: { count, reads } };
        continue;
      }
      delete pending[index];
      slots[index] = { ...slot, lastCount: count, drop: undefined, used: slot.used + (slot.lastCount - count) };
    } else {
      delete pending[index];
      slots[index] = { ...slot, lastCount: count, drop: undefined, restocked: true };
    }
  }
  return { slots, pending };
}

/** itemId＝道具鍵（見 potionKey）、ids＝可能是哪些道具（長得一樣的好幾種時不只一個）；每個編號的單價不同就 meso10 是 null */
export type PotionUse = { itemId: PotionKey; ids: number[]; per10: number; meso10: number | null };

/** 同種藥水多格合併；每 10 分鐘用量＝used ÷ 分鐘 × 10，用量 0 的不列；minutes ≤ 0 回空 */
export function potionSummary(
  t: PotionTrack,
  minutes: number,
  price: (id: number) => number | null,
): { uses: PotionUse[]; restocked: boolean; uncounted: boolean } {
  const restocked = Object.values(t.slots).some(s => s.restocked);
  const uncounted = Object.values(t.slots).some(s => s.skipped);
  if (!(minutes > 0)) return { uses: [], restocked, uncounted };
  const used = new Map<PotionKey, number>();
  for (const s of Object.values(t.slots)) if (s.used > 0) used.set(s.itemId, (used.get(s.itemId) ?? 0) + s.used);
  const uses = [...used].map(([itemId, n]) => {
    const per10 = (n / minutes) * 10;
    const ids = keyIds(itemId);
    const prices = ids.map(price);
    const p = prices[0] !== null && prices.every(x => x === prices[0]) ? prices[0] : null;
    return { itemId, ids, per10, meso10: p === null ? null : per10 * p };
  });
  return { uses, restocked, uncounted };
}

/** 一組幾個的店，單價＝標價 ÷ 組數 */
const unitPrice = (shop: NonNullable<Item["sp"]>[number]) => shop.pr / (shop.k ?? 1);

/**
 * 藥水單價：NPC 常駐楓幣店最低價（跟 /plan/buy 同規則：商城樂豆點 c、活動幣 u、限時 e 的店都不算），沒有回 null。
 * items 傳 loadItems() 的結果（頁面本來就載了），不另外產檔。
 */
export function potionPriceFn(items: readonly Item[]): (id: number) => number | null {
  const byId = new Map(items.map(item => [item.id, item]));
  return id => {
    const prices = (byId.get(id)?.sp ?? []).filter(s => !s.c && !s.u && !s.e).map(unitPrice);
    return prices.length ? Math.min(...prices) : null;
  };
}
