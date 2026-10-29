// src/lib/speed/live-view.ts
/** 練功測速 v1.20 左欄（經驗、楓幣收益、跟我之前比）要顯示的字：純函式，可測 */
import { formatNumber } from "@/lib/format";

/**
 * 一格藥水叫什麼：編號都同一個名字就是那個名字；2～3 個不同名字寫「A 或 B」；
 * 更多、或查不到名字寫「這一格的道具」（長得一樣的道具不硬猜是哪一個）。
 */
export function potionName(ids: number[], items: { get(id: number): { n: string } | undefined }): string {
  const named = ids.map(id => items.get(id)?.n);
  if (!named.length || named.some(name => !name)) return "這一格的道具";
  const unique = [...new Set(named as string[])];
  if (unique.length === 1) return unique[0];
  if (unique.length <= 3) return unique.join("或");
  return "這一格的道具";
}

/** 每 10 分鐘幾瓶：10 瓶以上取整數，不到 10 瓶留一位小數（.0 不寫） */
function bottles(per10: number): string {
  if (per10 >= 10) return formatNumber(Math.round(per10));
  const one = Math.round(per10 * 10) / 10;
  return String(one);
}

/** 「藍色藥水：每 10 分鐘 12 瓶（約 2,400 楓幣）」；沒有商店價就不寫楓幣 */
export function potionLine(name: string, use: { per10: number; meso10: number | null }): string {
  const money = use.meso10 !== null ? `（約 ${formatNumber(Math.round(use.meso10))} 楓幣）` : "";
  return `${name}：每 10 分鐘 ${bottles(use.per10)} 瓶${money}`;
}

/** 玩家打的楓幣：只收數字（可帶逗號、空白），最多 10 位；其他回 null */
export function parseMeso(text: string): number | null {
  const digits = text.replace(/[,\s，]/g, "");
  if (!/^\d{1,10}$/.test(digits)) return null;
  return Number(digits);
}

/** +38,200／−3,360（四捨五入；0 不加號） */
export function signedText(value: number): string {
  const n = Math.round(value);
  if (n > 0) return `+${formatNumber(n)}`;
  if (n < 0) return `−${formatNumber(-n)}`;
  return "0";
}

/** 經驗卡曲線下面那行小字 */
export function segmentLine(duration: string, gained: number): string {
  return `這段練了 ${duration} · 拿到 ${formatNumber(gained)}`;
}

/** 玩家填好（離開欄位或按 Enter）的楓幣：value＝數字（空的、看不懂是 null）、at＝算速度用的時間 */
export type MesoEntry = { value: number | null; at: number };
export const NO_MESO: MesoEntry = { value: null, at: 0 };

/**
 * 填好一格楓幣。打到一半的字不算，只有這裡才改數字。
 * keepFirst（開始時楓幣）：已經有數字時改填，時間留第一次填的那一刻（改錯字不會讓速度亂跳）；
 * 現在楓幣每次填都用填的那一刻。清空或看不懂 → 回到沒填。
 */
export function commitMeso(prev: MesoEntry, text: string, now: number, keepFirst: boolean): MesoEntry {
  const value = parseMeso(text);
  if (value === null) return NO_MESO;
  return { value, at: keepFirst && prev.value !== null ? prev.at : now };
}

/**
 * 新的一段開始時這格要不要清：只清在上一段結束「之前」填的（中間休息時填的留著）。
 * prevEnd 是 null（沒有上一段、或上一段是換隊伍／改 ID 切開的）就不清。
 */
export function mesoForNewSegment(entry: MesoEntry, prevEnd: number | null): MesoEntry {
  if (prevEnd === null || entry.value === null) return entry;
  return entry.at < prevEnd ? NO_MESO : entry;
}
