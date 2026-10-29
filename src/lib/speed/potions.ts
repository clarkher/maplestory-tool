// src/lib/speed/potions.ts
import type { Frame } from "./frame";
import { iconOf } from "./quickslot";
import type { Item } from "../types";

/** 格子大小（跟 quickslot.ts 的格子一樣：寬 32、高 30） */
const SLOT_W = 32;
const SLOT_H = 30;

/**
 * 把道具圖示放進一個空白（全透明）的格子再縮成 16×16 RGBA，跟 readQuickslot 讀出來的 icon 同一套縮法（iconOf）。
 * 擺法照遊戲格子：水平置中、貼齊格子底部（比格子大的切掉）。沒蓋到的地方 alpha 是 0，matchPotion 只比圖示有畫到的點。
 */
export function refIconOf(icon: Frame): Uint8ClampedArray {
  const data = new Uint8ClampedArray(SLOT_W * SLOT_H * 4);
  const left = Math.floor((SLOT_W - icon.width) / 2);
  const top = SLOT_H - icon.height;
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
/** 比的時候只留最像的這一成數（數字壓在圖示下緣，會蓋掉一些點） */
const KEEP = 0.7;
/** 參考圖示有畫到的點少於這個數就不比（回 Infinity） */
const MIN_POINTS = 20;
/**
 * 認得藥水的門檻：圖示有畫到的點、最像的 70% 平均每個顏色差多少（0～255）。
 * 2026-10-29 合成畫面量的：自己比自己 0（真實截圖會有縮放雜訊，留餘地）、紅橘白藍互比最小 15.5，取 10 偏嚴（寧可認不出也不認錯）。
 */
export const POTION_MAX_DISTANCE = 10;

/** 格子圖示跟參考圖示的差：只比參考圖示有畫到的點，每個點取 RGB 差的平均，留最像的 KEEP 比例求平均 */
export function iconDistance(icon: Uint8ClampedArray, ref: Uint8ClampedArray): number {
  const diffs: number[] = [];
  for (let i = 0; i < 16 * 16; i++) {
    if (ref[i * 4 + 3] < MIN_ALPHA) continue;
    let sum = 0;
    for (let c = 0; c < 3; c++) sum += Math.abs(icon[i * 4 + c] - ref[i * 4 + c]);
    diffs.push(sum / 3);
  }
  if (diffs.length < MIN_POINTS) return Infinity;
  diffs.sort((a, b) => a - b);
  const n = Math.ceil(diffs.length * KEEP);
  return diffs.slice(0, n).reduce((a, b) => a + b, 0) / n;
}

/** 格子圖示是哪一種藥水：最像、而且差不超過門檻的才回編號；其他回 null */
export function matchPotion(icon: Uint8ClampedArray, refs: { id: number; icon: Uint8ClampedArray }[]): number | null {
  let best: number | null = null;
  let bestDistance = POTION_MAX_DISTANCE;
  for (const ref of refs) {
    const d = iconDistance(icon, ref.icon);
    if (d <= bestDistance) {
      best = ref.id;
      bestDistance = d;
    }
  }
  return best;
}

export type PotionSlot = { itemId: number; startCount: number; lastCount: number; used: number; restocked: boolean };
/** pending＝這格新讀到、還沒連續讀到兩次的數量（讀錯一次不算） */
export type PotionTrack = { slots: Record<number, PotionSlot>; pending?: Record<number, { itemId: number; count: number }> };

/** 一次減這麼多以上當讀錯（例 702 被讀成 70），不算用量 */
export const MAX_DROP = 50;

/**
 * 吃一輪讀到的快捷鍵。數量要「同一格同一個數字連續讀到兩次」才採用（最後一位被蓋住時 702 會讀成 70，不能信單次）：
 * - 第一次見到某格（或藥水種類換了）：兩次一樣就重開，startCount＝lastCount＝那個數字
 * - 同格同種：採用的新數字比 lastCount 小就把差加到 used；大就標 restocked、從新數字接著算；一次減超過 MAX_DROP 當讀錯，不採用
 * - itemId 或 count 是 null：這輪跳過（待確認的也清掉）
 */
export function nextPotions(
  t: PotionTrack,
  reads: { index: number; itemId: number | null; count: number | null }[],
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
      continue;
    }
    // 要連續兩次一樣才採用
    if (!waiting || waiting.itemId !== itemId || waiting.count !== count) {
      pending[index] = { itemId, count };
      continue;
    }
    delete pending[index];
    if (!slot || slot.itemId !== itemId) {
      slots[index] = { itemId, startCount: count, lastCount: count, used: 0, restocked: false };
    } else if (count < slot.lastCount) {
      if (slot.lastCount - count > MAX_DROP) continue;
      slots[index] = { ...slot, lastCount: count, used: slot.used + (slot.lastCount - count) };
    } else {
      slots[index] = { ...slot, lastCount: count, restocked: true };
    }
  }
  return { slots, pending };
}

export type PotionUse = { itemId: number; per10: number; meso10: number | null };

/** 同種藥水多格合併；每 10 分鐘用量＝used ÷ 分鐘 × 10，用量 0 的不列；minutes ≤ 0 回空 */
export function potionSummary(
  t: PotionTrack,
  minutes: number,
  price: (id: number) => number | null,
): { uses: PotionUse[]; restocked: boolean } {
  const restocked = Object.values(t.slots).some(s => s.restocked);
  if (!(minutes > 0)) return { uses: [], restocked };
  const used = new Map<number, number>();
  for (const s of Object.values(t.slots)) if (s.used > 0) used.set(s.itemId, (used.get(s.itemId) ?? 0) + s.used);
  const uses = [...used].map(([itemId, n]) => {
    const per10 = (n / minutes) * 10;
    const p = price(itemId);
    return { itemId, per10, meso10: p === null ? null : per10 * p };
  });
  return { uses, restocked };
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
