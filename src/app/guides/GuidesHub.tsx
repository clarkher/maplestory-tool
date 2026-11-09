"use client";

import Link from "next/link";
import { useState } from "react";
import { ArticleList } from "@/components/ArticleList";
import type { ArticleEntry } from "@/lib/article-entry";
import { GUIDE_CATEGORIES, GUIDE_TAG_FILTERS, browseOrder, cardDate, cardExcerpt, filterCards, pageCount, type GuideCard, type GuideCategory } from "@/lib/guide-catalog";
import { EventStatus } from "./EventStatus";

/**
 * 攻略專區 /guides（v1.88，使用者 11/09 選 A 雜誌式）：最新一篇大圖在上面，下面圖上字下的卡片牆；分類、標籤可以篩。
 * 卡片來源是 staticGuideCards()（職業攻略文＋src/content/guides 一般文＋站上攻略頁），以後加新類型不用改這裡。
 * 最下面照舊放「依職業看」（v1.86 那份職業×等級清單），頁頂一行跳過去。
 * 「全部」時卡片牆新手先看的排前面（browseOrder），篩選後照日期新到舊。
 */
// 手機好點：分類 36px 高、標籤 32px 高
const pill = (on: boolean) =>
  `min-h-9 shrink-0 rounded-full px-3.5 text-[13px] font-bold transition-colors ${
    on ? "bg-[color:var(--maple)] text-[color:var(--on-accent)]" : "bg-[color:var(--paper-deep)] ink-soft hover:text-[color:var(--ink)]"
  }`;

function Meta({ card, builtAt }: { card: GuideCard; builtAt: number }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] ink-faint">
      <span className="font-bold text-[color:var(--maple)]">{card.category}</span>
      {card.event ? (
        <span className="font-bold text-[color:var(--maple)]">
          <EventStatus builtAt={builtAt} />
        </span>
      ) : null}
      <span>{cardDate(card.date)}</span>
    </span>
  );
}

function Tags({ tags }: { tags: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map(tag => (
        <span key={tag} className="rounded-full bg-[color:var(--paper-deep)] px-2 py-0.5 text-[11px] ink-soft">
          {tag}
        </span>
      ))}
    </span>
  );
}

function Featured({ card, builtAt }: { card: GuideCard; builtAt: number }) {
  return (
    <Link href={card.href} className="group block overflow-hidden rounded-[var(--radius-card)] glass wood-frame">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={card.image} alt={card.imageAlt} width={1536} height={864} fetchPriority="high" className="aspect-video w-full object-cover" />
      <span className="block space-y-1.5 p-4">
        <Meta card={card} builtAt={builtAt} />
        <span className="block text-[20px] font-black leading-snug tracking-tight group-hover:underline sm:text-[24px]">{card.title}</span>
        <span className="block text-[14px] leading-relaxed ink-soft">{cardExcerpt(card.excerpt)}</span>
        <Tags tags={card.tags} />
      </span>
    </Link>
  );
}

function Card({ card, builtAt }: { card: GuideCard; builtAt: number }) {
  return (
    <Link href={card.href} className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] glass wood-frame transition-transform hover:-translate-y-0.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={card.image} alt={card.imageAlt} width={768} height={432} loading="lazy" className="aspect-video w-full object-cover" />
      <span className="flex flex-1 flex-col gap-1.5 p-3">
        <Meta card={card} builtAt={builtAt} />
        <span className="block font-bold leading-snug group-hover:underline">{card.title}</span>
        <span className="line-clamp-2 text-[13px] leading-snug ink-soft">{cardExcerpt(card.excerpt)}</span>
        <span className="mt-auto pt-1">
          <Tags tags={card.tags} />
        </span>
      </span>
    </Link>
  );
}

export function GuidesHub({
  cards,
  jobs,
  articles,
  builtAt = 0,
}: {
  cards: readonly GuideCard[];
  jobs: ReadonlyArray<{ job: number; name: string }>;
  articles: readonly ArticleEntry[];
  builtAt?: number;
}) {
  const [category, setCategory] = useState<GuideCategory | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const shown = filterCards(cards, category, tag);
  const [first, ...others] = shown;
  const rest = category || tag ? others : browseOrder(others);
  const counts = new Map(GUIDE_CATEGORIES.map(name => [name, cards.filter(card => card.category === name).length]));
  // 標籤後面寫目前分類下有幾篇；0 篇的點不了（選著的除外，才點得掉）
  const tagCounts = new Map(GUIDE_TAG_FILTERS.map(name => [name, filterCards(cards, category, name).length]));

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-4 sm:py-8">
      <header className="px-1">
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">攻略</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">楓之谷經典版攻略 {pageCount(cards)} 篇：每個職業每段等級去哪練、轉職、組隊任務、活動，數字照遊戲資料算。</p>
        <a href="#articles" className="mt-1 inline-block text-[14px] font-bold text-[color:var(--sky)] underline underline-offset-4">
          直接找你的職業、等級
        </a>
      </header>

      <nav aria-label="分類" className="scroll-x -mx-1 flex gap-2 px-1 pb-1">
        <button type="button" className={pill(category === null)} aria-pressed={category === null} onClick={() => setCategory(null)}>
          全部
        </button>
        {GUIDE_CATEGORIES.filter(name => counts.get(name)).map(name => (
          <button key={name} type="button" className={pill(category === name)} aria-pressed={category === name} onClick={() => setCategory(category === name ? null : name)}>
            {name}
          </button>
        ))}
      </nav>
      <nav aria-label="標籤" className="flex flex-wrap gap-1.5 px-1">
        {GUIDE_TAG_FILTERS.map(name => (
          <button
            key={name}
            type="button"
            aria-pressed={tag === name}
            disabled={tag !== name && !tagCounts.get(name)}
            onClick={() => setTag(tag === name ? null : name)}
            className={`min-h-8 rounded-full border px-3 text-[12px] transition-colors disabled:opacity-40 ${
              tag === name
                ? "border-[color:var(--maple)] bg-[color:var(--maple)] font-bold text-[color:var(--on-accent)]"
                : "border-[color:var(--paper-edge)] ink-soft hover:text-[color:var(--ink)]"
            }`}
          >
            #{name} {tagCounts.get(name)}
          </button>
        ))}
      </nav>

      {first ? (
        <>
          <Featured card={first} builtAt={builtAt} />
          {rest.length ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map(card => (
                <li key={card.href}>
                  <Card card={card} builtAt={builtAt} />
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="rounded-[var(--radius-card)] glass wood-frame p-4 text-[14px] ink-soft">
          這個分類還沒有這個標籤的攻略。
          <button type="button" className="ml-1 font-bold text-[color:var(--sky)] underline underline-offset-4" onClick={() => (setCategory(null), setTag(null))}>
            看全部
          </button>
        </p>
      )}

      <section id="articles" aria-label="依職業看" className="scroll-mt-header space-y-2">
        <h2 className="px-1 text-sm font-bold ink-soft">依職業看</h2>
        <div className="rounded-[var(--radius-card)] glass wood-frame px-4 py-2">
          <p className="pt-2 text-[13px] ink-soft">點等級看那一段去哪練、幾下打死、必解任務；點職業看整個職業的配點、技能點法。</p>
          <ArticleList jobs={jobs} articles={articles} />
        </div>
      </section>
    </div>
  );
}
