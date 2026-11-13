import fs from "node:fs";
import path from "node:path";
import { patchSummary } from "@/app/updates/PatchCard";
import { buildRss, type FeedItem } from "@/lib/feed";
import { articleHeroPath, articleSlug, buildCalcTable, resolveArticle } from "@/lib/job-article";
import { listPatchPages } from "@/lib/patches";
import { clip } from "@/lib/seo";
import { staticArticleImages, staticCalcData, staticGuideDocs, staticJobArticle, staticJobArticleKeys } from "@/lib/static-data";

// 建置時產生一次（整站靜態輸出）
export const dynamic = "force-static";

/** 職業攻略文：標題、描述有 {{代號}}，跟文章頁一樣先換成字 */
function jobArticleItems(): FeedItem[] {
  const data = staticCalcData();
  const images = staticArticleImages();
  return staticJobArticleKeys().flatMap(key => {
    const raw = staticJobArticle(key.job, key.from, key.to);
    if (!raw) return [];
    const slug = articleSlug(key.job, key.from, key.to);
    const table = buildCalcTable({ ...key, data, gear: raw.gear, statCap: raw.statCap });
    const article = resolveArticle(raw, table, data);
    return [{
      title: article.title,
      path: `/guides/${slug}`,
      description: article.description,
      date: article.published,
      ...(images[slug]?.hero ? { image: articleHeroPath(slug) } : {}),
    }];
  });
}

/** 一般攻略文（活動、轉職、懶人包）：有 hero.webp 才有主圖，放 jpg（跟 sitemap 一樣） */
function docItems(): FeedItem[] {
  return staticGuideDocs().map(doc => {
    const hasHero = fs.existsSync(path.join(process.cwd(), "public", "assets", "guides", doc.slug, "hero.webp"));
    return {
      title: doc.title,
      path: `/guides/${doc.slug}`,
      description: doc.description,
      date: doc.published,
      ...(hasHero ? { image: `/assets/guides/${doc.slug}/hero.jpg` } : {}),
    };
  });
}

/** 改版整理：標題、描述跟單版頁一樣 */
function patchItems(): FeedItem[] {
  return listPatchPages().map(page => ({
    title: `楓之谷經典版 改版整理（${page.version}）：${page.title}`,
    path: `/updates/${page.version}`,
    description: clip(`楓之谷經典版 ${page.title}。${patchSummary(page)}`),
    date: page.date,
  }));
}

export function GET() {
  const items = [...jobArticleItems(), ...docItems(), ...patchItems()];
  // 頻道更新時間＝最新一篇的日期，沒發新文就不變（不拿建置時間，免得每次部署都像有新東西）
  const latest = items.map(item => item.date).sort().at(-1) ?? "2026-11-13";
  return new Response(buildRss(items, `${latest}T00:00:00+08:00`), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
