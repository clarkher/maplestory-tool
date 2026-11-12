import Link from "next/link";
import type { GuideCard } from "@/lib/guide-catalog";
import type { JobSeries } from "@/lib/guide-related";
import { OPTION_ON } from "./option-style";

/**
 * 攻略文互導（v2.19，使用者 11/12 照推薦 A＋B）：
 * - SeriesStrip：職業文結論框上面「<職業>這條線」，每篇一格，本篇橘框淡底不能點；手機一排放不下左右滑
 * - ReadNext：文末「看完這篇，接著看」，有下一段放大卡，下面 3 張相關（手機左圖右字、電腦三欄圖上字下）
 * 挑哪幾篇在 lib/guide-related.ts。
 */
export function SeriesStrip({ series }: { series: JobSeries }) {
  return (
    <nav aria-label={series.title} className="space-y-2">
      <p className="text-[12px] font-extrabold tracking-[0.1em] text-[color:var(--maple)]">{series.title}</p>
      <ol className="scroll-x -mx-1 flex gap-1.5 px-1 pb-0.5">
        {series.items.map(item => {
          const body = (
            <>
              <span className="block text-[14px] font-bold text-[color:var(--ink)]">{item.from}～{item.to} 等</span>
              <span className="block text-[13px]">{item.jobName}{item.here ? "・在看這篇" : ""}</span>
            </>
          );
          const box = "block whitespace-nowrap rounded-md border px-2.5 py-1.5 leading-snug";
          return (
            <li key={item.href} className="shrink-0">
              {item.here ? (
                <span aria-current="page" className={`${box} ${OPTION_ON}`}>{body}</span>
              ) : (
                <Link href={item.href} className={`${box} glass-fill border-[color:var(--paper-edge)] ink-soft hover:border-[color:var(--ink-faint)]`}>{body}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function ReadNext({ next, related }: { next?: GuideCard; related: GuideCard[] }) {
  return (
    <section aria-labelledby="read-next" className="space-y-2.5">
      <h2 id="read-next" className="text-[12px] font-extrabold tracking-[0.1em] text-[color:var(--maple)]">看完這篇，接著看</h2>
      {next ? (
        <Link href={next.href} className="grid overflow-hidden rounded-[var(--radius-card)] border border-l-[3px] border-[color:var(--paper-edge)] border-l-[color:var(--maple)] glass-fill hover:border-[color:var(--ink-faint)] sm:grid-cols-[240px_minmax(0,1fr)] sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={next.image} alt="" width={1536} height={864} loading="lazy" className="aspect-video w-full object-cover" />
          <span className="block px-3.5 py-3">
            <span className="block text-[12px] font-bold text-[color:var(--maple)]">下一段</span>
            <span className="mt-0.5 block text-[16px] font-bold leading-snug">{next.title}</span>
          </span>
        </Link>
      ) : null}
      <ul className="grid gap-2.5 sm:grid-cols-3">
        {related.map(card => (
          <li key={card.href}>
            <Link href={card.href} className="grid h-full grid-cols-[112px_minmax(0,1fr)] items-center gap-2.5 overflow-hidden rounded-[var(--radius-card)] border border-[color:var(--paper-edge)] glass-fill p-2 hover:border-[color:var(--ink-faint)] sm:block sm:p-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={card.image} alt="" width={1536} height={864} loading="lazy" className="aspect-video w-full rounded object-cover sm:rounded-none" />
              <span className="block sm:px-3 sm:pb-3 sm:pt-2.5">
                <span className="block text-[12px] font-bold text-[color:var(--maple)]">{card.category}</span>
                <span className="mt-0.5 block text-[14px] font-bold leading-snug">{card.title}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
