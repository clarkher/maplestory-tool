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
