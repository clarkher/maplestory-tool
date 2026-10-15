/**
 * 「手動補一筆」的輸入檢查：參考站停更時，人填「100 元換幾萬楓幣」（跟 ask100 同單位）。
 * 沒填（空、只有空白、undefined、null）回 null＝這一輪不是手動補；填了就必須是 10～2000 的有限數字，否則丟中文錯誤。
 * 只收一般的十進位寫法（"300"、"312.5"），不收 "1e3"、"0x20"、"300萬" 這類 Number() 會默默吃進去的寫法。
 */
export const MANUAL_MIN = 10;
export const MANUAL_MAX = 2000;

export function parseManual(input) {
  if (input === undefined || input === null) return null;
  const text = typeof input === "number" ? String(input) : String(input).trim();
  if (text === "") return null;
  const value = /^\d+(\.\d+)?$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isFinite(value) || value < MANUAL_MIN || value > MANUAL_MAX) {
    throw new Error(`手動補一筆要填 100 元換幾萬楓幣，是 ${MANUAL_MIN}～${MANUAL_MAX} 的數字（例如 300），收到「${input}」`);
  }
  return value;
}
