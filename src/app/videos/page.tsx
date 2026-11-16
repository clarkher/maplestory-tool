import type { Metadata } from "next";
import { MainGrid, ShortsRow } from "@/components/VideoLists";
import { OG_BASE, ogImages } from "@/lib/seo";
import { CHANNEL_URL, coverSrc, visibleEpisodes } from "@/lib/videos";

/**
 * 影片區（v2.32，使用者 11/16 照推薦 1A 2A 3A）：YouTube 頻道「楓谷幫手」的短影音一排、正片一格一格。
 * 不放廣告（YouTube API 稽核草稿寫了放 YouTube 的頁面不放廣告）。清單在 src/lib/videos.ts。
 */
const TITLE = "楓之谷經典版影片｜工具怎麼用、活動重點 30 秒看懂";
const DESCRIPTION = "楓谷幫手的影片：楓之谷經典版的地圖怎麼走、打怪幾下、楓葉武器怎麼衝、活動什麼時候開，短影音跟正片都在這。";
const SITE = "https://maplehelper.tw";

export const metadata: Metadata = {
  title: { absolute: `${TITLE}｜楓谷幫手` },
  description: DESCRIPTION,
  alternates: { canonical: "/videos" },
  openGraph: { ...OG_BASE, title: `${TITLE}｜楓谷幫手`, description: DESCRIPTION, url: "/videos", images: ogImages("/videos", TITLE) },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function Page() {
  const builtAt = Date.now();
  // Google 的影片資料：只寫建置時已經公開的
  const ld = visibleEpisodes(builtAt).flatMap(ep =>
    [ep.main, ep.shorts].filter(Boolean).map(id => ({
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: `楓之谷經典版 ${ep.title}`,
      description: ep.summary,
      thumbnailUrl: `${SITE}${coverSrc(id!)}`,
      uploadDate: ep.publishAt,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      url: `https://www.youtube.com/watch?v=${id}`,
    })),
  );
  return (
    <div className="mx-auto max-w-5xl space-y-6 py-4 sm:py-8">
      <header className="px-1">
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">影片</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">楓之谷經典版的工具怎麼用、活動重點，30 秒看懂。</p>
        <a href={CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[14px] font-bold text-[color:var(--sky)] underline underline-offset-4">
          到 YouTube 訂閱楓谷幫手，新片出來就看得到
        </a>
      </header>

      <section aria-label="短影音" className="space-y-2">
        <h2 className="px-1 text-sm font-bold ink-soft">短影音</h2>
        <ShortsRow builtAt={builtAt} page="videos" />
      </section>

      <section aria-label="正片" className="space-y-2">
        <h2 className="px-1 text-sm font-bold ink-soft">正片</h2>
        <MainGrid builtAt={builtAt} />
      </section>

      {ld.map((data, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\u003c") }} />
      ))}
    </div>
  );
}
