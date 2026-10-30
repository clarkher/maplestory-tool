// src/lib/speed/read-extras.ts
/**
 * 練功測速 v1.22 每張畫面多讀的：HP 比例（每張）、快捷鍵的數量跟藥水種類（每 SLOT_EVERY_MS 讀一次）。
 * 在讀畫面的地方跑（Worker；沒有 Worker 的退路是主執行緒），結果跟著讀數一起傳回頁面。
 * 認藥水很花時間（參考圖幾百個）：同一格圖示＋數量跟上次一模一樣就直接用上次的結果，有變就整池重認。
 */
import type { Frame } from "./frame";
import { hpRatio } from "./hp";
import { matchPotion, potionKey, potionRefOf, type PotionKey, type PotionRef } from "./potions";
import { readQuickslot } from "./quickslot";
import type { StatusBar } from "./status-bar";
import type { Item } from "../types";

/** 拿來比的消耗品小分類（認藥水門檻是用這一池量的，見 potions.test.ts） */
export const POTION_GROUPS = ["藥水", "食物", "狀態消耗", "特殊消耗"];
/**
 * 也放進比對池、但認出來就知道「不是藥水」的小分類：箭矢、飛鏢、子彈、回城（傳送卷軸）常放在快捷鍵上，
 * 不放進池子會變成「有數字卻認不出」；認出來之後藥水那邊整格跳過（不算錢、不列、不算讀不完整，見 nextPotions 的 other）
 */
export const NON_POTION_GROUPS = ["箭矢", "飛鏢", "子彈", "傳送卷軸"];
/** 快捷鍵多久讀一次（經驗照舊每秒） */
export const SLOT_EVERY_MS = 3000;

/** 要載哪些道具圖當參考：消耗品裡的 POTION_GROUPS 跟 NON_POTION_GROUPS，由小到大 */
export function potionPoolIds(items: Iterable<Item>): number[] {
  const ids: number[] = [];
  for (const item of items) if (item.c === "消耗" && (POTION_GROUPS.includes(item.s ?? "") || NON_POTION_GROUPS.includes(item.s ?? ""))) ids.push(item.id);
  return ids.sort((a, b) => a - b);
}

/** 比對池裡「不是藥水」的那些編號（NON_POTION_GROUPS） */
export function nonPotionIds(items: Iterable<Item>): Set<number> {
  const ids = new Set<number>();
  for (const item of items) if (item.c === "消耗" && NON_POTION_GROUPS.includes(item.s ?? "")) ids.add(item.id);
  return ids;
}

/** 讀到的快捷鍵換成藥水追蹤吃的格式：認出來全是「不是藥水」的（箭矢、回城…）標 other，整格跳過 */
export function slotReads(slots: SlotSeen[], nonPotion: ReadonlySet<number>): { index: number; itemId: PotionKey | null; count: number | null; other?: boolean }[] {
  return slots.map(slot =>
    slot.ids && slot.ids.length && slot.ids.every(id => nonPotion.has(id))
      ? { index: slot.index, itemId: null, count: slot.count, other: true }
      : { index: slot.index, itemId: slot.ids ? potionKey(slot.ids) : null, count: slot.count },
  );
}

/** 一格：ids＝可能是哪些道具（認不出、還沒載好參考都是 null），count＝數量（讀不到 null） */
export type SlotSeen = { index: number; ids: number[] | null; count: number | null };
/**
 * hp：HP 比例（讀不到 null）；slots：這張有讀快捷鍵才有這欄，null＝找不到快捷鍵；
 * poolReady：讀快捷鍵時藥水參考圖載好了沒（還沒載好時 ids 全是 null，不能當「認不出」）
 */
export type FrameExtras = { hp: number | null; slots?: SlotSeen[] | null; poolReady?: boolean };

type Cached = { sig: number; refs: PotionRef[]; ids: number[] | null };
/** stats：整池認了幾次、畫面沒變直接沿用幾次（測試看用） */
export type ExtrasState = { lastSlotsAt: number; refs: PotionRef[] | null; cache: Map<number, Cached>; stats: { full: number; cached: number } };

export function createExtrasState(): ExtrasState {
  return { lastSlotsAt: -Infinity, refs: null, cache: new Map(), stats: { full: 0, cached: 0 } };
}

/**
 * 認一格：圖示＋數量跟上次一模一樣才沿用；只要有一點不同就整池重認（門檻＋差距規則照 matchPotion），
 * 不拿上次的答案抄捷徑——換成長得像的另一種藥水時，寧可認不出也不能沿用舊的。
 */
function matchSlot(icon: Uint8ClampedArray, count: number | null, index: number, sig: number, refs: PotionRef[], state: ExtrasState): number[] | null {
  const hit = state.cache.get(index);
  if (hit && hit.refs === refs && hit.sig === sig) {
    state.stats.cached++;
    return hit.ids;
  }
  state.stats.full++;
  const ids = matchPotion(icon, refs, count)?.ids ?? null;
  state.cache.set(index, { sig, refs, ids });
  return ids;
}

/** 圖示＋數量的指紋（FNV-1a），一樣就不重認 */
function signature(icon: Uint8ClampedArray, count: number | null): number {
  let h = 0x811c9dc5 ^ (count ?? -1);
  for (let i = 0; i < icon.length; i++) {
    h ^= icon[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function readExtras(frame: Frame, bar: StatusBar | null, now: number, state: ExtrasState): FrameExtras {
  if (!bar) return { hp: null };
  const out: FrameExtras = { hp: hpRatio(frame, bar) };
  if (now - state.lastSlotsAt < SLOT_EVERY_MS) return out;
  state.lastSlotsAt = now;
  const slots = readQuickslot(frame, bar);
  out.poolReady = state.refs !== null;
  out.slots = slots
    ? slots.map(slot => {
        const refs = state.refs;
        if (!refs || !slot.icon) return { index: slot.index, ids: null, count: slot.count };
        const ids = matchSlot(slot.icon, slot.count, slot.index, signature(slot.icon, slot.count), refs, state);
        return { index: slot.index, ids, count: slot.count };
      })
    : null;
  return out;
}

/** 瀏覽器（Worker 或頁面）載一張站上道具圖成 RGBA；載不到回 null */
async function loadIcon(id: number): Promise<Frame | null> {
  try {
    const response = await fetch(`/assets/items/${id}.png`);
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return { width: image.width, height: image.height, data: image.data };
  } catch {
    return null;
  }
}

/** 開始分享後才載：一次 12 張並行，載不到的跳過 */
export async function loadPotionRefs(ids: number[]): Promise<PotionRef[]> {
  const refs: PotionRef[] = [];
  for (let i = 0; i < ids.length; i += 12) {
    const batch = ids.slice(i, i + 12);
    const icons = await Promise.all(batch.map(loadIcon));
    icons.forEach((icon, j) => {
      if (icon) refs.push(potionRefOf(batch[j], icon));
    });
  }
  return refs.sort((a, b) => a.id - b.id);
}
