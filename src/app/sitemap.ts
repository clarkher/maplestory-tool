import type { MetadataRoute } from "next";
import { articleHeroPath, articlePath, articleSlug } from "@/lib/job-article";
import { itemPagePath } from "@/lib/item-page";
import { listPatchPages } from "@/lib/patches";
import { SITE_URL } from "@/lib/seo";
import { SITE_PAGES } from "@/lib/site-pages";
import fs from "node:fs";
import path from "node:path";
import { staticArticleImages, staticAtlasMaps, staticGuideDocs, staticGuideJobs, staticItemPages, staticJobArticle, staticJobArticleKeys, staticModified, staticMonsters, staticNpcs, staticQuests, staticSkills } from "@/lib/static-data";

// 建置時產生一次（Cloudflare 上是整站靜態輸出，沒標 force-static 會建不起來）
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  // 資料頁的更新時間用遊戲資料的產生時間，不用建置時間：沒改資料就不會每次部署都說「全站都改了」
  const modified = staticModified() ? new Date(staticModified()!) : new Date();
  const now = new Date();
  const fixed = SITE_PAGES.map(page => ({
    url: `${SITE_URL}${page.path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: page.priority,
  }));
  const detail = (path: string, priority: number) => ({
    url: `${SITE_URL}${path}`,
    lastModified: modified,
    changeFrequency: "monthly" as const,
    priority,
  });
  // 攻略文的更新時間讀文章自己的 updated（字串原樣，不轉時區）；有主圖才列圖
  const images = staticArticleImages();
  const article = ({ job, from, to }: { job: number; from: number; to: number }) => {
    const slug = articleSlug(job, from, to);
    return {
      ...detail(articlePath(job, from, to), 0.8),
      lastModified: staticJobArticle(job, from, to)?.updated ?? modified,
      ...(images[slug]?.hero ? { images: [`${SITE_URL}${articleHeroPath(slug)}`] } : {}),
    };
  };
  // 一般攻略文（v1.88，src/content/guides）：一樣讀自己的 updated，有主圖列圖
  const doc = ({ slug, updated }: { slug: string; updated: string }) => ({
    ...detail(`/guides/${slug}`, 0.8),
    lastModified: updated,
    ...(fs.existsSync(path.join(process.cwd(), "public", "assets", "guides", slug, "hero.webp")) ? { images: [`${SITE_URL}/assets/guides/${slug}/hero.jpg`] } : {}),
  });
  return [
    ...fixed,
    ...staticGuideDocs().map(doc),
    // 改版整理：只有寫了重點檔的版本才有單版頁
    ...listPatchPages().map(page => ({ ...detail(`/updates/${page.version}`, 0.7), lastModified: page.date })),
    ...staticGuideJobs().map(job => detail(`/jobs/${job}`, 0.8)),
    ...staticJobArticleKeys().map(article),
    ...staticMonsters().map(monster => detail(`/db/monsters/${monster.id}`, 0.6)),
    ...staticQuests().map(quest => detail(`/db/quests/${encodeURIComponent(quest.id)}`, 0.5)),
    ...staticSkills().map(skill => detail(`/db/skills/${skill.id}`, 0.5)),
    ...staticAtlasMaps().map(map => detail(`/db/maps/${map.id}`, 0.5)),
    ...staticNpcs().map(npc => detail(`/db/npcs/${npc.id}`, 0.5)),
    ...staticItemPages().map(item => detail(itemPagePath(item.id), 0.5)),
  ];
}
