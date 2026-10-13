/**
 * 抓 8591《新楓之谷：經典版》某個伺服器的楓幣掛單（全部頁）。
 * ⚠️ 8591 服務條款禁止未經授權的自動抓取，使用者 10/13 知情後拍板照做（spec「條款風險」）。所以：
 *   每 4 小時才跑一次、頁與頁之間停 3 秒、最多 40 頁；User-Agent 老實寫身分；被擋（403／429）就不重試，交給備援。
 */
import { listingsFromHtml } from "./nuxt.mjs";

export const USER_AGENT = "MapleBook-fx/1.0 (+https://github.com/clarkher/maplestory-tool; meso rate, every 4h)";
export const SERVERS = { 雪吉拉: "70854", 菇菇寶貝: "70855" };
const LIST_URL = "https://www.8591.com.tw/v3/mall/list/70657";
const PAGE_SIZE = 10;
const MAX_PAGES = 40;

export const pageUrl = (serverId, firstRow) => `${LIST_URL}?searchGame=70657&searchServer=${serverId}&searchType=0&firstRow=${firstRow}`;

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchAllListings({ serverId = SERVERS.雪吉拉, fetchText: get = fetchText, pauseMs = 3000, sleep = defaultSleep } = {}) {
  const byId = new Map();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (page > 0) await sleep(pauseMs);
    const listings = listingsFromHtml(await get(pageUrl(serverId, page * PAGE_SIZE)));
    const before = byId.size;
    for (const listing of listings) byId.set(listing.id, listing);
    // 空頁＝翻完了；整頁都是看過的 id＝翻過頭被送回最後一頁
    if (listings.length === 0 || byId.size === before) break;
  }
  return [...byId.values()];
}

export async function fetchText(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await defaultSleep(5000 * attempt);
    try {
      const response = await fetch(url, { headers: { "user-agent": USER_AGENT, "accept-language": "zh-TW" }, signal: AbortSignal.timeout(30000) });
      if (response.status === 403 || response.status === 429) throw Object.assign(new Error(`HTTP ${response.status}（被擋，不重試）`), { blocked: true });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (error.blocked) break;
    }
  }
  throw new Error(`8591 抓不到 ${url}：${lastError?.message ?? "不明原因"}`);
}
