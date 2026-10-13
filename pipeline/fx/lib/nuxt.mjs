/**
 * 8591 商品清單頁是 Nuxt 伺服器端渲染：資料在 <script id="__NUXT_DATA__"> 裡，格式是 devalue 陣列——
 * 物件的每個值都是「指到陣列第幾格」的索引。這裡只還原算匯率要用的欄位（id、標題、台幣價、庫存、累計賣出），
 * 標題只在記憶體裡用來讀匯率，不會寫進任何檔案。
 */
const SCRIPT = /<script[^>]*\bid="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

/** @typedef {{ id: string, title: string, priceNtd: number, stock: number|null, sold: number|null }} Listing */

/** @returns {Listing[]} */
export function listingsFromHtml(html) {
  const match = html.match(SCRIPT);
  if (!match) throw new Error("頁面裡沒有 __NUXT_DATA__（可能被擋、跳驗證頁或改版）");
  const data = JSON.parse(match[1]);
  if (!Array.isArray(data)) throw new Error("__NUXT_DATA__ 不是陣列（可能改版）");
  const at = index => (Number.isInteger(index) && index >= 0 && index < data.length ? data[index] : undefined);

  const listings = [];
  for (const entry of data) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || !("ware_title" in entry)) continue;
    const id = at(entry.id);
    const title = at(entry.ware_title);
    const priceNtd = toNumber(at(entry.ware_price));
    if ((typeof id !== "string" && typeof id !== "number") || typeof title !== "string" || priceNtd === null) continue;
    listings.push({ id: String(id), title, priceNtd, stock: toNumber(at(entry.ware_number)), sold: toNumber(at(entry.sell_count)) });
  }
  return listings;
}

/** 數字或「1,000」這種字串 → 數字；讀不出來是 null */
function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const number = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(number) ? number : null;
}
