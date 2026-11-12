import type { Metadata } from "next";
import { notFound } from "next/navigation";
import fs from "node:fs";
import path from "node:path";
import { GuideDocView } from "@/components/GuideDocView";
import { JobArticleView } from "@/components/JobArticleView";
import { articleHeroPath, articleImages, articleRangeLabel, articleSlug, buildCalcTable, resolveArticle } from "@/lib/job-article";
import { articleLd, breadcrumbLd, OG_BASE, SITE_URL, taiwanDateTime, webPageLd } from "@/lib/seo";
import { staticArticleImages, staticCalcData, staticGuide, staticGuideDocs, staticGuideRelated, staticJobArticle, staticJobArticleKeys, staticMeta } from "@/lib/static-data";

type Props = { params: Promise<{ slug: string }> };

// 只出 src/data/job-articles/ 有檔案的範圍、src/content/guides/ 的一般攻略文（v1.88），其他一律 404（Cloudflare 靜態輸出也建得起來）
export const dynamicParams = false;

export function generateStaticParams() {
  return [...staticJobArticleKeys().map(key => ({ slug: articleSlug(key.job, key.from, key.to) })), ...staticGuideDocs().map(doc => ({ slug: doc.slug }))];
}

/** 一般攻略文的主圖：public/assets/guides/<slug>/hero.webp（16:9，scripts/guide-card-heroes.mjs 產 1536×864）；沒有就不放 */
const DOC_HERO = { w: 1536, h: 864 };
function loadDoc(slug: string) {
  const doc = staticGuideDocs().find(entry => entry.slug === slug);
  if (!doc) return undefined;
  const has = fs.existsSync(path.join(process.cwd(), "public", "assets", "guides", slug, "hero.webp"));
  return { doc, path: `/guides/${slug}`, hero: has ? { src: `/assets/guides/${slug}/hero.webp`, jpg: `/assets/guides/${slug}/hero.jpg`, ...DOC_HERO } : null };
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
  const docFound = loadDoc(slug);
  if (docFound) {
    const { doc, path: docPath, hero } = docFound;
    const image = hero ? `${SITE_URL}${hero.jpg}` : OG_BASE.images[0].url;
    return {
      // 標題本來就寫了「楓之谷經典版」，不套全站模板（不然同一個詞出現兩次）
      title: { absolute: `${doc.title}｜楓谷幫手` },
      description: doc.description,
      alternates: { canonical: docPath },
      openGraph: {
        ...OG_BASE,
        type: "article",
        title: `${doc.title}｜楓谷幫手`,
        description: doc.description,
        url: docPath,
        publishedTime: taiwanDateTime(doc.published),
        modifiedTime: taiwanDateTime(doc.updated),
        ...(hero ? { images: [{ url: image, width: hero.w, height: hero.h, alt: doc.heroAlt }] } : {}),
      },
      twitter: { card: "summary_large_image", title: doc.title, description: doc.description, images: [image] },
    };
  }
  const found = load(slug);
  if (!found) return {};
  const { article, path, images } = found;
  // 主圖還沒進清單時退回全站預覽圖，不指到不存在的檔案；缺圖由 job-article-images.test.ts 擋在合併前
  const hero = images.hero ? `${SITE_URL}${articleHeroPath(slug)}` : null;
  return {
    // 標題本來就寫了「楓之谷經典版」（11/09 規則），不套全站模板（不然同一個詞出現兩次）
    title: { absolute: `${article.title}｜楓谷幫手` },
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
  const docFound = loadDoc(slug);
  if (docFound) {
    const { doc, path: docPath, hero } = docFound;
    const image = `${SITE_URL}${hero ? hero.jpg : OG_BASE.images[0].url}`;
    return (
      <GuideDocView
        doc={doc}
        hero={hero}
        related={staticGuideRelated(docPath).related}
        jsonLd={[
          breadcrumbLd([{ name: "攻略", path: "/guides" }, { name: doc.title, path: docPath }]),
          articleLd({ headline: doc.title, description: doc.description, path: docPath, images: [image], published: doc.published, modified: doc.updated }),
          webPageLd({ name: doc.title, path: docPath, description: doc.description, modified: taiwanDateTime(doc.updated) }),
        ]}
      />
    );
  }
  const found = load(slug);
  if (!found) notFound();
  const { job, from, to, article, table, path, images } = found;
  const jobName = staticGuide(job).name;
  const jobPath = `/jobs/${job}`;
  const rangeLabel = articleRangeLabel(from, to);
  const trail = [{ name: "攻略", path: "/guides" }, { name: jobName, path: jobPath }, { name: rangeLabel, path }];
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
      related={staticGuideRelated(path)}
      jsonLd={[
        breadcrumbLd(trail),
        articleLd({ headline: article.title, description: article.description, path, images: [heroUrl], published: article.published, modified: article.updated }),
        webPageLd({ name: article.title, path, description: article.description, modified: taiwanDateTime(article.updated) }),
      ]}
    />
  );
}
