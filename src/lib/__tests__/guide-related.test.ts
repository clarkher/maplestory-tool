/**
 * 攻略文互導索引＋延伸閱讀（v2.19，使用者 11/12 照推薦）：頁首等級條、文末下一段大卡＋3 張相關。
 * 擋：每篇至少 3 張相關、連到的頁都存在、職業線接得起來、新文章沒登記規則表。
 */
import { describe, expect, it } from "vitest";
import type { GuideCard } from "@/lib/guide-catalog";
import { GUIDE_PAGES } from "@/lib/guide-pages";
import { jobSeries, pickRelated, RELATED_MIN, RELATED_RULES, type SeriesEntry } from "@/lib/guide-related";
import { staticArticleEntries, staticGuideDocs, staticGuideRelated } from "@/lib/static-data";

const card = (href: string, title = `楓之谷經典版 ${href}`): GuideCard => ({
  href, title, excerpt: "摘要", image: "/a.webp", imageAlt: "圖", category: "任務", tags: [], date: "2026-11-01",
});

const e = (job: number, from: number, to: number, jobName: string): SeriesEntry => ({ job, from, to, jobName, href: `/guides/${job}-${from}-${to}` });
const ENTRIES = [
  e(200, 10, 30, "法師"),
  e(210, 31, 50, "火毒巫師"),
  e(230, 31, 50, "僧侶"),
  e(230, 51, 70, "僧侶"),
  e(231, 71, 90, "祭司"),
  e(231, 91, 120, "祭司"),
  e(300, 10, 30, "弓箭手"),
];

describe("jobSeries 等級條", () => {
  it("二轉文：一轉那篇＋同一條二轉線（含三轉）照等級排，標本篇，下一段是下一格", () => {
    const s = jobSeries(ENTRIES, 230, 31);
    expect(s.title).toBe("僧侶這條線");
    expect(s.items.map(item => item.href)).toEqual(["/guides/200-10-30", "/guides/230-31-50", "/guides/230-51-70", "/guides/231-71-90", "/guides/231-91-120"]);
    expect(s.items.filter(item => item.here).map(item => item.href)).toEqual(["/guides/230-31-50"]);
    expect(s.next?.href).toBe("/guides/230-51-70");
  });

  it("三轉最後一篇沒有下一段", () => {
    expect(jobSeries(ENTRIES, 231, 91).next).toBeUndefined();
  });

  it("一轉文：自己＋每條二轉線的第一篇，標題講分岔，沒有下一段大卡", () => {
    const s = jobSeries(ENTRIES, 200, 10);
    expect(s.title).toBe("法師之後走哪條");
    expect(s.items.map(item => item.href)).toEqual(["/guides/200-10-30", "/guides/210-31-50", "/guides/230-31-50"]);
    expect(s.next).toBeUndefined();
  });
});

describe("pickRelated 相關文章", () => {
  const pool = [card("/guides/a"), card("/guides/b"), card("/guides/c"), card("/guides/d"), card("/guides/old")];
  const rules = {
    "/guides/a": { from: 1, to: 30, rank: 2 },
    "/guides/b": { from: 31, to: 90, rank: 1 },
    "/guides/c": { from: 10, to: 120, rank: 3 },
    "/guides/d": { from: 1, to: 120, rank: 4 },
    "/guides/old": { from: 1, to: 120, rank: 0, until: "2026-11-01" },
  };
  const now = new Date("2026-11-12T12:00:00+08:00").getTime();

  it("只挑等級範圍有重疊的，照 rank 排，過期的活動拿掉，取 3 張", () => {
    expect(pickRelated({ href: "/guides/x", from: 31, to: 50, cards: pool, rules, now }).map(c => c.href)).toEqual(["/guides/b", "/guides/c", "/guides/d"]);
  });

  it("不放自己、不放下一段那篇；手動 related 排最前面", () => {
    const got = pickRelated({ href: "/guides/b", from: 31, to: 50, cards: pool, rules, now, exclude: ["/guides/c"], override: ["/guides/a"] });
    expect(got.map(c => c.href)).toEqual(["/guides/a", "/guides/d"]);
  });

  it("手動 related 寫了不存在的頁會丟錯", () => {
    expect(() => pickRelated({ href: "/guides/x", from: 1, to: 30, cards: pool, rules, now, override: ["/guides/nope"] })).toThrow(/nope/);
  });

  it("卡片標題拿掉開頭的「楓之谷經典版」", () => {
    expect(pickRelated({ href: "/guides/x", from: 1, to: 30, cards: [card("/guides/a", "楓之谷經典版三轉攻略")], rules, now })[0].title).toBe("三轉攻略");
  });
});

describe("真資料：每一篇攻略文", () => {
  const docs = staticGuideDocs();
  const entries = staticArticleEntries();
  const pages = [...entries.map(entry => entry.href), ...docs.map(doc => `/guides/${doc.slug}`)];
  const existing = new Set([...pages, ...GUIDE_PAGES.map(page => page.href)]);

  it("新的 .md 文章、攻略頁都要在 RELATED_RULES 登記等級範圍", () => {
    const missing = [...docs.map(doc => `/guides/${doc.slug}`), ...GUIDE_PAGES.map(page => page.href)].filter(href => !RELATED_RULES[href]);
    expect(missing, "到 src/lib/guide-related.ts 的 RELATED_RULES 登記：這篇給幾等的人看").toEqual([]);
  });

  it(`每篇相關卡至少 ${RELATED_MIN} 張，連到的頁（相關、下一段、等級條）都存在`, () => {
    const problems = pages.flatMap(href => {
      const r = staticGuideRelated(href);
      const links = [...r.related.map(c => c.href), ...(r.next ? [r.next.href] : []), ...(r.series?.items.map(item => item.href) ?? [])];
      return [
        ...(r.related.length >= RELATED_MIN ? [] : [`${href}：相關只有 ${r.related.length} 張`]),
        ...links.filter(link => !existing.has(link)).map(link => `${href} 連到不存在的 ${link}`),
        ...(r.related.some(c => c.href === href) ? [`${href} 相關連到自己`] : []),
      ];
    });
    expect(problems).toEqual([]);
  }, 120_000);

  it(`活動全部結束以後（2027 年）每篇還是有 ${RELATED_MIN} 張`, () => {
    const later = new Date("2027-01-01T00:00:00+08:00").getTime();
    expect(pages.filter(href => staticGuideRelated(href, later).related.length < RELATED_MIN)).toEqual([]);
  }, 120_000);

  it("職業線接得起來：二轉、三轉文的等級條從同系一轉文開始、等級照順序不重疊，本篇剛好一格", () => {
    const problems = entries.flatMap(entry => {
      const s = staticGuideRelated(entry.href).series;
      if (!s) return [`${entry.href} 沒有等級條`];
      const here = s.items.filter(item => item.here);
      const out = here.length === 1 && here[0].href === entry.href ? [] : [`${entry.href} 本篇標記不對`];
      if (entry.job % 100 === 0) return out;
      const root = entries.find(other => other.job === entry.job - (entry.job % 100) && other.from === 10);
      if (s.items[0]?.href !== root?.href) out.push(`${entry.href} 等級條沒從一轉文開始`);
      s.items.forEach((item, i) => { if (i && item.from <= s.items[i - 1].to) out.push(`${entry.href} 等級條 ${item.href} 跟上一格重疊或倒序`); });
      return out;
    });
    expect(problems).toEqual([]);
  }, 120_000);
});
