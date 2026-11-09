import type { Metadata } from "next";
import { staticArticleEntries, staticGuide, staticGuideJobs } from "@/lib/static-data";
import { GuidesHub } from "./GuidesHub";

/**
 * 攻略專區（v1.86，使用者 11/09 照推薦）：導覽列「攻略」進來。
 * 原本 /guides 只轉去 /guide、不給收錄（v1.43 規格「不開文章總表」），這次推翻：自己是一頁、給 Google 收。
 */
export const metadata: Metadata = {
  title: "攻略｜各職業分等級攻略、1–30 懶人包、活動攻略",
  description:
    "新楓之谷經典版攻略總覽：每個職業每段等級去哪練、幾下打死、必解任務，1–30 懶人包、月妙與超綠組隊圖解，還有活動任務攻略。",
  alternates: { canonical: "/guides" },
};

export default function Page() {
  const jobs = staticGuideJobs().map(job => ({ job, name: staticGuide(job).name }));
  return <GuidesHub jobs={jobs} articles={staticArticleEntries()} builtAt={Date.now()} />;
}
