/**
 * 攻略專區的文章清單（v1.88，使用者 11/09 選 A 雜誌式）：每篇一張卡，有圖、標題、摘要、分類、標籤、日期。
 * 三種來源合在一起：職業×等級攻略文（src/data/job-articles）、一般攻略文（src/content/guides/*.md）、站上其他攻略頁（guide-pages.ts 的 GUIDE_PAGES，只在伺服器讀，篩選的程式不用載）。
 * 以後要加新類型：一般文章丟 .md 進資料夾就自動列；新頁面加進 guide-pages.ts；新分類加進 GUIDE_CATEGORIES。
 */
import { jobLineOf } from "./jobs";

export const GUIDE_CATEGORIES = ["職業攻略", "轉職", "組隊任務", "新手入門", "活動"] as const;
export type GuideCategory = (typeof GUIDE_CATEGORIES)[number];

/** 列表上那排可以點的標籤（卡片上的標籤可以更多，篩選只放這幾個） */
export const GUIDE_TAG_FILTERS = ["劍士", "法師", "弓箭手", "盜賊", "海盜", "一轉", "二轉", "三轉"] as const;

export type GuideCard = {
  href: string;
  title: string;
  excerpt: string;
  /** 16:9 主圖 */
  image: string;
  imageAlt: string;
  category: GuideCategory;
  tags: string[];
  /** YYYY-MM-DD，排序跟卡片上的日期 */
  date: string;
  /** 活動卡：卡片上那行「到幾號／已結束」 */
  event?: "halloween";
};

export const isGuideCategory = (value: string): value is GuideCategory => (GUIDE_CATEGORIES as readonly string[]).includes(value);

/** 職業的「一轉／二轉／三轉」：100 的倍數是一轉，10 的倍數是二轉，其他三轉 */
export const jobGrade = (job: number) => (job % 100 === 0 ? "一轉" : job % 10 === 0 ? "二轉" : "三轉");

export function jobArticleCard({ job, from, to, href, jobName, title, description, heroAlt, updated }: {
  job: number; from: number; to: number; href: string; jobName: string; title: string; description: string; heroAlt: string; updated: string;
}): GuideCard {
  const line = jobLineOf(job)?.line;
  const slug = href.split("/").at(-1)!;
  return {
    href,
    title,
    excerpt: description,
    image: `/assets/guides/${slug}/hero.webp`,
    imageAlt: heroAlt,
    category: "職業攻略",
    // 一轉的職業名就是職業群（劍士），不重複放
    tags: [...new Set([line, jobName, jobGrade(job), `${from}～${to} 等`].filter((tag): tag is string => Boolean(tag)))],
    date: updated,
  };
}

/** 新到舊；同一天照原本順序 */
export const sortCards = (cards: GuideCard[]) => cards.map((card, index) => ({ card, index })).sort((a, b) => b.card.date.localeCompare(a.card.date) || a.index - b.index).map(({ card }) => card);

/** 篩選：分類（全部＝null）跟標籤都要對上 */
export function filterCards(cards: readonly GuideCard[], category: GuideCategory | null, tag: string | null): GuideCard[] {
  return cards.filter(card => (!category || card.category === category) && (!tag || card.tags.includes(tag)));
}

/** 卡片上的日期：11/09 */
export const cardDate = (date: string) => date.slice(5).replace("-", "/");

/** 「全部」的卡片牆（最新那篇大圖以外）：新手先看的排前面，37 篇職業文排最後；同一類照日期新到舊 */
export const BROWSE_ORDER: readonly GuideCategory[] = ["新手入門", "組隊任務", "轉職", "活動", "職業攻略"];
export function browseOrder(cards: readonly GuideCard[]): GuideCard[] {
  return cards.map((card, index) => ({ card, index })).sort((a, b) => BROWSE_ORDER.indexOf(a.card.category) - BROWSE_ORDER.indexOf(b.card.category) || a.index - b.index).map(({ card }) => card);
}

/** 不同的頁面有幾頁（/guide 跟 /guide#pq-moon 是同一頁，不重複算） */
export const pageCount = (cards: readonly GuideCard[]) => new Set(cards.map(card => card.href.split("#")[0])).size;

/** 卡片上的摘要：開頭的「楓之谷經典版」標題已經寫了，卡片上拿掉，兩行留給內容（頁面 description 不動） */
export const cardExcerpt = (excerpt: string) => excerpt.replace(/^楓之谷經典版/, "");
