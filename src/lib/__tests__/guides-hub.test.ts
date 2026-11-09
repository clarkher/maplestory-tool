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
import { browseOrder, cardExcerpt, filterCards, jobArticleCard, pageCount, sortCards, type GuideCard } from "@/lib/guide-catalog";
import { GUIDE_PAGES } from "@/lib/guide-pages";
import { SITE_PAGES } from "@/lib/site-pages";

const read = (rel: string) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const entries: ArticleEntry[] = [
  { job: 230, from: 31, to: 50, href: "/guides/priest-31-50" },
  { job: 230, from: 51, to: 70, href: "/guides/priest-51-70" },
  { job: 200, from: 10, to: 30, href: "/guides/magician-10-30" },
];
const jobs = [{ job: 200, name: "法師" }, { job: 230, name: "僧侶" }, { job: 210, name: "火毒巫師" }];
const card = (over: Partial<GuideCard>): GuideCard => ({
  href: "/x", title: "楓之谷經典版 x", excerpt: "摘要", image: "/a.webp", imageAlt: "圖", category: "職業攻略", tags: [], date: "2026-11-01", ...over,
});
const cards: GuideCard[] = sortCards([
  card({ href: "/guides/third-job", title: "楓之谷經典版三轉攻略", category: "轉職", tags: ["三轉", "法師"], date: "2026-11-09" }),
  card({ href: "/guides/priest-31-50", title: "楓之谷經典版僧侶 31～50", tags: ["法師", "僧侶", "二轉"], date: "2026-11-05" }),
  ...GUIDE_PAGES,
]);
const props = { cards, jobs, articles: entries };
const html = renderToString(createElement(GuidesHub, props)).replace(/<!-- -->/g, "");

describe("攻略專區的內容", () => {
  it("標題「攻略」，寫出幾篇（同一頁的錨點不重複算）", () => {
    expect(html).toMatch(/<h1[^>]*>攻略<\/h1>/);
    expect(pageCount(cards)).toBe(cards.length - 2);
    expect(html).toContain(`攻略 ${pageCount(cards)} 篇`);
  });

  it("頁頂一行跳到「依職業看」", () => {
    expect(html).toContain('href="#articles"');
    expect(html).toContain('id="articles"');
  });

  it("「全部」時新手先看的排前面、職業文排最後（大圖照舊是最新那篇）", () => {
    const order = browseOrder(cards.slice(1)).map(c => c.category);
    expect(order[0]).toBe("新手入門");
    expect(order.at(-1)).toBe("職業攻略");
    const at = (href: string) => html.indexOf(`href="${href}"`);
    expect(at("/guides/third-job")).toBeLessThan(at("/guide"));
    expect(at("/guide")).toBeLessThan(at("/guides/priest-31-50"));
  });

  it("卡片摘要開頭的「楓之谷經典版」拿掉（標題已經寫了）", () => {
    expect(cardExcerpt("楓之谷經典版僧侶 31～50")).toBe("僧侶 31～50");
    expect(cardExcerpt("三轉全流程")).toBe("三轉全流程");
  });

  it("雜誌式（v1.88 選 A）：最新一篇大圖在最上面、其他是圖上字下的卡片，每張都有圖", () => {
    const first = html.indexOf('href="/guides/third-job"');
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(html.indexOf('href="/guides/priest-31-50"'));
    expect(html.slice(first, html.indexOf("</a>", first))).toContain('fetchPriority="high"');
    for (const entry of cards) {
      const at = html.indexOf(`href="${entry.href}"`);
      expect(html.slice(at, html.indexOf("</a>", at)), entry.href).toContain(`src="${entry.image}"`);
    }
  });

  it("活動、新手、組隊圖解都在卡片裡（萬聖節卡寫到幾號）", () => {
    for (const href of ["/event/halloween", "/guide", "/guide#pq-moon", "/guide#pq-kerning"]) expect(html).toContain(`href="${href}"`);
    expect(html).toMatch(/到 11\/11 23:59|活動已結束/);
  });

  it("站上攻略頁的標題都有「楓之谷經典版」", () => {
    for (const page of GUIDE_PAGES) expect(page.title, page.href).toContain("楓之谷經典版");
  });

  it("分類只列有文章的；標籤固定那幾個", () => {
    expect(html).toContain(">全部</button>");
    expect(html).toContain(">轉職</button>");
    expect(html).not.toContain(">職業攻略文</button>");
    // 標籤寫篇數，0 篇的點不了
    expect(html).toMatch(/>#三轉 1<\/button>/);
    expect(html).toMatch(/disabled=""[^>]*>#海盜 0<\/button>/);
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

describe("分類、標籤篩選", () => {
  it("分類跟標籤要同時對上；全部＝不篩", () => {
    expect(filterCards(cards, null, null)).toHaveLength(cards.length);
    expect(filterCards(cards, "轉職", null).map(c => c.href)).toEqual(["/guides/third-job"]);
    expect(filterCards(cards, null, "法師").map(c => c.href)).toEqual(["/guides/third-job", "/guides/priest-31-50"]);
    expect(filterCards(cards, "活動", "法師")).toEqual([]);
  });
});

describe("職業攻略文的卡片", () => {
  it("圖用那篇的主圖；標籤：職業群、職業、幾轉、等級段（一轉不重複）", () => {
    const priest = jobArticleCard({ job: 230, from: 31, to: 50, href: "/guides/priest-31-50", jobName: "僧侶", title: "t", description: "d", heroAlt: "a", updated: "2026-11-05" });
    expect(priest.image).toBe("/assets/guides/priest-31-50/hero.webp");
    expect(priest.tags).toEqual(["法師", "僧侶", "二轉", "31～50 等"]);
    const magician = jobArticleCard({ job: 200, from: 10, to: 30, href: "/guides/magician-10-30", jobName: "法師", title: "t", description: "d", heroAlt: "a", updated: "2026-11-05" });
    expect(magician.tags).toEqual(["法師", "一轉", "10～30 等"]);
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
