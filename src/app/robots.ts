import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/** AI 搜尋、問答會引用的爬蟲：明講歡迎，ChatGPT、Claude、Perplexity、Gemini 回答經典版問題時才抓得到我們 */
const AI_BOTS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",
  "ClaudeBot", "Claude-SearchBot", "Claude-User",
  "PerplexityBot", "Perplexity-User",
  "Google-Extended", "Applebot-Extended", "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // /api 是野王計時、練功測速存資料用的，沒有給人看的內容
      { userAgent: "*", allow: "/", disallow: "/api/" },
      { userAgent: AI_BOTS, allow: "/", disallow: "/api/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
