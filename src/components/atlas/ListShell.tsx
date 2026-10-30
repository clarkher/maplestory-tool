import Link from "next/link";
import { ChevronRight, SearchIcon } from "@/components/Icons";
import { SearchClear, searchKeys } from "@/components/SearchClear";

/**
 * 地圖、NPC 清單頁的外框：麵包屑、大標、說明跟查資料其他清單（DbBrowser）同一個樣子。
 * 伺服器先畫完整清單（搜尋引擎看得到），瀏覽器只照搜尋框、篩選把列藏起來。
 */
export function ListHead({ title, lead }: { title: string; lead: string }) {
  return (
    <>
      <nav aria-label="麵包屑" className="flex items-center gap-1 text-sm ink-faint">
        <Link href="/" className="hover:text-[color:var(--maple)]">我的路線</Link>
        <ChevronRight size={13} />
        <Link href="/db" className="hover:text-[color:var(--maple)]">查資料</Link>
        <ChevronRight size={13} />
        <span className="text-[color:var(--ink-soft)]">{title}</span>
      </nav>
      <header>
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">{title}</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">{lead}</p>
      </header>
    </>
  );
}

/** 搜尋框＋篩選＋筆數，樣子跟 DbBrowser 的搜尋卡一樣（client 元件裡用） */
export function SearchCard({
  query,
  onQuery,
  placeholder,
  label,
  count,
  showClear,
  children,
}: {
  query: string;
  onQuery: (value: string) => void;
  placeholder: string;
  label: string;
  count: number;
  /** 接手前不畫「×」，伺服器跟瀏覽器第一格才對得上 */
  showClear: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5 rounded-[var(--radius-card)] glass wood-frame p-3.5">
      <div className="flex items-center gap-2 rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3 focus-within:border-[color:var(--maple)]">
        <SearchIcon size={17} className="shrink-0 text-[color:var(--ink-faint)]" />
        <input
          value={query}
          onChange={event => onQuery(event.target.value)}
          placeholder={placeholder}
          className="tap-safe w-full min-w-0 bg-transparent py-2.5 outline-none"
          aria-label={label}
          {...searchKeys}
        />
        {query && showClear ? <SearchClear onClear={() => onQuery("")} /> : null}
      </div>
      {children}
      <p className="text-[13px] ink-faint">{`${count.toLocaleString()} 筆`}</p>
    </div>
  );
}

/** 清單的一列：跟 DbBrowser 的列同一個高度、圓角、滑過去的底色 */
export const ROW_LINK =
  "tap-safe flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-[color:var(--paper-deep)]";
