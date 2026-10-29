// src/lib/boss/room-code.ts
// 房間代碼：6 碼，字母表去掉容易看錯的 0/O/1/I

export const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LEN = 6;

/** 產生新代碼；random 可注入（測試用），預設 Math.random */
export function newRoomCode(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < LEN; i++) {
    const idx = Math.min(ROOM_ALPHABET.length - 1, Math.floor(random() * ROOM_ALPHABET.length));
    out += ROOM_ALPHABET[idx];
  }
  return out;
}

/** 去空白、轉大寫；長度不是 6 或有字母表外的字就回 null */
export function normalizeRoomCode(input: string): string | null {
  const s = input.replace(/\s+/g, "").toUpperCase();
  if (s.length !== LEN) return null;
  for (const ch of s) if (!ROOM_ALPHABET.includes(ch)) return null;
  return s;
}
