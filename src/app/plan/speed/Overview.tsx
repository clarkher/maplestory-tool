// src/app/plan/speed/Overview.tsx
"use client";

import { useEffect, useState } from "react";
import { formatNumber } from "@/lib/format";
import type { BoardRow, OverviewMap } from "@/lib/speed/server/rules";
import { couponTag, jobName } from "@/lib/speed/view";
import type { MapRecord } from "@/lib/types";
import { BUTTON_LINE, Card, CouponTag, Leaderboard, type BoardState } from "./parts";

export type OverviewState = { kind: "loading" } | { kind: "error" } | { kind: "ok"; open: boolean; maps: OverviewMap[] };

/** 圖多的時候先列幾張，按「看全部」才列完 */
const FIRST = 8;

/** 頁面自己的地圖表有就用它（跟其他卡同一個寫法），沒有才用存的時候送來的名字 */
function nameOf(maps: Record<string, MapRecord>, row: OverviewMap): string {
  return maps[String(row.mapId)]?.zh || row.mapName || "未知地圖";
}

/**
 * 大家的實測、依地圖總覽（v2.79，11/26 使用者選 A）：每張有紀錄的圖一列，點開看那張圖前 10 名（跟分享畫面認出地圖後那張排行同一個卡）。
 * 有開加倍券的照還原值、旁邊標「加倍 1.5 倍・8 分」（使用者選 1）。純畫面，資料由 SpeedOverview 抓。
 */
export function OverviewList({
  state, maps, open, onToggle, board, tab, onTab, showAll, onShowAll,
}: {
  state: OverviewState;
  maps: Record<string, MapRecord>;
  open: number | null;
  onToggle: (mapId: number) => void;
  board: BoardState;
  tab: "solo" | "party";
  onTab: (tab: "solo" | "party") => void;
  showAll: boolean;
  onShowAll: () => void;
}) {
  const rows = state.kind === "ok" ? state.maps : [];
  const shown = showAll ? rows : rows.slice(0, FIRST);
  return (
    <Card title="大家的實測">
      {state.kind === "loading" ? (
        <p className="text-sm ink-soft">載入中…</p>
      ) : state.kind === "error" ? (
        <p className="text-sm ink-soft">實測紀錄暫時連不上，等一下再過來。</p>
      ) : !state.open ? (
        <p className="text-sm ink-soft">排行還沒開。</p>
      ) : !rows.length ? (
        <p className="text-sm ink-soft">還沒有人練滿 10 分鐘。</p>
      ) : (
        <>
          <p className="mb-3 text-[13px] ink-soft">每張圖練滿 10 分鐘的紀錄，點一張看前 10 名。最快那筆只比單練。</p>
          <ul className="divide-y divide-[color:var(--paper-edge)]">
            {shown.map(row => {
              const isOpen = open === row.mapId;
              const best = row.best;
              const tag = best ? couponTag(best.couponMult, best.couponMin) : null;
              const job = best ? jobName(best.job) : null;
              return (
                <li key={row.mapId}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => onToggle(row.mapId)}
                    className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-left hover:bg-[color:var(--maple-wash)]"
                  >
                    {/* 手機：左邊圖名一整行，最快那筆換到下一行（v2.82，375 寬時左邊被擠成三行） */}
                    <span className="min-w-0 w-full sm:w-auto sm:flex-1">
                      <span className="block font-bold">{nameOf(maps, row)}</span>
                      <span className="block text-[13px] ink-soft">
                        {row.minLevel === row.maxLevel ? `Lv.${row.minLevel}` : `Lv.${row.minLevel}～${row.maxLevel}`} · {row.runs} 筆
                        {row.couponRuns ? `（${row.couponRuns} 筆有加倍）` : ""} · 最新 {row.latest.slice(5).replace("-", "/")}
                      </span>
                    </span>
                    {best ? (
                      <span className="flex shrink-0 flex-col items-start sm:items-end">
                        <span className="flex items-baseline gap-1.5">
                          {tag ? <CouponTag text={tag} /> : null}
                          <span className="text-[13px] ink-soft">最快</span>
                          <span className="font-black tabular-nums">{formatNumber(best.expPer10)}</span>
                        </span>
                        <span className="text-[12px] ink-soft">
                          {job ? `${job} ` : ""}Lv.{best.level}
                        </span>
                      </span>
                    ) : (
                      <span className="shrink-0 text-[13px] ink-soft">只有組隊紀錄</span>
                    )}
                  </button>
                  {isOpen ? (
                    <div className="pb-3">
                      <Leaderboard board={board} tab={tab} onTab={onTab} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {!showAll && rows.length > FIRST ? (
            <button type="button" onClick={onShowAll} className={`mt-3 ${BUTTON_LINE}`}>
              看全部 {rows.length} 張圖
            </button>
          ) : null}
          <p className="mt-3 text-[12px] ink-soft">數字是 10 分鐘拿到的經驗，有開加倍券的已經扣掉、旁邊標「加倍」。玩家自己量的，沒有驗證。</p>
        </>
      )}
    </Card>
  );
}

/** 抓總覽跟點開那張圖的排行；version 變了（剛存好一筆）就重抓、跳過 5 分鐘快取 */
export function SpeedOverview({ maps, version = 0 }: { maps: Record<string, MapRecord>; version?: number }) {
  const [state, setState] = useState<OverviewState>({ kind: "loading" });
  const [open, setOpen] = useState<number | null>(null);
  const [board, setBoard] = useState<BoardState>({ kind: "loading" });
  const [tab, setTab] = useState<"solo" | "party">("solo");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/speed/overview${version ? `?v=${version}` : ""}`)
      .then(async response => {
        if (!response.ok) throw new Error(String(response.status));
        const result = (await response.json()) as { open: boolean; maps: OverviewMap[] };
        if (!cancelled) setState({ kind: "ok", open: result.open, maps: result.maps ?? [] });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  useEffect(() => {
    if (open === null) return;
    let cancelled = false;
    setBoard({ kind: "loading" });
    fetch(`/api/speed/board?map=${open}${version ? `&v=${version}` : ""}`)
      .then(async response => {
        if (!response.ok) throw new Error(String(response.status));
        const result = (await response.json()) as { open: boolean; solo: BoardRow[]; party: BoardRow[] };
        if (cancelled) return;
        setBoard({ kind: "ok", open: result.open, solo: result.solo ?? [], party: result.party ?? [] });
        // 只有組隊紀錄的圖：直接開組隊分頁，不然點開是空的
        if (!result.solo?.length && result.party?.length) setTab("party");
      })
      .catch(() => {
        if (!cancelled) setBoard({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [open, version]);

  return (
    <OverviewList
      state={state}
      maps={maps}
      open={open}
      onToggle={mapId => {
        setTab("solo");
        setOpen(current => (current === mapId ? null : mapId));
      }}
      board={board}
      tab={tab}
      onTab={setTab}
      showAll={showAll}
      onShowAll={() => setShowAll(true)}
    />
  );
}
