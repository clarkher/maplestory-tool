// 衝卷模擬：這件裝備能用哪些卷、預設挑哪張、網址 id 對回卷軸、表格第一欄的字
import type { ScrollSimData, SimEquip, SimScroll } from "./types";

/** 這件裝備能用的卷（部位相同，或專用卷點名這件）；成功率高到低，同成功率照名字 */
export function scrollsFor(data: ScrollSimData, equip: SimEquip): SimScroll[] {
  return data.scrolls
    .filter((s) => (s.slot !== null && s.slot === equip.s) || (s.only?.includes(equip.id) ?? false))
    .sort((a, b) => b.rate - a.rate || a.n.localeCompare(b.n, "zh-Hant"));
}

/** 卷軸類別：攻擊 0、魔力 1、其他 2（看第一個加的數值） */
function kind(s: SimScroll): number {
  const k = s.stats[0]?.k ?? "";
  if (k.includes("攻擊")) return 0;
  if (k.includes("魔力")) return 1;
  return 2;
}

/** 同條件時偏好：查得到哪裡拿 > 不會爆 > 名字沒有活動前綴 */
function tieBreak(a: SimScroll, b: SimScroll): number {
  return Number(b.src) - Number(a.src) || a.boom - b.boom || Number(a.n.startsWith("[")) - Number(b.n.startsWith("[")) || a.id - b.id;
}

/** 只帶裝備進來時預設的卷：攻擊 > 魔力 > 其他，同類挑成功率 60%，沒有就最高那張 */
export function defaultScroll(list: SimScroll[]): SimScroll | null {
  if (list.length === 0) return null;
  const best = Math.min(...list.map(kind));
  const group = list.filter((s) => kind(s) === best);
  const sixty = group.filter((s) => s.rate === 60);
  const pool = sixty.length ? sixty : group.filter((s) => s.rate === Math.max(...group.map((g) => g.rate)));
  return [...pool].sort(tieBreak)[0] ?? null;
}

/** 網址帶的卷軸 id：同名的重複 id 都認；找不到回 null */
export function findScroll(data: ScrollSimData, id: number): SimScroll | null {
  return data.scrolls.find((s) => s.ids.includes(id)) ?? null;
}

/** 表格第一欄：「3 張（物理攻擊力 +6、幸運 +3）」 */
export function rowLabel(k: number, s: SimScroll): string {
  if (s.stats.length === 0) return `${k} 張`;
  return `${k} 張（${s.stats.map((st) => `${st.k} +${st.v * k}`).join("、")}）`;
}

/** 表格第一欄第二行：「物理攻擊力 +10、幸運 +5」；沒有數值回空字串 */
export function statLine(k: number, s: SimScroll): string {
  return s.stats.map((st) => `${st.k} +${st.v * k}`).join("、");
}
