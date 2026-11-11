import Link from "next/link";
import { AdSlot } from "./AdSlot";
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
  imageSize = 56,
  kicker,
  chips,
  toolHref,
  toolLabel,
  cover,
  jsonLd,
  children,
}: {
  /** 麵包屑：首頁之後的每一層，最後一層是這一頁 */
  trail: { name: string; path: string }[];
  title: string;
  /** 大標下面那段話；攻略文大標底下接主圖，不放 */
  lead?: string;
  image?: string;
  /** 大標旁那張圖的邊長（px）；NPC 頁的人比較高，放大一點 */
  imageSize?: number;
  /** 大標上面的小字（地圖頁寫「大陸・區域」） */
  kicker?: string;
  /** 大標下面一排標籤（地圖頁的等級、回城、帶我去） */
  chips?: React.ReactNode;
  /** 底下那顆連到工具頁的按鈕；不給就不放 */
  toolHref?: string;
  toolLabel?: string;
  /** 有給就用它取代整個標題列（攻略文的深色大圖頁首，v1.95）；裡面要自己放 h1 */
  cover?: React.ReactNode;
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
        {cover ?? <header className="flex items-start gap-3">
          {image ? (
            // v1.99：圖放在一格細框方塊裡（候選圖 A-mob），方塊大小跟著圖
            <span className="grid shrink-0 place-items-center rounded-[var(--radius-card)] border border-[color:var(--paper-edge)] bg-[color:var(--paper-deep)] p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt={title} width={imageSize} height={imageSize} style={{ width: imageSize, height: imageSize }} className="object-contain" />
            </span>
          ) : null}
          <div className="min-w-0">
            {kicker ? <p className="text-[13px] font-bold ink-soft">{kicker}</p> : null}
            <h1 className="text-[26px] font-black leading-tight tracking-tight sm:text-[32px]">{title}</h1>
            {chips ? <div className="mt-2 flex flex-wrap gap-1.5">{chips}</div> : null}
            {lead ? <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">{lead}</p> : null}
          </div>
        </header>}
        {children}
        {toolHref ? (
          <Link
            href={toolHref}
            data-ga="tool"
            className="tap-safe inline-flex items-center gap-1.5 rounded-md bg-[color:var(--maple)] px-3.5 py-2 text-sm font-bold text-[color:var(--on-accent)] shadow-sm"
          >
            {toolLabel}
            <ChevronRight size={15} />
          </Link>
        ) : null}
      </article>
      <AdSlot unit="detail" />
    </div>
  );
}

export function SeoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      {/* 小標：小字、粗、字距加寬（v1.99） */}
      <h2 className="text-[12px] font-black tracking-[0.1em] ink-faint">{title}</h2>
      {children}
    </section>
  );
}

/**
 * 數值格（怪物數值、技能資訊、道具數值；v1.99 照候選圖 A-mob）：一格一個數值，小灰字標籤在上、大粗數字在下。
 * 格線：每格往四邊擴 1px 陰影，蓋滿格子間的 1px 空隙（交叉點也補到），外圈被 overflow-hidden 切掉；
 * 最後一排沒排滿時空著的地方是卡片底，不會出現一塊灰。accent：前幾格的數字用橘色（怪物頁的等級、HP、經驗）。
 * 欄數照格數跟最長的值：6 格以上、值都短（6 字以內，怪物頁）手機 3 欄、電腦 6 欄；6 格以上但有長的值
 * （道具「上衣＋褲裙（佔兩格）」、大怪的「672,000」）手機 2 欄、電腦 4 欄；格子少的手機 2 欄、電腦 3 欄。
 * 長的值（超過 6 字）字小一號，不在格子裡斷成三四行。
 */
const SHORT_VALUE = 6;

function valueLength(value: React.ReactNode): number {
  return typeof value === "string" || typeof value === "number" ? String(value).length : 0;
}

export function SeoStats({ rows, accent = 0 }: { rows: [string, React.ReactNode][]; accent?: number }) {
  const short = rows.every(([, value]) => valueLength(value) <= SHORT_VALUE);
  const columns = rows.length < 6 ? "grid-cols-2 sm:grid-cols-3" : short ? "grid-cols-3 lg:grid-cols-6" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";
  return (
    <dl className={`grid ${columns} gap-px overflow-hidden rounded-[var(--radius-card)] border border-[color:var(--paper-edge)] bg-[color:var(--glass)]`}>
      {rows.map(([label, value], index) => (
        <div key={label} className="px-3 py-2.5 shadow-[0_0_0_1px_var(--paper-edge)]">
          <dt className="text-[12px] font-bold ink-faint">{label}</dt>
          <dd className={`mt-0.5 font-black tabular-nums ${valueLength(value) > SHORT_VALUE ? "text-[16px] leading-snug" : "text-[20px] leading-tight"}${index < accent ? " text-[color:var(--maple)]" : ""}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * 有數量的連結清單（怪物頁的出沒地圖＋刷怪點，v1.99 照候選圖 A-mob）：一列一張圖，下面一條長條，長度照最多那張的比例。
 * 沒有數量（value 沒給）的列只放名字、不畫長條。key 用索引（理由見 SeoLinks）。
 */
export function SeoBars({ rows }: { rows: { href: string; text: string; value?: number; unit: string }[] }) {
  const max = Math.max(1, ...rows.map(row => row.value ?? 0));
  return (
    <ul className="divide-y divide-[color:var(--paper-edge)] overflow-hidden rounded-[var(--radius-card)] border border-[color:var(--paper-edge)]">
      {rows.map((row, index) => (
        <li key={index}>
          <Link href={row.href} className="block px-3.5 py-2.5 hover:bg-[color:var(--paper-deep)]">
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] font-bold">{row.text}</span>
              {row.value ? <span className="shrink-0 text-[13px] tabular-nums ink-soft">{row.value} {row.unit}</span> : null}
            </span>
            {row.value ? (
              <span aria-hidden="true" className="mt-1.5 block h-1.5 overflow-hidden rounded-sm bg-[color:var(--paper-deep)]">
                <span className="block h-full rounded-sm bg-[color:var(--maple)]" style={{ width: `${Math.round((row.value / max) * 100)}%` }} />
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** 連到別的靜態頁的小標籤清單 */
export function SeoLinks({ links }: { links: { href: string; text: string; note?: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {links.map((link, index) => {
        // 道具單獨頁只留 html（省 Cloudflare 檔案額度），next/link 預先載入會 404，用一般連結整頁載入
        const Anchor = link.href.startsWith("/db/items/") ? "a" : Link;
        return (
        // key 會寫進頁面的 RSC 資料，放網址＋名稱會被 Googlebot 當成 /db/npcs/9402807樂師 這種壞連結去抓
        <li key={index}>
          <Anchor
            href={link.href}
            className="inline-flex items-center gap-1 rounded-md border border-[color:var(--paper-edge)] bg-[color:var(--paper-deep)] px-2.5 py-1 text-[13px] hover:border-[color:var(--ink-faint)]"
          >
            <span className="font-bold">{link.text}</span>
            {link.note ? <span className="ink-faint">{link.note}</span> : null}
          </Anchor>
        </li>
        );
      })}
    </ul>
  );
}
