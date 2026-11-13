/**
 * 楓葉商會的日子（台服 11/12 公告）：DAY 1＝11/19（維護後開跑），掉幣到 12/9（DAY 21），
 * 換東西到 12/16 23:59（DAY 28），12/17 00:00 硬幣、卷軸失效。日期都用台灣時間算。
 */
export const LEAF_DAYS = 21;
/** 最早能換東西那天：DAY 1 只能存幣（使用者 11/12：「DAY1 不能換東西吧，直接鎖死」） */
export const LEAF_FIRST_SHOP_DAY = 2;
/** 最後能換東西那天 */
export const LEAF_LAST_SHOP_DAY = 28;
const DAY1_UTC = Date.UTC(2026, 10, 19);
const TAIPEI = 8 * 3600_000;
const MS_DAY = 86400_000;

export type LeafDate = { month: number; date: number; weekday: number };

/** DAY n 是幾月幾號星期幾（0＝星期日）；n 可以是 0 以下或 21 以上（日曆前後的格子） */
export function dateOfDay(day: number): LeafDate {
  const t = new Date(DAY1_UTC + (day - 1) * MS_DAY);
  return { month: t.getUTCMonth() + 1, date: t.getUTCDate(), weekday: t.getUTCDay() };
}

/** 這個時間點是 DAY 幾（台灣時間）；活動前是 0 或負的（11/18＝0、11/12＝-6），日曆前面的格子也照這個編 */
export function dayOf(now: number): number {
  return Math.floor((now + TAIPEI - DAY1_UTC) / MS_DAY) + 1;
}

export const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
