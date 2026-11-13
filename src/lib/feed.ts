/**
 * /feed.xml：RSS 2.0 訂閱檔（v2.23，11/13 使用者選 1）。
 * Google App 的「追蹤」網站要讀這個檔，追蹤的人新文章會出現在他的 Google 探索（Discover）；
 * 其他 RSS 閱讀器也能訂。只放文章（攻略文、改版整理），不放上千筆資料頁。
 */
import { SITE_NAME, SITE_URL } from "./seo";

export type FeedItem = {
  title: string;
  /** 站內路徑，/guides/xxx */
  path: string;
  description: string;
  /** 發布日 YYYY-MM-DD（台灣時間） */
  date: string;
  /** 主圖站內路徑；沒有就不放 */
  image?: string;
};

const FEED_MAX = 50;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** RSS 要 RFC 822：「Thu, 12 Nov 2026 00:00:00 +0800」。日期當台灣零點，不經過 Date 的時區換算 */
function rfc822(date: string, time = "00:00:00"): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const day = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${day}, ${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y} ${time} +0800`;
}

export function buildRss(items: FeedItem[], builtAt: string): string {
  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date)).slice(0, FEED_MAX);
  const entries = sorted.map(item => {
    const url = `${SITE_URL}${item.path}`;
    return [
      "<item>",
      `<title>${escape(item.title)}</title>`,
      `<link>${url}</link>`,
      `<guid isPermaLink="true">${url}</guid>`,
      `<description>${escape(item.description)}</description>`,
      `<pubDate>${rfc822(item.date)}</pubDate>`,
      ...(item.image ? [`<media:content url="${SITE_URL}${item.image}" medium="image"/>`] : []),
      "</item>",
    ].join("");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">',
    "<channel>",
    `<title>${SITE_NAME}｜楓之谷經典版攻略</title>`,
    `<link>${SITE_URL}/</link>`,
    "<description>楓之谷經典版（台服）各職業升級攻略、活動攻略、改版整理</description>",
    "<language>zh-TW</language>",
    `<lastBuildDate>${rfc822(builtAt.slice(0, 10), builtAt.slice(11, 19) || "00:00:00")}</lastBuildDate>`,
    `<atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>`,
    ...entries,
    "</channel>",
    "</rss>",
  ].join("\n");
}
