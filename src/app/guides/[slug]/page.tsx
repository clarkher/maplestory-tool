import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobArticleView } from "@/components/JobArticleView";
import { articleHeroPath, articleImages, articleRangeLabel, articleSlug, buildCalcTable, resolveArticle } from "@/lib/job-article";
import { articleLd, breadcrumbLd, OG_BASE, SITE_URL, taiwanDateTime, webPageLd } from "@/lib/seo";
import { staticArticleImages, staticCalcData, staticGuide, staticJobArticle, staticJobArticleKeys, staticMeta } from "@/lib/static-data";

type Props = { params: Promise<{ slug: string }> };

// 只出 src/data/job-articles/ 有檔案的範圍，其他一律 404（Cloudflare 靜態輸出也建得起來）
export const dynamicParams = false;

export function generateStaticParams() {
  return staticJobArticleKeys().map(key => ({ slug: articleSlug(key.job, key.from, key.to) }));
}

/** 網址對得上文章檔才算；文字換好代號（換不掉會丟錯，建置失敗） */
function load(slug: string) {
  const key = staticJobArticleKeys().find(entry => articleSlug(entry.job, entry.from, entry.to) === slug);
  if (!key) return undefined;
  const raw = staticJobArticle(key.job, key.from, key.to);
  if (!raw) return undefined;
  const data = staticCalcData();
  const table = buildCalcTable({ ...key, data, gear: raw.gear, statCap: raw.statCap });
  return { ...key, slug, table, article: resolveArticle(raw, table, data), path: `/guides/${slug}`, images: articleImages(staticArticleImages(), slug) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = load(slug);
  if (!found) return {};
  const { article, path, images } = found;
  // 主圖還沒進清單時退回全站預覽圖，不指到不存在的檔案；缺圖由 job-article-images.test.ts 擋在合併前
  const hero = images.hero ? `${SITE_URL}${articleHeroPath(slug)}` : null;
  return {
    title: article.title,
    description: article.description,
    alternates: { canonical: path },
    openGraph: {
      ...OG_BASE,
      type: "article",
      title: `${article.title}｜楓谷幫手`,
      description: article.description,
      url: path,
      publishedTime: taiwanDateTime(article.published),
      modifiedTime: taiwanDateTime(article.updated),
      ...(hero && images.hero ? { images: [{ url: hero, width: images.hero.w, height: images.hero.h, alt: article.heroAlt }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
      images: [hero ?? OG_BASE.images[0].url],
    },
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const found = load(slug);
  if (!found) notFound();
  const { job, from, to, article, table, path, images } = found;
  const jobName = staticGuide(job).name;
  const jobPath = `/jobs/${job}`;
  const rangeLabel = articleRangeLabel(from, to);
  const trail = [{ name: "職業攻略", path: "/guide" }, { name: jobName, path: jobPath }, { name: rangeLabel, path }];
  const data = staticCalcData();
  const heroUrl = `${SITE_URL}${images.hero ? articleHeroPath(slug) : OG_BASE.images[0].url}`;
  return (
    <JobArticleView
      jobName={jobName}
      rangeLabel={rangeLabel}
      path={path}
      jobPath={jobPath}
      article={article}
      table={table}
      monsters={new Map(data.monsters.map(monster => [monster.id, monster]))}
      maps={data.maps}
      dataNote={`依遊戲資料 ${staticMeta().gameVersion ?? "最新版"} 計算。`}
      images={images}
      jsonLd={[
        breadcrumbLd(trail),
        articleLd({ headline: article.title, description: article.description, path, images: [heroUrl], published: article.published, modified: article.updated }),
        webPageLd({ name: article.title, path, description: article.description, modified: taiwanDateTime(article.updated) }),
      ]}
    />
  );
}
