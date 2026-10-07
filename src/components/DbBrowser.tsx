"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { collapseByBack, createHistoryTracker, detailSpot, fromListMark, listSignature, searchEntries } from "@/lib/db-browse";
import { useRemembered } from "@/lib/remember";
import { ChevronRight, SearchIcon } from "./Icons";
import { EmptyBlock, LoadingBlock } from "./PlanShell";
import Link from "next/link";
import { statSpans, type StatSpan } from "@/lib/stat-layout";

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

/** 跟 Tailwind 的 lg 同一個斷點，瀏覽器字級調大時兩欄／單欄的判斷才會一致 */
const WIDE = "(min-width: 64rem)";
const isWide = () => window.matchMedia(WIDE).matches;
const narrowOnServer = () => false;
function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * 按上一頁／下一頁換的網址交給瀏覽器還原位置，這裡不再捲。
 * 全站開了平滑捲動，瀏覽器還原時也會從頂端一路滑過去：查資料這幾頁在還原前先關掉，
 * 等使用者下一次自己點、按鍵時再恢復。
 */
const navHistory =
  typeof window === "undefined"
    ? null
    : createHistoryTracker(window, {
        onTraverse: () => {
          if (!window.location.pathname.startsWith("/db/")) return;
          document.documentElement.style.scrollBehavior = "auto";
          // 逼瀏覽器馬上套用，還原位置時才吃得到（Next 自己關平滑捲動時也這樣做）
          document.documentElement.getClientRects();
        },
        onFresh: () => {
          document.documentElement.style.scrollBehavior = "";
        },
      });

/** 清單每一列的 DOM id：展開、收起、從連結跳過來時用來找那一列 */
const rowOf = (id: string) => document.getElementById(`db-row-${id}`);

/** 網址上現在開著哪一筆。pushState 之後畫面要等一下才更新，連點時要看網址，不能看畫面上的 selected */
const openIdNow = () => new URLSearchParams(window.location.search).get("id");

function urlWith(id: string | null) {
  const next = new URLSearchParams(window.location.search);
  if (id === null) next.delete("id");
  else next.set("id", id);
  const search = next.toString();
  return search ? `?${search}` : window.location.pathname;
}

/**
 * 四個資料頁共用的骨架：桌機左邊清單、右邊細節；手機、平板點了哪一筆，細節就展開在那一筆下面。
 *
 * 原站把整包資料當同步 script 一次載入（道具那頁 19MB），這裡改成先載清單、
 * 選中才渲染細節，而且列表分批補上，按「再載」才多畫。
 * 搜尋字、已經載入幾筆記到這次瀏覽結束：離開再回來、按返回，清單跟離開時一樣。
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
  preferFor,
}: {
  title: string;
  lead: string;
  entries: DbEntry[];
  loading: boolean;
  error: string | null;
  filters?: React.ReactNode;
  renderDetail: (id: string) => React.ReactNode;
  searchPlaceholder?: string;
  /** 這次搜尋要排最前面的 id（例：道具頁搜「劍士」時劍士能用的裝備）；回 null 照一般排法。要用 useCallback 包，不然每次重算 */
  preferFor?: (keyword: string) => ReadonlySet<string> | null;
}) {
  const params = useSearchParams();
  const selected = params.get("id");
  const wide = useSyncExternalStore(subscribeWide, isWide, narrowOnServer);

  const [query, setQuery] = useRemembered(`db:${title}:query`, "");
  const [visible, setVisible] = useRemembered(`db:${title}:visible`, PAGE_SIZE);
  const detailRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(
    () => searchEntries(entries, query, preferFor?.(query.trim())),
    [entries, query, preferFor],
  );

  // 篩選換了清單才從頭顯示 60 筆；內容一樣只是重算（角色讀好、標籤冒出來）不算，按過「再載」的不會被收回去
  const signature = useMemo(() => listSignature(entries), [entries]);
  const shownSignature = useRef(signature);
  useEffect(() => {
    if (shownSignature.current === signature) return;
    shownSignature.current = signature;
    setVisible(PAGE_SIZE);
  }, [signature, setVisible]);

  // 這次網址的 id 是點清單換的：select 自己會捲，下面「從連結來的」effect 就不再跳一次
  const pickedFromList = useRef(false);
  // 手機點一筆時，那一列在畫面上的位置：展開後先放回原處，再平滑捲到導覽列下方
  const tapped = useRef<{ id: string; top: number } | null>(null);
  // 收起的是哪一筆、是不是用返回收的、什麼時候按的
  const collapsed = useRef<{ id: string; byBack: boolean; at: number } | null>(null);
  // 最近一次從清單點開的是哪一筆、什麼時候點的：擋手指連點
  const lastPick = useRef<{ id: string; at: number } | null>(null);

  const collapse = useCallback(() => {
    const openId = openIdNow();
    if (!openId) return;
    // 剛按過收起、還在收（例如手機上連點兩下）：不再收第二次，不然用返回收的會連退兩頁、離開這一頁
    const pending = collapsed.current;
    if (pending?.id === openId && performance.now() - pending.at < 1000) return;
    const byBack = collapseByBack(window.history.state, openId, performance.timeOrigin);
    collapsed.current = { id: openId, byBack, at: performance.now() };
    // 從清單點開的那一筆用返回收起：上一頁就是點之前的清單，不會多留一筆紀錄
    if (byBack) window.history.back();
    else window.history.replaceState(null, "", urlWith(null));
  }, []);

  const select = useCallback(
    (id: string) => {
      const openId = openIdNow();
      if (openId === id) {
        // 剛點開不到半秒又點同一筆，多半是手指連點，當作同一下
        if (lastPick.current?.id === id && performance.now() - lastPick.current.at < 500) return;
        // 手機再點一次開著的那一筆就收起；桌機細節在右邊，捲過去就好
        if (isWide()) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        else collapse();
        return;
      }
      lastPick.current = { id, at: performance.now() };
      pickedFromList.current = true;
      if (!isWide()) {
        const row = rowOf(id);
        tapped.current = row ? { id, top: row.getBoundingClientRect().top } : null;
      }
      // push 不用 replace：看完一筆按返回，要回到上一筆，不是直接離開這一頁。
      // 沒開著別筆時留記號，收起時才知道可以用返回回到點之前的清單
      window.history.pushState(fromListMark(openId, window.history.state, id, performance.timeOrigin), "", urlWith(id));
      if (isWide()) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    },
    [collapse],
  );

  // 手機點了一筆：上面開著的另一筆收起來時這一列會往上跳，先放回手指點的位置，再平滑捲到導覽列下方
  useLayoutEffect(() => {
    const tap = tapped.current;
    if (!tap || tap.id !== selected) return;
    tapped.current = null;
    const row = rowOf(tap.id);
    if (!row) return;
    const drift = row.getBoundingClientRect().top - tap.top;
    if (Math.abs(drift) >= 1) window.scrollBy({ top: drift, behavior: "instant" });
    requestAnimationFrame(() => row.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [selected]);

  // 收起之後：把那一列放回導覽列下方，接著往下看（細節原本放在清單最上面的話，就回到清單開頭）。
  // 用返回收的，瀏覽器會在這之後還原點之前的位置，所以等到下一個畫面前再放，畫面不會先跳一下
  useLayoutEffect(() => {
    const done = collapsed.current;
    if (!done || selected === done.id) return;
    collapsed.current = null;
    const place = () => {
      const row = rowOf(done.id);
      (row ?? listRef.current)?.scrollIntoView({ block: "start", behavior: "instant" });
      // 收起按鈕不見了，焦點放回那一列，用鍵盤、讀螢幕的人才不會迷路
      row?.querySelector("button")?.focus({ preventScroll: true });
    };
    if (done.byBack) requestAnimationFrame(place);
    else place();
  }, [selected]);

  // 找不到這一筆時 renderDetail 回 null：細節是空的，下面就不捲過去（免得捲到一片空白）
  const detail = !loading && selected ? renderDetail(selected) : null;
  const hasDetail = detail !== null && detail !== undefined;
  const shown = matches.slice(0, visible);
  const spot = detailSpot({
    wide,
    selected,
    hasDetail,
    shown: selected !== null && shown.some(entry => entry.id === selected),
  });

  // 網址的 id 是從連結來的——直接打開網址、細節裡連到同一頁的另一筆（例如任務的「要先完成」）——
  // 手機、平板跳到那一筆；桌機左右兩欄，細節本來就在畫面上，不捲。按上一頁／下一頁換的交給瀏覽器還原。
  useEffect(() => {
    if (loading || !selected) return;
    if (pickedFromList.current) {
      pickedFromList.current = false;
      return;
    }
    if (navHistory?.cameFromHistory() || !hasDetail || isWide()) return;
    // instant：全站開了平滑捲動，不指定會從頂端一路滑三千多 px 下來
    (rowOf(selected) ?? topRef.current)?.scrollIntoView({ block: "start", behavior: "instant" });
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
            onChange={event => {
              setQuery(event.target.value);
              setVisible(PAGE_SIZE);
            }}
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
            {/* 從連結打開、但那一筆不在目前的清單上：細節放在清單最上面 */}
            {spot === "top" ? (
              <div ref={topRef} className="scroll-mt-20 pb-2">
                <DetailWithCollapse detail={detail} onCollapse={collapse} />
              </div>
            ) : null}
            {matches.length === 0 ? (
              <EmptyBlock title="沒有符合的結果" />
            ) : (
              <>
                <ul ref={listRef} className="scroll-mt-20 space-y-1">
                  {shown.map(entry => (
                    // scroll-mt：捲過來時讓出頂端固定的導覽列，那一列和展開的細節不會被蓋住
                    <li key={entry.id} id={`db-row-${entry.id}`} className="scroll-mt-20">
                      <button
                        type="button"
                        onClick={() => select(entry.id)}
                        aria-current={selected === entry.id ? "true" : undefined}
                        aria-expanded={wide ? undefined : spot === "inline" && selected === entry.id}
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
                      {spot === "inline" && selected === entry.id ? (
                        <div className="mt-2 pb-2">
                          <DetailWithCollapse detail={detail} onCollapse={collapse} />
                        </div>
                      ) : null}
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

          {spot === "side" ? (
            // scroll-mt：捲過來時讓出頂端固定的導覽列，細節卡的標題不會被蓋住
            <div ref={detailRef} className="min-w-0 scroll-mt-20">
              {selected ? (
                detail
              ) : (
                <EmptyBlock title="左邊選一個看細節" hint="也可以直接搜尋名稱或 ID。" />
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** 手機、平板的細節：卡片下面一顆「收起，看下一筆」，看完長長的一張不用自己滑回去 */
function DetailWithCollapse({ detail, onCollapse }: { detail: React.ReactNode; onCollapse: () => void }) {
  return (
    <div className="space-y-2">
      {detail}
      <button
        type="button"
        onClick={onCollapse}
        className="tap-safe w-full rounded-xl bg-[color:var(--paper-deep)] py-2.5 text-sm font-bold ink-soft hover:text-[color:var(--maple)]"
      >
        收起，看下一筆
      </button>
    </div>
  );
}

export function DetailCard({ children }: { children: React.ReactNode }) {
  return (
    <article className="space-y-4 rounded-[var(--radius-card)] glass wood-frame p-4 sm:p-5">{children}</article>
  );
}

/** 每一格佔幾欄對應的 class：fill 只在手機兩欄時拉滿整排，寬螢幕四欄照樣一欄 */
const SPAN_CLASS: Record<StatSpan, string> = { one: "", two: " col-span-2", fill: " col-span-2 sm:col-span-1" };

/**
 * 數值格子：手機兩欄、寬螢幕四欄。值太長就佔兩欄，不在格子裡斷行；
 * grid-flow-row-dense 讓後面短的格子回頭補空位，不會留一個洞；
 * 手機上格子加起來是奇數時，最後一個單格拉滿整排，不空一格（statSpans）。
 */
export function StatGrid({ rows }: { rows: Array<[string, string | number]> }) {
  const spans = statSpans(rows.map(([, value]) => value));
  return (
    <dl className="grid grid-flow-row-dense grid-cols-2 gap-2 sm:grid-cols-4">
      {rows.map(([label, value], index) => (
        <div
          key={label}
          className={`rounded-xl bg-[color:var(--paper-deep)] px-3 py-2${SPAN_CLASS[spans[index]]}`}
        >
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
