import type { MetadataRoute } from "next";

const SITE_URL = "https://maplestory-tool-three.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes = [
    { path: "/", priority: 1 },
    { path: "/plan/quest", priority: 0.9 },
    { path: "/plan/train", priority: 0.9 },
    { path: "/plan/farm", priority: 0.9 },
    { path: "/go", priority: 0.8 },
    { path: "/db/monsters", priority: 0.7 },
    { path: "/db/items", priority: 0.7 },
    { path: "/db/quests", priority: 0.7 },
    { path: "/db/skills", priority: 0.7 },
    { path: "/about", priority: 0.5 },
    { path: "/privacy", priority: 0.2 },
    { path: "/terms", priority: 0.2 },
    { path: "/contact", priority: 0.3 },
  ];
  return routes.map(route => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: route.priority,
  }));
}
