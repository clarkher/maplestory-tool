import Link from "next/link";
import { ChevronRight } from "./Icons";

/**
 * 怪物／任務／技能／職業的靜態頁外框（伺服器先畫好，搜尋引擎、AI 不跑 JavaScript 也讀得到）。
 * 樣式跟查資料卡片同一套；細節的互動（帶我去、展開）還是在工具頁，底下那顆按鈕連過去。
 */
export function SeoPage({
  trail,
  title,
  lead,
  image,
  kicker,
  chips,
  toolHref,
  toolLabel,
  jsonLd,
  children,
}: {
  /** 麵包屑：首頁之後的每一層，最後一層是這一頁 */
  trail: { name: string; path: string }[];
  title: string;
  lead: string;
  image?: string;
  /** 大標上面的小字（地圖頁寫「大陸・區域」） */
  kicker?: string;
  /** 大標下面一排標籤（地圖頁的等級、回城、帶我去） */
  chips?: React.ReactNode;
  /** 底下那顆連到工具頁的按鈕；不給就不放 */
  toolHref?: string;
  toolLabel?: string;
  jsonLd: object[];
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 py-3 sm:py-6">
      {jsonLd.map((data, index) => (
        // JSON 裡的 < 換掉，內容不會提早把 script 關掉
        <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />
      ))}

      <nav aria-label="麵包屑" className="flex flex-wrap items-center gap-1 text-sm ink-faint">
        <Link href="/" className="hover:text-[color:var(--maple)]">我的路線</Link>
        {trail.map((crumb, index) => (
          <span key={crumb.path} className="flex items-center gap-1">
            <ChevronRight size={13} />
            {index === trail.length - 1 ? (
              <span className="text-[color:var(--ink-soft)]">{crumb.name}</span>
            ) : (
              <Link href={crumb.path} className="hover:text-[color:var(--maple)]">{crumb.name}</Link>
            )}
          </span>
        ))}
      </nav>

      <article className="space-y-4 rounded-[var(--radius-card)] glass wood-frame p-4 sm:p-5">
        <header className="flex items-start gap-3">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={title} width={56} height={56} className="size-14 shrink-0 object-contain" />
          ) : null}
          <div className="min-w-0">
            {kicker ? <p className="text-[13px] font-bold ink-soft">{kicker}</p> : null}
            <h1 className="text-[26px] font-black leading-tight tracking-tight sm:text-[32px]">{title}</h1>
            {chips ? <div className="mt-2 flex flex-wrap gap-1.5">{chips}</div> : null}
            <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">{lead}</p>
          </div>
        </header>
        {children}
        {toolHref ? (
          <Link
            href={toolHref}
            className="tap-safe inline-flex items-center gap-1.5 rounded-full bg-[color:var(--maple)] px-3.5 py-2 text-sm font-bold text-[color:var(--on-accent)] shadow-sm"
          >
            {toolLabel}
            <ChevronRight size={15} />
          </Link>
        ) : null}
      </article>
    </div>
  );
}

export function SeoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold ink-faint">{title}</h2>
      {children}
    </section>
  );
}

/** 兩欄的數值表（怪物數值、技能資訊） */
export function SeoStats({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl bg-[color:var(--paper-deep)] p-3 text-sm sm:grid-cols-4">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-2">
          <dt className="ink-faint">{label}</dt>
          <dd className="font-bold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 連到別的靜態頁的小標籤清單 */
export function SeoLinks({ links }: { links: { href: string; text: string; note?: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {links.map(link => (
        <li key={link.href + link.text}>
          <Link
            href={link.href}
            className="inline-flex items-center gap-1 rounded-full border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-2.5 py-1 text-[13px] hover:border-[color:var(--maple)]"
          >
            <span className="font-bold">{link.text}</span>
            {link.note ? <span className="ink-faint">{link.note}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
