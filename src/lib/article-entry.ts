/**
 * 攻略文入口（v1.85，使用者選 A＋C）：首頁、1–30 懶人包連到分等級攻略文。
 * 清單由伺服器讀檔（static-data 的 staticArticleEntries）傳進來；這裡不 import job-article，首頁的程式不用多載那一大包。
 */
export type ArticleEntry = { job: number; from: number; to: number; href: string };

/** 這個職業、這個等級的那篇；沒有回 undefined */
export function articleFor(entries: readonly ArticleEntry[], job: number, level: number): ArticleEntry | undefined {
  return entries.find(entry => entry.job === job && entry.from <= level && level <= entry.to);
}
