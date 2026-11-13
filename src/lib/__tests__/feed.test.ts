import { describe, expect, it } from "vitest";
import { buildRss } from "@/lib/feed";

const items = [
  { title: "舊文", path: "/guides/old", description: "舊的", date: "2026-11-01" },
  { title: "新文 <A&B>", path: "/guides/new", description: "說明 \"引號\"", date: "2026-11-12", image: "/assets/guides/new/hero.jpg" },
];

describe("feed：RSS 訂閱檔（Google 探索的「追蹤」要讀它）", () => {
  const xml = buildRss(items, "2026-11-13T00:00:00+08:00");

  it("新的排前面，網址補完整網域，日期是台灣時間 RFC 822", () => {
    expect(xml.indexOf("新文")).toBeLessThan(xml.indexOf("舊文"));
    expect(xml).toContain("<link>https://maplehelper.tw/guides/new</link>");
    expect(xml).toContain("<guid isPermaLink=\"true\">https://maplehelper.tw/guides/new</guid>");
    expect(xml).toContain("<pubDate>Thu, 12 Nov 2026 00:00:00 +0800</pubDate>");
  });

  it("特殊字元要跳脫，不然整個檔讀不了", () => {
    expect(xml).toContain("新文 &lt;A&amp;B&gt;");
    expect(xml).toContain("說明 &quot;引號&quot;");
  });

  it("有主圖才放大圖（media:content），頻道本身寫站名、自己的網址", () => {
    expect(xml).toContain('<media:content url="https://maplehelper.tw/assets/guides/new/hero.jpg" medium="image"/>');
    expect(xml.match(/<media:content/g)).toHaveLength(1);
    expect(xml).toContain('<atom:link href="https://maplehelper.tw/feed.xml" rel="self" type="application/rss+xml"/>');
    expect(xml).toContain("<language>zh-TW</language>");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it("最多 50 篇", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ title: `t${i}`, path: `/p${i}`, description: "d", date: "2026-11-01" }));
    expect(buildRss(many, "2026-11-13T00:00:00+08:00").match(/<item>/g)).toHaveLength(50);
  });
});
