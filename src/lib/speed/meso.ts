// src/lib/speed/meso.ts

/**
 * 楓幣每 10 分鐘：net10＝帳面變化（身上楓幣增加量，已經扣掉買藥水的）；picked10＝net10 加回藥水錢（撿到的）。
 * 兩次讀數相差不到 1 分鐘、或沒有起點時回 null。potionMeso10 是每 10 分鐘藥水花費（算不出來給 0）。
 */
export function mesoRates(
  input: { startMeso: number; startAt: number; nowMeso: number; nowAt: number } | null,
  potionMeso10: number,
): { net10: number | null; picked10: number | null } {
  if (!input) return { net10: null, picked10: null };
  const minutes = (input.nowAt - input.startAt) / 60000;
  if (!(minutes >= 1)) return { net10: null, picked10: null };
  const net10 = ((input.nowMeso - input.startMeso) / minutes) * 10;
  return { net10, picked10: net10 + potionMeso10 };
}
