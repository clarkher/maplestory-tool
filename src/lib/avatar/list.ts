/**
 * 紙娃娃挑衣服卡「這一頁要列什麼」的純算法（Picker.tsx 只管畫）：
 *   candidates(data, g, tab, text, shopOnly)   一個分頁的清單（套性別、搜尋字、排序、只看商城有賣）
 *   searchGroups(data, g, text, order, current, shopOnly)   搜尋字跨所有分頁，一類一組，目前分頁那類排第一
 * 順序規則：
 * - 裝備：點裝在前、一般裝備在後，各自畫得出來的在前，其他照資料順序；髮型、臉型：畫得出來的照資料順序，畫不出來的接在最後
 * - 只看商城有賣＝只留有 pr（商城單件樂豆點）的裝備，留下來的相對順序不變；髮型、臉型、膚色沒有價錢，這個條件不套用
 *   （分頁清單那三頁照常列；跨類別搜尋時這三組不列，因為套了就只剩沒價錢的）
 */
import type { AvatarData, AvatarItem, AvatarSkin, AvatarStyle, Gender, SlotKey } from "./types";

export type TabKey = "hair" | "face" | "skin" | SlotKey;

export type Entry =
  | { kind: "hair" | "face"; style: AvatarStyle }
  | { kind: "skin"; skin: AvatarSkin }
  | { kind: "item"; item: AvatarItem };

/** 這款有哪些顏色碼（台服＋日服，小到大）；空的＝畫不出來 */
export const coloursOf = (s: AvatarStyle) => [...new Set([...s.t, ...s.j])].sort((a, b) => a - b);

/** 這一頁要列的東西（已套性別、搜尋、排序；shopOnly 只對裝備那 12 頁有用） */
export function candidates(data: AvatarData, g: Gender, tab: TabKey, text: string, shopOnly = false): Entry[] {
  const q = text.trim().toLowerCase();
  const hit = (n: string) => !q || n.toLowerCase().includes(q);
  const fits = (x: { g: 0 | 1 | 2 }) => x.g === g || x.g === 2;
  if (tab === "skin") return data.skin.filter((s) => hit(s.n)).map((skin): Entry => ({ kind: "skin", skin }));
  if (tab === "hair" || tab === "face") {
    const styles = data[tab].filter((s) => fits(s) && hit(s.n));
    const drawn = styles.filter((s) => coloursOf(s).length > 0);
    const missing = styles.filter((s) => coloursOf(s).length === 0);
    return [...drawn, ...missing].map((style): Entry => ({ kind: tab, style }));
  }
  const rank = (i: AvatarItem) => (i.cash ? 0 : 2) + (i.r ? 0 : 1);
  return data.items
    .filter((i) => i.k === tab && fits(i) && hit(i.n) && (!shopOnly || i.pr))
    .sort((a, b) => rank(a) - rank(b)) // sort 是穩定的：同一級照資料順序
    .map((item): Entry => ({ kind: "item", item }));
}

/**
 * 搜尋字跨所有分頁：一類一組（空的不列），目前分頁那類排第一，其他照 order（分頁順序）。
 * 只看商城有賣時髮型、臉型、膚色整組不列；搜尋字是空白就什麼都不列（沒搜尋＝回分頁清單，不走這裡）。
 */
export function searchGroups(data: AvatarData, g: Gender, text: string, order: TabKey[], current: TabKey, shopOnly = false): { tab: TabKey; entries: Entry[] }[] {
  if (!text.trim()) return [];
  const tabs = [current, ...order.filter((t) => t !== current)];
  return tabs
    .filter((tab) => !shopOnly || (tab !== "hair" && tab !== "face" && tab !== "skin"))
    .map((tab) => ({ tab, entries: candidates(data, g, tab, text, shopOnly) }))
    .filter((group) => group.entries.length > 0);
}
