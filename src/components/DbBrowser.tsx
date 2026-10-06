"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, SearchIcon } from "./Icons";
import { EmptyBlock, LoadingBlock } from "./PlanShell";
import Link from "next/link";

export type DbEntry = {
  id: string;
  name: string;
  /** 列表右側的小字 */
  note?: string;
  /** 列表左側的縮圖 */
  image?: string;
  /** 搜尋時額外比對的字串 */
  keywords?: string;
  /** 名字後面的小標籤，例如「10/15 開放」的 Chip */
  badge?: React.ReactNode;
};

const PAGE_SIZE = 60;

/**
 * 四個資料頁共用的骨架：左邊清單、右邊細節，手機上則是清單在上、選中後細節展開。
 *
 * 原站把整包資料當同步 script 一次載入（道具那頁 19MB），這裡改成先載清單、
 * 選中才渲染細節，而且列表分批補上，捲多少算多少。
 */
export function DbBrowser({
  title,
  lead,
  entries,
  loading,
  error,
  filters,
  renderDetail,
  searchPlaceholder = "輸入名稱或 ID",
}: {
  title: string;
  lead: string;
  entries: DbEntry[];
  loading: boolean;
  error: string | null;
  filters?: React.ReactNode;
  renderDetail: (id: string) => React.ReactNode;
  searchPlaceholder?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("id");

  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const detailRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return entries;
    const starts: DbEntry[] = [];
    const contains: DbEntry[] = [];
    for (const entry of entries) {
      const name = entry.name.toLowerCase();
      if (name.startsWith(keyword) || entry.id === keyword) starts.push(entry);
      else if (name.includes(keyword) || entry.keywords?.toLowerCase().includes(keyword)) contains.push(entry);
    }
    return [...starts, ...contains];
  }, [entries, query]);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [query, entries]);

  // 這次網址的 id 是點清單換的：select 會自己平滑捲過去，下面的 effect 就不再跳一次
  const pickedFromList = useRef(false);

  const select = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params.toString());
      next.set("id", id);
      // 點同一筆網址不會變、effect 不會跑，這時不留記號，不然下一次從連結換過來會被吃掉
      pickedFromList.current = params.get("id") !== id;
      // push 不用 replace：看完一筆按返回，要回到上一筆，不是直接離開這一頁
      router.push(`?${next.toString()}`, { scroll: false });
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    },
    [params, router],
  );

  // 按上一頁／下一頁換的 id：瀏覽器會還原你離開時的位置，下面的 effect 不插手，免得兩邊搶著捲
  const fromHistory = useRef(false);
  const selectedNow = useRef(selected);
  useEffect(() => {
    selectedNow.current = selected;
  }, [selected]);
  useEffect(() => {
    const onPopState = () => {
      // id 真的有變才留記號；id 沒變時下面的 effect 不會跑，留了記號會吃掉下一次的連結
      fromHistory.current = new URLSearchParams(window.location.search).get("id") !== selectedNow.current;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // 找不到這一筆時 renderDetail 回 null：細節是空的，下面就不捲過去（免得捲到一片空白）
  const detail = !loading && selected ? renderDetail(selected) : null;
  const hasDetail = detail !== null && detail !== undefined;

  // 網址的 id 是從連結來的——直接打開網址、細節裡連到同一頁的另一筆（例如任務的「要先完成」）——
  // 手機、平板的細節排在整份清單下面，直接跳過去；桌機左右兩欄，細節本來就在畫面上，不捲。
  useEffect(() => {
    if (loading || !selected) return;
    if (pickedFromList.current || fromHistory.current) {
      pickedFromList.current = false;
      fromHistory.current = false;
      return;
    }
    // 64rem 跟 Tailwind 的 lg 同一個斷點，瀏覽器字級調大時兩欄／單欄的判斷才會一致
    if (!hasDetail || window.matchMedia("(min-width: 64rem)").matches) return;
    // instant：全站開了平滑捲動，不指定會從頂端一路滑三千多 px 下來
    detailRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [loading, selected, hasDetail]);

  return (
    <div className="space-y-4 py-3 sm:py-6">
      <nav aria-label="麵包屑" className="flex items-center gap-1 text-sm ink-faint">
        <Link href="/" className="hover:text-[color:var(--maple)]">我的路線</Link>
        <ChevronRight size={13} />
        <span className="text-[color:var(--ink-soft)]">{title}</span>
      </nav>

      <header>
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">{title}</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">{lead}</p>
      </header>

      <div className="space-y-2.5 rounded-[var(--radius-card)] glass wood-frame p-3.5">
        <div className="flex items-center gap-2 rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3 focus-within:border-[color:var(--maple)]">
          <SearchIcon size={17} className="shrink-0 text-[color:var(--ink-faint)]" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="tap-safe w-full bg-transparent py-2.5 outline-none"
            aria-label={`搜尋${title}`}
          />
        </div>
        {filters}
        <p className="text-[13px] ink-faint">
          {loading ? "載入中…" : `${matches.length.toLocaleString()} 筆`}
        </p>
      </div>

      {error ? (
        <EmptyBlock title="資料載入失敗" hint={error} />
      ) : loading ? (
        <LoadingBlock />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="space-y-1.5">
            {matches.length === 0 ? (
              <EmptyBlock title="沒有符合的結果" />
            ) : (
              <>
                <ul className="space-y-1">
                  {matches.slice(0, visible).map(entry => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => select(entry.id)}
                        aria-current={selected === entry.id ? "true" : undefined}
                        className={[
                          "tap-safe flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                          selected === entry.id
                            ? "bg-[color:var(--maple-wash)] ring-1 ring-[color:var(--maple)]"
                            : "hover:bg-[color:var(--paper-deep)]",
                        ].join(" ")}
                      >
                        {entry.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={entry.image}
                            alt=""
                            width={28}
                            height={28}
                            loading="lazy"
                            className="size-7 shrink-0 object-contain"
                          />
                        ) : (
                          <span className="size-7 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1 truncate font-bold">{entry.name}</span>
                        {entry.badge}
                        {entry.note ? (
                          <span className="shrink-0 text-[11px] tabular-nums ink-faint">{entry.note}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
                {visible < matches.length ? (
                  <button
                    type="button"
                    onClick={() => setVisible(value => value + PAGE_SIZE * 2)}
                    className="tap-safe w-full rounded-xl bg-[color:var(--paper-deep)] py-2.5 text-sm font-bold ink-soft hover:text-[color:var(--maple)]"
                  >
                    再載 {Math.min(PAGE_SIZE * 2, matches.length - visible)} 筆
                  </button>
                ) : null}
              </>
            )}
          </div>

          {/* scroll-mt：捲過來時讓出頂端固定的導覽列，細節卡的標題不會被蓋住 */}
          <div ref={detailRef} className="min-w-0 scroll-mt-20">
            {selected ? (
              detail
            ) : (
              <EmptyBlock title="左邊選一個看細節" hint="也可以直接搜尋名稱或 ID。" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function DetailCard({ children }: { children: React.ReactNode }) {
  return (
    <article className="space-y-4 rounded-[var(--radius-card)] glass wood-frame p-4 sm:p-5">{children}</article>
  );
}

export function StatGrid({ rows }: { rows: Array<[string, string | number]> }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-[color:var(--paper-deep)] px-3 py-2">
          <dt className="text-[12px] ink-faint">{label}</dt>
          {/* break-keep：擠不下時只在「、」換行，「劍士、弓箭手、盜賊」不會把盜賊切成兩行 */}
          <dd className="break-keep text-[15px] font-black tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-baseline justify-between gap-2 text-[15px] font-black">
        {title}
        {extra ? <span className="text-xs font-normal ink-faint">{extra}</span> : null}
      </h3>
      {children}
    </section>
  );
}
