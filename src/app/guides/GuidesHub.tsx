import Link from "next/link";
import { ArticleList } from "@/components/ArticleList";
import { Sprite } from "@/components/route/bits";
import type { ArticleEntry } from "@/lib/article-entry";
import { EventStatus } from "./EventStatus";

/**
 * 攻略專區 /guides（v1.86，使用者 11/09 照推薦）：導覽列「攻略」進來。
 * 活動攻略（原本電腦版導覽列的萬聖節）→ 新手 1–30 → 分等級攻略文（跟 1–30 懶人包同一份清單）。
 */
const STARTER = [
  { href: "/guide", title: "1–30 懶人包", lead: "新手任務 → 轉職 → 月妙 → 超綠，五大職業轉職去哪、點什麼", image: "/assets/npcs/1012100.png" },
  { href: "/guide#pq-moon", title: "月妙組隊圖解", lead: "種子怎麼種、要幾個人、打到幾等", image: "/assets/npcs/1012112.png" },
  { href: "/guide#pq-kerning", title: "超綠組隊圖解", lead: "答題表、跳桶位置，一關一關照著做", image: "/assets/npcs/9020000.png" },
];

const cardClass = "flex items-center gap-3 rounded-[var(--radius-card)] glass wood-frame p-3 transition-transform hover:-translate-y-0.5";

function Card({ href, title, lead, image, children }: { href: string; title: string; lead: string; image: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className={cardClass}>
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[color:var(--paper-deep)]">
        <Sprite src={image} size={34} />
      </span>
      <span className="min-w-0">
        {children}
        <span className="block font-bold">{title}</span>
        <span className="block text-[13px] leading-snug ink-soft">{lead}</span>
      </span>
    </Link>
  );
}

export function GuidesHub({ jobs, articles, builtAt = 0 }: { jobs: ReadonlyArray<{ job: number; name: string }>; articles: readonly ArticleEntry[]; builtAt?: number }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4 sm:py-8">
      <header className="px-1">
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">攻略</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">
          每個職業、每段等級去哪練、幾下打死、先解哪些任務。分等級攻略文 {articles.length} 篇，數字照遊戲資料算。
        </p>
      </header>

      <section aria-label="活動攻略" className="space-y-2">
        <h2 className="px-1 text-sm font-bold ink-soft">活動攻略</h2>
        <Card href="/event/halloween" title="萬聖節任務攻略" lead="雪原的面具祭典三章照順序、要打的怪去哪打" image="/assets/monster_frames/9602795.png">
          <span className="block text-xs font-bold text-[color:var(--maple)]">
            <EventStatus builtAt={builtAt} />
          </span>
        </Card>
      </section>

      <section aria-label="新手 1～30 等" className="space-y-2">
        <h2 className="px-1 text-sm font-bold ink-soft">新手 1～30 等</h2>
        <ul className="space-y-2">
          {STARTER.map(entry => (
            <li key={entry.href}>
              <Card {...entry} />
            </li>
          ))}
        </ul>
      </section>

      <section id="articles" aria-label="分等級攻略" className="scroll-mt-header space-y-2">
        <h2 className="px-1 text-sm font-bold ink-soft">分等級攻略</h2>
        <div className="rounded-[var(--radius-card)] glass wood-frame px-4 py-2">
          <p className="pt-2 text-[13px] ink-soft">點等級看那一段去哪練、幾下打死、必解任務；點職業看整個職業的配點、技能點法。</p>
          <ArticleList jobs={jobs} articles={articles} />
        </div>
      </section>
    </div>
  );
}
