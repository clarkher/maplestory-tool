import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobArticleView } from "@/components/JobArticleView";
import { articlePath, articleRangeLabel, buildCalcTable, resolveArticle } from "@/lib/job-article";
import { dataSyncedText } from "@/lib/format";
import { breadcrumbLd, OG_BASE, webPageLd } from "@/lib/seo";
import { staticCalcData, staticGuide, staticJobArticle, staticJobArticleKeys, staticMeta, staticModified } from "@/lib/static-data";

type Props = { params: Promise<{ id: string; range: string }> };

// 只出 src/data/job-articles/ 有檔案的範圍，其他一律 404（Cloudflare 靜態輸出也建得起來）
export const dynamicParams = false;

export function generateStaticParams() {
  return staticJobArticleKeys().map(key => ({ id: String(key.job), range: `${key.from}-${key.to}` }));
}

/** 網址對得上文章檔才算；文字換好代號（換不掉會丟錯，建置失敗） */
function load(id: string, range: string) {
  const key = staticJobArticleKeys().find(entry => String(entry.job) === id && `${entry.from}-${entry.to}` === range);
  if (!key) return undefined;
  const raw = staticJobArticle(key.job, key.from, key.to);
  if (!raw) return undefined;
  const table = buildCalcTable({ ...key, data: staticCalcData() });
  return { ...key, table, article: resolveArticle(raw, table), path: articlePath(key.job, key.from, key.to) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, range } = await params;
  const found = load(id, range);
  if (!found) return {};
  const { article, path } = found;
  return {
    title: article.title,
    description: article.description,
    alternates: { canonical: path },
    openGraph: { ...OG_BASE, title: `${article.title}｜楓谷幫手`, description: article.description, url: path },
  };
}

export default async function Page({ params }: Props) {
  const { id, range } = await params;
  const found = load(id, range);
  if (!found) notFound();
  const { job, from, to, article, table, path } = found;
  const jobName = staticGuide(job).name;
  const rangeLabel = articleRangeLabel(from, to);
  const trail = [{ name: "職業攻略", path: "/guide" }, { name: jobName, path: `/jobs/${job}` }, { name: rangeLabel, path }];
  const data = staticCalcData();
  const meta = staticMeta();
  // 上游只改內容時產生時間不會動，日期用同步時間（跟頁尾同一個）
  const synced = dataSyncedText(meta).slice(0, 10);
  return (
    <JobArticleView
      jobName={jobName}
      rangeLabel={rangeLabel}
      path={path}
      article={article}
      table={table}
      monsters={new Map(data.monsters.map(monster => [monster.id, monster]))}
      maps={data.maps}
      dataNote={`依遊戲資料 ${meta.gameVersion ?? "最新版"}${synced ? `（${synced}）` : ""}計算。`}
      jsonLd={[breadcrumbLd(trail), webPageLd({ name: article.title, path, description: article.description, modified: staticModified() })]}
    />
  );
}
