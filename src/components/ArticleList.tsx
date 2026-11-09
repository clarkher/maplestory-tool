import Link from "next/link";
import type { ArticleEntry } from "@/lib/article-entry";

/**
 * 分等級攻略文清單：每個職業一列，職業名連職業頁、後面是各等級段（v1.85 在 1–30 懶人包，v1.86 攻略專區也用這個，兩邊長一樣）。
 * 沒有文章的職業照樣列職業頁。
 */
export function ArticleList({ jobs, articles }: { jobs: ReadonlyArray<{ job: number; name: string }>; articles: readonly ArticleEntry[] }) {
  return (
    <ul className="divide-y divide-[color:var(--paper-edge)]">
      {jobs.map(entry => (
        <li key={entry.job} className="flex flex-wrap items-center gap-1.5 py-2">
          <Link href={`/jobs/${entry.job}`} className="tap-safe mr-1 min-w-[5.5rem] text-sm font-bold text-[color:var(--sky)] underline underline-offset-4">
            {entry.name}
          </Link>
          {articles.filter(article => article.job === entry.job).map(article => (
            <Link
              key={article.href}
              href={article.href}
              className="tap-safe inline-block rounded-full bg-[color:var(--paper-deep)] px-3 py-1.5 text-[13px] font-bold tabular-nums hover:bg-[color:var(--maple-wash)]"
            >
              {article.from}～{article.to} 等
            </Link>
          ))}
        </li>
      ))}
    </ul>
  );
}
