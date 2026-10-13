// 拍賣查價清單（v0.97）。設計：docs/superpowers/specs/2026-10-13-auction-price-tool-design.md
// 清單是使用者 10/13 拍板的 A（9 件），改動要使用者拍板（記憶 maplebook-price-tracking.md）

export const SERVER = "雪吉拉";
export const DAILY = ["手套攻擊卷軸10%", "手套攻擊卷軸60%", "日之鏢", "雷之鏢", "寵物速度卷軸100%"];
export const WEEKLY = ["黃色雨傘", "雪花鏢", "玻璃鞋", "轉蛋券"];
export const ALL_ITEMS = [...DAILY, ...WEEKLY];
/** 每週那幾件排在星期幾（0＝日、1＝一） */
export const WEEKLY_DAY = 1;
/** 價格照屬性分組的裝備（同一把屬性不同價差很大，混在一起的中間價沒意義） */
export const EQUIPS = new Set(["黃色雨傘"]);

/** 今天要查哪幾件：每天的全部，週一再加每週的。用電腦當地時間（使用者在台灣）。 */
export function todayList(date) {
  const daily = DAILY.map(name => ({ name, freq: "daily" }));
  if (date.getDay() !== WEEKLY_DAY) return daily;
  return [...daily, ...WEEKLY.map(name => ({ name, freq: "weekly" }))];
}

const p2 = n => String(n).padStart(2, "0");

/** 當地日期 YYYY-MM-DD */
export function localDate(date) {
  return `${date.getFullYear()}-${p2(date.getMonth() + 1)}-${p2(date.getDate())}`;
}

/** 當地時間 ISO（帶時區），存「哪天記的」用；前 10 個字就是 localDate */
export function localIso(date) {
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const hh = p2(Math.floor(Math.abs(off) / 60)), mm = p2(Math.abs(off) % 60);
  return `${localDate(date)}T${p2(date.getHours())}:${p2(date.getMinutes())}:${p2(date.getSeconds())}${sign}${hh}:${mm}`;
}
