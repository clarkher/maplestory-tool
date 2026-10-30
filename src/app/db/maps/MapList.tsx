"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ListHead, ROW_LINK, SearchCard } from "@/components/atlas/ListShell";
import { ChevronRight } from "@/components/Icons";
import { EmptyBlock } from "@/components/PlanShell";
import { mapMatches, type MapListGroup } from "@/lib/atlas-view";
import { useHydrated } from "@/lib/hydrated";
import { useRemembered } from "@/lib/remember";

/**
 * 地圖清單：伺服器已經把全部分組畫出來，這裡只照搜尋框把不符合的列、整組藏起來（不重抓資料）。
 * 圖名、大陸、區域、怪名、NPC 名都搜得到（mapSearchText）。
 * 搜尋字跟其他查資料清單一樣記到關掉分頁（useRemembered）；伺服器沒有記住的字，接手前一律照空的畫，第一格才對得上。
 */
export function MapList({ title, lead, groups }: { title: string; lead: string; groups: MapListGroup[] }) {
  const hydrated = useHydrated();
  const [remembered, setQuery] = useRemembered("db:地圖:query", "");
  const query = hydrated ? remembered : "";
  const shown = useMemo(
    () =>
      groups
        .map(group => ({ head: group.head, rows: group.rows.filter(row => mapMatches(row.q, query)) }))
        .filter(group => group.rows.length),
    [groups, query],
  );
  const count = shown.reduce((sum, group) => sum + group.rows.length, 0);

  return (
    <div className="space-y-4 py-3 sm:py-6">
      <ListHead title={title} lead={lead} />
      <SearchCard query={query} onQuery={setQuery} placeholder="圖名、怪物、NPC" label="搜尋地圖" count={count} showClear={hydrated} />
      {shown.length === 0 ? (
        <EmptyBlock title="沒有符合的結果" hint="換個字試試，圖名、怪物名、NPC 名都可以搜" />
      ) : (
        <div className="space-y-4">
          {shown.map(group => (
            <section key={group.head} aria-label={group.head} className="space-y-1">
              <h2 className="px-2.5 text-[12px] font-bold ink-faint">{group.head}</h2>
              <ul className="space-y-0.5">
                {group.rows.map(row => (
                  <li key={row.id}>
                    <Link href={`/db/maps/${row.id}`} className={ROW_LINK}>
                      <span className="min-w-0 flex-1 truncate font-bold">{row.n}</span>
                      {row.lv ? <span className="shrink-0 text-[12px] tabular-nums ink-soft">{`怪物 ${row.lv}`}</span> : null}
                      <ChevronRight size={15} className="shrink-0 text-[color:var(--ink-faint)]" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
