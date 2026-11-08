/**
 * 攻略文的入口（v1.85，使用者選 A＋C）：本來只有職業頁底下連得到，使用者說「好難找」。
 * A：首頁存過角色的人，主推卡下面一張卡連到「你這個職業、這個等級」的那篇。
 * C：1–30 懶人包頁頂一行跳到清單，清單每個職業一列、列出所有等級段的文章。
 * 讀真的文章檔要驗 37 篇，電腦忙時 5 秒跑不完，時限放寬（跟 gear 測試同一招）。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuideContent } from "@/app/guide/GuideContent";
import { articleFor, type ArticleEntry } from "@/lib/article-entry";
import { staticArticleEntries, staticGuideJobs } from "@/lib/static-data";

const entries: ArticleEntry[] = [
  { job: 230, from: 31, to: 50, href: "/guides/priest-31-50" },
  { job: 230, from: 51, to: 70, href: "/guides/priest-51-70" },
  { job: 200, from: 10, to: 30, href: "/guides/magician-10-30" },
];

describe("首頁：你這個職業、這個等級的攻略文（A）", () => {
  it("同職業、等級落在範圍內（含頭尾）", () => {
    expect(articleFor(entries, 230, 31)?.href).toBe("/guides/priest-31-50");
    expect(articleFor(entries, 230, 50)?.href).toBe("/guides/priest-31-50");
    expect(articleFor(entries, 230, 51)?.href).toBe("/guides/priest-51-70");
    expect(articleFor(entries, 200, 12)?.href).toBe("/guides/magician-10-30");
  });

  it("沒有那篇就不給（別的職業、等級超出、初心者）", () => {
    expect(articleFor(entries, 230, 71)).toBeUndefined();
    expect(articleFor(entries, 210, 40)).toBeUndefined();
    expect(articleFor(entries, 0, 8)).toBeUndefined();
  });

  it("首頁伺服器那層把文章清單交給 RouteHome", () => {
    const page = fs.readFileSync(fileURLToPath(new URL("../../app/page.tsx", import.meta.url)), "utf8");
    expect(page).toMatch(/<RouteHome articles=\{staticArticleEntries\(\)\}/);
  });
});

describe("1–30 懶人包：攻略文清單（C）", () => {
  const jobs = [{ job: 200, name: "法師" }, { job: 230, name: "僧侶" }, { job: 210, name: "火毒巫師" }];
  const html = renderToString(createElement(GuideContent, { jobs, articles: entries })).replace(/<!-- -->/g, "");

  it("頁頂一行跳到清單，寫出幾篇", () => {
    const top = html.slice(0, html.indexOf("選擇職業"));
    expect(top).toMatch(/<a[^>]*href="#articles"[^>]*>[^<]*3 篇[^<]*<\/a>/);
    expect(html).toMatch(/id="articles"/);
  });

  it("每篇都有連結，掛在自己的職業那列", () => {
    for (const entry of entries) expect(html).toContain(`href="${entry.href}"`);
    const priestRow = html.slice(html.indexOf('href="/jobs/230"'), html.indexOf("</li>", html.indexOf('href="/jobs/230"')));
    expect(priestRow).toContain("/guides/priest-31-50");
    expect(priestRow).toContain("/guides/priest-51-70");
    expect(priestRow).not.toContain("magician");
  });

  it("沒有文章的職業照樣列職業頁", () => {
    expect(html).toContain('href="/jobs/210"');
  });

  it("真的檔案：37 篇以上、每篇都有網址", () => {
    const real = staticArticleEntries();
    expect(real.length).toBeGreaterThanOrEqual(37);
    for (const entry of real) expect(entry.href).toMatch(/^\/guides\/[a-z-]+-\d+-\d+$/);
  }, 120_000);

  it("真的檔案：每篇的職業都在清單上（不然那篇在懶人包裡沒有列可以掛）", () => {
    const jobs = new Set(staticGuideJobs());
    for (const entry of staticArticleEntries()) expect(jobs.has(entry.job), entry.href).toBe(true);
  }, 120_000);
});
