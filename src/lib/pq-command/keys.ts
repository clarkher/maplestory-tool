/** 組隊指揮有的任務代號；首頁只要判斷要不要放連結，用這份就好，不用載入整份喊話內容 */
export const PQ_KEYS = ["moon", "kerning", "goddess"] as const;
export type PqKey = (typeof PQ_KEYS)[number];

export function isPqKey(key: string | null | undefined): key is PqKey {
  return (PQ_KEYS as readonly string[]).includes(key ?? "");
}
