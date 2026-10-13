// 存之前的 5 條檢查（spec「讀圖」）：有旗子的那筆變黃、等使用者看一眼，不進中間價
import { OPEN_DATE } from "./parse.mjs";

export function checkTrade(t, { today, prevUnitMedian = null }) {
  const flags = [...(t.flags ?? [])];
  if (t.price != null && t.unitPrice != null && t.qty != null && t.unitPrice * t.qty !== t.price) flags.push("單價×數量跟總價對不上");
  if (t.price != null && t.unitPrice != null && t.qty == null) flags.push("總價不是單價的整數倍");
  if (t.tradedAt > today) flags.push("交易日期在未來");
  if (t.tradedAt < OPEN_DATE) flags.push("交易日期比開服還早");
  if (prevUnitMedian && t.unitPrice && (t.unitPrice > prevUnitMedian * 5 || t.unitPrice * 5 < prevUnitMedian)) flags.push("跟上次中間價差 5 倍以上");
  return flags;
}
