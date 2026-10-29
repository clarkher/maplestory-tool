// src/lib/speed/live-view.ts
/** 練功測速 v1.22 左欄（經驗、楓幣收益、跟我之前比）要顯示的字：純函式，可測 */
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
 * 現在楓幣每次填（數字有改）都用填的那一刻；數字沒改就原樣回傳、時間不重記。清空或看不懂 → 回到沒填。
 */
export function commitMeso(prev: MesoEntry, text: string, now: number, keepFirst: boolean): MesoEntry {
  const value = parseMeso(text);
  if (value === null) return prev.value === null ? prev : NO_MESO;
  // 數字沒改（按了 Enter 又離開欄位、用 Tab 經過）：原樣留著，時間不重記
  if (value === prev.value) return prev;
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

/**
 * 藥水用量拿來除的分鐘數：跟這段的 10 分鐘經驗同一個基準（最後一次經驗變動 − 開始，見 tenMinuteExp）；
 * 不到 1 分鐘回 0（跟楓幣一樣，太短不算每 10 分鐘）
 */
export function potionMinutes(seg: { startedAt: number; lastChangeAt: number }): number {
  const minutes = (seg.lastChangeAt - seg.startedAt) / 60_000;
  return minutes >= 1 ? minutes : 0;
}

/** 有藥水分不出是哪一種（同一張圖、價格不同） */
export const UNPRICED_NOTE = "有藥水分不出是哪一種（同一張圖），藥水錢跟撿到算不出來";
/** 這段有讀不完整的地方（快捷鍵讀不到、有數量認不出、數字跳太多） */
export const INCOMPLETE_NOTE = "有幾格沒讀到，藥水錢跟撿到算不出來";

/**
 * 楓幣收益卡的「撿到」「藥水」兩格跟藥水清單下面那一行說明（最多一行）。
 * 藥水錢要完整才寫：至少 1 分鐘、這段讀到過快捷鍵、每種都有單價、沒有讀不完整的地方；不然兩格都寫「—」（淨賺照寫，不在這裡）。
 */
export function mesoCells(p: {
  minutes: number;
  seen: boolean;
  uses: number;
  unpriced: boolean;
  incomplete: boolean;
  potionMeso10: number;
  picked10: number | null;
}): { picked: string; potion: string; note: string | null } {
  const note = p.incomplete ? INCOMPLETE_NOTE : p.unpriced ? UNPRICED_NOTE : null;
  const known = p.minutes > 0 && p.seen && !p.unpriced && !p.incomplete;
  if (!known) return { picked: "—", potion: "—", note };
  return {
    potion: p.uses ? signedText(-p.potionMeso10) : "0",
    picked: p.picked10 !== null ? signedText(p.picked10) : "—",
    note,
  };
}
