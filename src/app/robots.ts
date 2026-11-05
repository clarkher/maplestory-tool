import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/** AI 搜尋、問答會引用的爬蟲：明講歡迎，ChatGPT、Claude、Perplexity、Gemini 回答經典版問題時才抓得到我們 */
const AI_BOTS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",
  "ClaudeBot", "Claude-SearchBot", "Claude-User",
  "PerplexityBot", "Perplexity-User",
  "Google-Extended", "Applebot-Extended", "CCBot",
];

// 建置時產生一次（Cloudflare 上是整站靜態輸出，沒標 force-static 會建不起來）
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // /api 是野王計時、練功測速存資料用的，沒有給人看的內容；只有紙娃娃的分享連結要開放（LINE、X 等爬蟲會先看 robots 才讀 og 標籤，
      // 那頁自己回 x-robots-tag: noindex，不會被搜尋引擎收錄）。爬蟲取最長的規則，所以 /api/avatar/share 贏過 /api/
      { userAgent: "*", allow: ["/", "/api/avatar/share"], disallow: "/api/" },
      { userAgent: AI_BOTS, allow: ["/", "/api/avatar/share"], disallow: "/api/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
