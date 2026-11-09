/**
 * 攻略專區 /guides（v1.86，使用者 11/09 照推薦 1A 2A 3A 4A）：導覽列一顆「攻略」直接進來。
 * 收：活動攻略（萬聖節，原本電腦版導覽列那顆）、1–30 懶人包、月妙／超綠組隊圖解、分等級攻略文（照職業排）。
 * 推翻 v1.43「不開文章總表」：/guides 不再轉去 /guide，自己是一頁、給 Google 收。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuidesHub } from "@/app/guides/GuidesHub";
import { eventStatus } from "@/app/guides/EventStatus";
import type { ArticleEntry } from "@/lib/article-entry";
import { SITE_PAGES } from "@/lib/site-pages";

const read = (rel: string) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const entries: ArticleEntry[] = [
  { job: 230, from: 31, to: 50, href: "/guides/priest-31-50" },
  { job: 230, from: 51, to: 70, href: "/guides/priest-51-70" },
  { job: 200, from: 10, to: 30, href: "/guides/magician-10-30" },
];
const jobs = [{ job: 200, name: "法師" }, { job: 230, name: "僧侶" }, { job: 210, name: "火毒巫師" }];
const html = renderToString(createElement(GuidesHub, { jobs, articles: entries })).replace(/<!-- -->/g, "");

describe("攻略專區的內容", () => {
  it("標題「攻略」，寫出幾篇", () => {
    expect(html).toMatch(/<h1[^>]*>攻略<\/h1>/);
    expect(html).toContain("3 篇");
  });

  it("活動攻略：萬聖節", () => {
    expect(html).toContain('href="/event/halloween"');
    expect(html).toContain("萬聖節任務攻略");
  });

  it("新手：1–30 懶人包、月妙、超綠組隊圖解（直接跳到那一段）", () => {
    expect(html).toContain('href="/guide"');
    expect(html).toContain('href="/guide#pq-moon"');
    expect(html).toContain('href="/guide#pq-kerning"');
  });

  it("分等級攻略：每篇都有連結，掛在自己的職業那列；職業名連職業頁", () => {
    for (const entry of entries) expect(html).toContain(`href="${entry.href}"`);
    const start = html.indexOf('href="/jobs/230"');
    const priestRow = html.slice(start, html.indexOf("</li>", start));
    expect(priestRow).toContain("/guides/priest-51-70");
    expect(priestRow).not.toContain("magician");
    expect(html).toContain('href="/jobs/210"');
  });

  it("1–30 懶人包的清單跟專區用同一個元件（不會兩邊長得不一樣）", () => {
    expect(read("../../app/guide/GuideContent.tsx")).toMatch(/<ArticleList /);
    expect(read("../../app/guides/GuidesHub.tsx")).toMatch(/<ArticleList /);
  });
});

describe("活動結束後不拿掉卡片、只換字（換字不會讓下面的東西跳）", () => {
  it("11/11 23:59 前寫到哪天，之後寫已結束", () => {
    expect(eventStatus(new Date("2026-11-11T23:00:00+08:00").getTime())).toBe("到 11/11 23:59");
    expect(eventStatus(new Date("2026-11-12T00:00:00+08:00").getTime())).toBe("活動已結束，攻略留著參考");
  });
});

describe("/guides 是一頁、給 Google 收", () => {
  const page = read("../../app/guides/page.tsx");
  it("不再轉去 /guide、不擋收錄、正式網址是自己", () => {
    expect(page).not.toContain("http-equiv");
    expect(page).not.toContain("httpEquiv");
    expect(page).not.toMatch(/index:\s*false/);
    expect(page).toMatch(/canonical:\s*"\/guides"/);
  });
  it("sitemap、llms.txt 有這頁", () => {
    expect(SITE_PAGES.find(entry => entry.path === "/guides")?.name).toBe("攻略");
  });
});

describe("麵包屑頭改「攻略」連到專區", () => {
  it("分等級攻略文、職業頁（畫面跟結構化資料）", () => {
    for (const file of ["../../app/guides/[slug]/page.tsx", "../../app/jobs/[id]/page.tsx", "../../components/JobArticleView.tsx"]) {
      const source = read(file);
      expect(source, file).not.toContain('"職業攻略"');
      expect(source, file).toContain('{ name: "攻略", path: "/guides" }');
    }
  });
  it("1–30 懶人包、萬聖節攻略", () => {
    for (const file of ["../../app/guide/GuideContent.tsx", "../../app/event/halloween/HalloweenGuide.tsx"]) {
      // 頭一格照舊是首頁（跟分等級攻略文、職業頁的 SeoPage 一樣：我的路線 › 攻略 › …）
      expect(read(file), file).toMatch(/<Link href="\/"[^>]*>我的路線<\/Link>\s*<ChevronRight size=\{13\} \/>\s*<Link href="\/guides"[^>]*>攻略<\/Link>/);
    }
  });
});

describe("帶我去改名地圖導航（v1.86，只改導覽列跟這一頁的標題）", () => {
  it("/go 的標題、麵包屑、h1", () => {
    expect(read("../../app/go/page.tsx")).toMatch(/title: "地圖導航｜/);
    const go = read("../../app/go/GoNavigator.tsx");
    expect(go).toMatch(/<h1[^>]*>地圖導航<\/h1>/);
    expect(go).toMatch(/text-\[color:var\(--ink-soft\)\]">地圖導航<\/span>/);
    expect(SITE_PAGES.find(entry => entry.path === "/go")?.name).toBe("地圖導航");
  });
  it("卡片上的「帶我去」按鈕留著（使用者選 3A）", () => {
    expect(read("../../app/go/GoNavigator.tsx")).toContain("直接按「帶我去」");
  });
});
