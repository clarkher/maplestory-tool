/**
 * 改版索引（public/data/patches/index.json）的更新。純函式，不讀檔。
 * index ＝ { versions: { version, prev, base, head, date, counts }[] }，依 date 新到舊；同版本號整筆換掉。
 */

// 跟 data-refresh 同一個規則：版本號會變成檔名，不准有路徑字元
export const VERSION_RE = /^[0-9A-Za-z.+-]{1,32}$/;

export function upsertIndex(index, entry) {
  const rest = (index?.versions ?? []).filter(v => v.version !== entry.version);
  const versions = [...rest, entry].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { versions };
}
