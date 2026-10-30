"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ListHead, ROW_LINK, SearchCard } from "@/components/atlas/ListShell";
import { FilterTag } from "@/components/FilterTag";
import { ChevronRight } from "@/components/Icons";
import { EmptyBlock } from "@/components/PlanShell";
import { npcImage } from "@/lib/asset-paths";
import { npcMatches, type NpcListRow } from "@/lib/atlas-view";
import { useHydrated } from "@/lib/hydrated";

/**
 * NPC 清單：伺服器已經把全部 NPC 畫出來，這裡只照搜尋框（名字、所在地圖）跟兩個篩選把列藏起來。
 */
export function NpcList({ title, lead, rows }: { title: string; lead: string; rows: NpcListRow[] }) {
  const hydrated = useHydrated();
  const [query, setQuery] = useState("");
  const [shop, setShop] = useState(false);
  const [quest, setQuest] = useState(false);
  const shown = useMemo(() => rows.filter(row => npcMatches(row, query, { shop, quest })), [rows, query, shop, quest]);

  return (
    <div className="space-y-4 py-3 sm:py-6">
      <ListHead title={title} lead={lead} />
      <SearchCard query={query} onQuery={setQuery} placeholder="NPC 名字、在哪張圖" label="搜尋 NPC" count={shown.length} showClear={hydrated}>
        <div className="flex flex-wrap gap-1.5">
          <FilterTag on={shop} onClick={() => setShop(!shop)}>有賣東西</FilterTag>
          <FilterTag on={quest} onClick={() => setQuest(!quest)}>有任務</FilterTag>
        </div>
      </SearchCard>
      {shown.length === 0 ? (
        <EmptyBlock title="沒有符合的結果" hint="換個字試試，NPC 名字、所在的圖名都可以搜" />
      ) : (
        <ul className="space-y-0.5">
          {shown.map(row => (
            <li key={row.id}>
              <Link href={`/db/npcs/${row.id}`} className={ROW_LINK}>
                {row.img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={npcImage(row.id)} alt="" width={36} height={36} loading="lazy" className="size-9 shrink-0 object-contain" />
                ) : (
                  <span className="size-9 shrink-0" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{row.n}</span>
                  {row.at ? (
                    <span className="block truncate text-[12px] ink-soft">{row.more ? `${row.at}等 ${row.more + 1} 張圖` : row.at}</span>
                  ) : null}
                </span>
                {row.shop || row.quest ? (
                  <span className="shrink-0 text-[11px] font-bold ink-faint">
                    {[row.shop ? "賣東西" : "", row.quest ? "任務" : ""].filter(Boolean).join("・")}
                  </span>
                ) : null}
                <ChevronRight size={15} className="shrink-0 text-[color:var(--ink-faint)]" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
