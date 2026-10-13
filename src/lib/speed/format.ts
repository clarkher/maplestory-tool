// src/lib/speed/format.ts
/** 「12 分」「1 小時 5 分」（無條件捨去到分） */
export function durationText(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} 小時 ${minutes % 60} 分` : `${minutes} 分`;
}

/** 升級還要多久：「約 26 分鐘」「約 3 小時 10 分」，超過一天寫「超過 24 小時」（無條件進位到分） */
export function etaText(minutes: number): string {
  const total = Math.ceil(minutes);
  if (total > 24 * 60) return "超過 24 小時";
  const hours = Math.floor(total / 60);
  return hours ? `約 ${hours} 小時 ${total % 60} 分` : `約 ${total} 分鐘`;
}
