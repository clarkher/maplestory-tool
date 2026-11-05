import { CACHE_HEADERS } from "../../cache-headers.mjs";

// 資料檔的網址帶版本號、快取一年（cache-headers.mjs）。內容改了版本號沒跟著變，
// 來過的人會一直拿到舊的；新訪客跟無頭驗收拿到新的，看不出來。
// 每次回伺服器確認的那幾個檔（meta.json、gear.json 這些）不靠版本號，單獨改沒事。
const REVALIDATED = new Set(
  CACHE_HEADERS.filter(rule => rule.headers.some(header => header.value.includes("max-age=0"))).map(rule => rule.source),
);

/** 這次改到的檔裡，內容變了、版本號（meta.json／guides/common.json）卻沒跟著改的資料檔 */
export function staleDataVersion(changedFiles) {
  const changed = new Set(changedFiles);
  return changedFiles.filter(file => {
    const url = file.match(/^public(\/data\/(?:guides\/)?[^/]+\.json)$/)?.[1];
    if (!url || REVALIDATED.has(url)) return false;
    return !changed.has(url.startsWith("/data/guides/") ? "public/data/guides/common.json" : "public/data/meta.json");
  });
}
