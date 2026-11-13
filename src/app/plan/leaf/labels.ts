// 楓葉武器衝卷規劃器的字（畫面跟下載的行程表共用）
import type { PlanItem } from "@/lib/leaf-planner/calc";
import { dateOfDay, LEAF_DAYS, LEAF_FIRST_SHOP_DAY, LEAF_LAST_SHOP_DAY } from "@/lib/leaf-planner/calendar";
import type { LeafWeapon } from "@/lib/leaf-planner/weapons";

/** 日曆上的一樣東西；ifMiss＝推薦衝法裡前面的 15% 沒中才會走到 */
export type Row = PlanItem & { ifMiss?: true };

export const CIRCLED = ["", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

export const md = (day: number) => {
  const d = dateOfDay(day);
  return `${d.month}/${d.date}`;
};

export function itemTitle(item: PlanItem, weapon: LeafWeapon): string {
  return item.kind === "weapon" ? `換${weapon.name.replace(/^楓葉/, "")} ${CIRCLED[item.target] ?? item.target}` : `${item.rate}% 卷 ${CIRCLED[item.target] ?? item.target}`;
}

/** 推薦衝法裡沒中才走到的那步，下面一行說明 */
export function missNote(row: Row, rows: Row[], tries: number | null): string | undefined {
  if (!row.ifMiss || tries === null) return undefined;
  if (row.kind === "weapon") return row.target === tries + 1 ? "前面都沒中才換" : `${CIRCLED[row.target - 1]}兩張都沒中才換`;
  if (row.rate !== 15) return undefined;
  const nth = rows.filter(r => r.kind === "scroll" && r.target === row.target).indexOf(row);
  return nth > 0 ? "第 1 張沒中才換" : "沒中才換";
}

export function dayStatus(day: number, lastDay: number): string | null {
  if (day < 1) return null;
  if (day < LEAF_FIRST_SHOP_DAY) return "只能存幣，還不能換";
  if (day <= LEAF_DAYS) return day <= lastDay ? "存著" : "不用換";
  if (day <= LEAF_LAST_SHOP_DAY) return "不掉幣，還能換";
  if (day === LEAF_LAST_SHOP_DAY + 1) return "硬幣、卷軸失效";
  return null;
}
