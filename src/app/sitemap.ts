import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { SITE_PAGES } from "@/lib/site-pages";
import { staticGuideJobs, staticModified, staticMonsters, staticQuests, staticSkills } from "@/lib/static-data";

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
  return [
    ...fixed,
    ...staticGuideJobs().map(job => detail(`/jobs/${job}`, 0.8)),
    ...staticMonsters().map(monster => detail(`/db/monsters/${monster.id}`, 0.6)),
    ...staticQuests().map(quest => detail(`/db/quests/${encodeURIComponent(quest.id)}`, 0.5)),
    ...staticSkills().map(skill => detail(`/db/skills/${skill.id}`, 0.5)),
  ];
}
