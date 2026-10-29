// src/lib/boss/input.ts
// 記一筆的頻道輸入：手機鍵盤可能打出全形數字、順手打「頻」字，都收

/** 全形數字轉半形、去「頻」字與空白；1～60 的整數才回，其他回 null */
export function parseChannel(input: string): number | null {
  const s = input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/頻/g, "")
    .replace(/\s+/g, "");
  if (!/^[0-9]{1,2}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 60 ? n : null;
}
