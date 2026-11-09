import type { Metadata } from "next";
import { OG_BASE } from "@/lib/seo";
import { staticArticleEntries, staticGuide, staticGuideCards, staticGuideJobs } from "@/lib/static-data";
import { GuidesHub } from "./GuidesHub";

/**
 * 攻略專區（v1.86，使用者 11/09 照推薦）：導覽列「攻略」進來。
 * 原本 /guides 只轉去 /guide、不給收錄（v1.43 規格「不開文章總表」），這次推翻：自己是一頁、給 Google 收。
 * v1.88 改雜誌式（使用者 11/09 選 A）：卡片來源 staticGuideCards()。
 */
const TITLE = "楓之谷經典版攻略｜職業分等級攻略、三轉、組隊任務、活動";
const DESCRIPTION = "楓之谷經典版攻略總覽：每個職業每段等級去哪練、幾下打死、必解任務，三轉流程、1–30 懶人包、月妙與超綠組隊圖解，還有活動任務攻略。";

export const metadata: Metadata = {
  // 標題自己寫了「楓之谷經典版」，不套全站模板
  title: { absolute: `${TITLE}｜楓谷幫手` },
  description: DESCRIPTION,
  alternates: { canonical: "/guides" },
  // 頁面自己的 openGraph 會整包蓋掉 layout 的：沒寫的話分享出去是首頁的標題跟網址
  openGraph: { ...OG_BASE, title: `${TITLE}｜楓谷幫手`, description: DESCRIPTION, url: "/guides" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function Page() {
  const jobs = staticGuideJobs().map(job => ({ job, name: staticGuide(job).name }));
  return <GuidesHub cards={staticGuideCards()} jobs={jobs} articles={staticArticleEntries()} builtAt={Date.now()} />;
}
