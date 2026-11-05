/**
 * 道具單獨頁（/db/items/<id>）的規則與句子：哪些道具出頁、標題、開頭那段話。
 * 只出查得到來源的一般道具（11/05 拍板 A）：時裝、現金目前沒人在搜，查不到來源的頁面只有名字跟數值，內容太薄。
 */
import type { Item, ShopRow } from "./types";

export type ItemPageLookup = {
  monster: (id: number) => string | undefined;
  quest: (id: string) => string | undefined;
};

const NO_PAGE_CATEGORIES = new Set(["時裝", "現金"]);
/** 摘要最多列幾隻怪、幾個任務，其他寫總數 */
const SUMMARY_MAX = 3;

/** 常駐的楓幣店：活動店（有結束時間、收活動幣）過期就沒了，不算來源 */
const regularShops = (item: Item): ShopRow[] => (item.sp ?? []).filter(row => !row.e && !row.u);

const dropNames = (item: Item, lookup: ItemPageLookup) =>
  (item.dm ?? []).map(id => lookup.monster(id)).filter((name): name is string => Boolean(name));

const questNames = (ids: string[] | undefined, lookup: ItemPageLookup) =>
  (ids ?? []).map(id => lookup.quest(id)).filter((name): name is string => Boolean(name));

export function hasItemPage(item: Item, lookup: ItemPageLookup): boolean {
  if (item.un || NO_PAGE_CATEGORIES.has(item.c)) return false;
  return (
    dropNames(item, lookup).length > 0 ||
    regularShops(item).length > 0 ||
    questNames(item.qr, lookup).length > 0 ||
    questNames(item.qq, lookup).length > 0
  );
}

export const itemPagePath = (id: number) => `/db/items/${id}`;

/** 任務卡的道具膠囊連去哪：任務單獨頁給了 itemPages 就連道具單獨頁，其他照舊（工具頁留在工具裡） */
export function itemChipHref(id: number, { itemPages, linkToFarm = false }: { itemPages?: readonly number[]; linkToFarm?: boolean }): string {
  if (itemPages?.includes(id)) return itemPagePath(id);
  return linkToFarm ? `/plan/farm?want=${id}` : `/db/items?id=${id}`;
}

/** 標題只寫頁面答得出來的；「楓之谷經典版｜楓谷幫手」模板會補 */
export function itemPageTitle(item: Item): string {
  if (item.eq && item.c === "裝備") return `${item.n}｜哪裡拿、能力值`;
  return item.qq?.length ? `${item.n}｜哪裡拿、任務用途` : `${item.n}｜哪裡拿`;
}

/** 「A、B、C」，超過就「A、B、C等 N 種怪」 */
function listed(names: string[], unit: string): string {
  const head = names.slice(0, SUMMARY_MAX).join("、");
  return names.length > SUMMARY_MAX ? `${head}等 ${names.length} ${unit}` : head;
}

/** 開頭那段話：是什麼、哪裡拿、拿來做什麼。只用資料裡有的欄位，沒有的那句就不寫 */
export function itemSummary(item: Item, lookup: ItemPageLookup): string {
  const level = Number(item.eq?.reqLevel ?? 0);
  let text = `${item.n}是${item.s ?? item.c}${level > 0 ? `，Lv.${level} 可以用` : ""}。`;
  const drops = dropNames(item, lookup);
  if (drops.length) text += `${listed(drops, "種怪")}會掉。`;
  const shops = regularShops(item);
  if (shops.length) {
    const places = [...new Set(shops.map(row => row.p))];
    text += `可以在${listed(places, "個地方")}買${shops.some(row => row.o === 1) ? "（參考舊版資料）" : ""}。`;
  }
  const quoted = (names: string[]) => listed(names.map(name => `「${name}」`), "個任務");
  const rewards = questNames(item.qr, lookup);
  if (rewards.length) text += `任務${quoted(rewards)}會給。`;
  const needs = questNames(item.qq, lookup);
  if (needs.length) text += `任務${quoted(needs)}要用到。`;
  return text;
}
