import { articlePath, articleRangeLabel } from "@/lib/job-article";
import { SITE_NAME, SITE_URL } from "@/lib/seo";
import { SITE_PAGES } from "@/lib/site-pages";
import { staticGuide, staticGuideDocs, staticGuideJobs, staticJobArticleKeys, staticMeta } from "@/lib/static-data";

/**
 * /llms.txt：給 AI（ChatGPT、Claude、Perplexity…）讀的網站說明（llmstxt.org 的格式）。
 * 寫這個站是什麼、每一頁能查什麼、資料從哪來，AI 回答經典版問題時比較會引用、也比較不會講錯。
 */
export const dynamic = "force-static";

/** 分等級攻略文：有文章才有這一區 */
function articleLines(): string[] {
  const keys = staticJobArticleKeys();
  if (!keys.length) return [];
  return [
    "## 分等級攻略文（去哪練、幾下打死、幾等不 MISS，數字由站上計算）",
    "",
    ...keys.map(({ job, from, to }) => `- [${staticGuide(job).name} ${articleRangeLabel(from, to)}](${SITE_URL}${articlePath(job, from, to)})`),
    "",
  ];
}

/** 一般攻略文（v1.88，src/content/guides）：轉職、活動這類不是「職業×等級」的文章 */
function docLines(): string[] {
  const docs = staticGuideDocs();
  if (!docs.length) return [];
  return ["## 攻略文章", "", ...docs.map(doc => `- [${doc.title}](${SITE_URL}/guides/${doc.slug})：${doc.description}`), ""];
}

export function GET() {
  const meta = staticMeta();
  const lines = [
    `# ${SITE_NAME}`,
    "",
    `> 台服《新楓之谷：經典版》（MapleStory Classic，台灣伺服器）的玩家自製規劃工具。只收錄目前開放的內容：等級上限 Lv.${meta.release?.levelCap ?? 120}、三轉，楓之島、維多利亞島、天空之城、冰原雪域與廢礦區。不是 Artale，也不是 GMS Classic。與遊戲官方無關。`,
    "",
    "怪物、道具、任務、技能的名稱與數值來自遊戲客戶端資產匯出；傳送門路線取自 v83 版本地圖檔（經典版改過的通道可能不同）；職業攻略彙整自巴哈姆特等台灣玩家社群，每段附出處。官方沒有公開掉落機率，本站也不提供。",
    meta.dataGeneratedAtText ? `遊戲資料版本 ${meta.gameVersion ?? ""}，產生時間 ${meta.dataGeneratedAtText}。` : "",
    "",
    "## 工具與頁面",
    "",
    ...SITE_PAGES.filter(page => page.what).map(page => `- [${page.name}](${SITE_URL}${page.path})：${page.what}`),
    "",
    "## 職業攻略（配點、技能點法、各等級練功地圖）",
    "",
    ...staticGuideJobs().map(job => `- [${staticGuide(job).name}](${SITE_URL}/jobs/${job})`),
    "",
    ...articleLines(),
    ...docLines(),
    "## 單筆資料頁",
    "",
    `- 怪物：${SITE_URL}/db/monsters/<怪物編號>，例 ${SITE_URL}/db/monsters/100100（嫩寶）`,
    `- 任務：${SITE_URL}/db/quests/<任務編號>`,
    `- 技能：${SITE_URL}/db/skills/<技能編號>`,
    `- 全部網址：${SITE_URL}/sitemap.xml`,
    "",
  ];
  return new Response(lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
