import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { shareOgTitle, sharePageIds, sharePageName } from "@/lib/rename/share-pages";
import { OG_BASE, ogImages } from "@/lib/seo";
import { RenameGame } from "../../RenameGame";

/**
 * 名字變怪物的分享頁（v2.44）：每隻能配到的怪一頁（含換色的 alt）＋一坨 /m/poop。
 * 筆畫在網址 #r=...（不送伺服器），頁面打開就重播那一輪；解不開就只顯示這隻怪的結果卡＋［換我寫］。
 * 不給搜尋引擎收（noindex），也不進 sitemap；預覽圖由 scripts/og/build-og.mjs 照 og:title 畫（怪配怪圖、一坨只有字）。
 */
type Props = { params: Promise<{ id: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return sharePageIds().map(id => ({ id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = (await params).id;
  const n = sharePageName(id);
  if (n === undefined) return {};
  const path = `/plan/rename/m/${id}`;
  const title = shareOgTitle(n);
  const description = n
    ? `在冒險者登記書簽上 ID，多的筆畫被收走，留下的拼成了「${n}」。換你寫寫看會變成哪一隻楓之谷經典版的怪物。`
    : "在冒險者登記書簽上 ID，筆畫全掉下來堆成一坨。換你寫寫看會變成哪一隻楓之谷經典版的怪物。";
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index: false, follow: true },
    openGraph: { ...OG_BASE, title, description, url: path, images: ogImages(path, n ?? "一坨") },
  };
}

export default async function Page({ params }: Props) {
  const id = (await params).id;
  const n = sharePageName(id);
  if (n === undefined) notFound();
  return (
    <div className="mx-auto max-w-2xl space-y-3.5 py-3 sm:py-6">
      <header>
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">名字變怪物</h1>
      </header>
      <RenameGame replay={{ id: id === "poop" ? "poop" : Number(id) }} />
    </div>
  );
}
