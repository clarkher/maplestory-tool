"use client";

import { useVisitState } from "@/lib/visit-state";
import { ChevronDown } from "./Icons";

/**
 * 攻略文手機收合（v1.78，使用者拍板 A）：主推留著，備案、表的說明、後面的段落收成一行標題。
 * 收起來的字一樣畫在 HTML 裡（details 不是點了才載），Google 讀得到、瀏覽器找字會自己打開。
 * 開關記在這一筆瀏覽紀錄上（useVisitState）：重新整理、按返回，頁面一樣長，捲動位置才對得回去。
 */
export function Fold({ id, summary, className, children }: { id: string; summary: React.ReactNode; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useVisitState(`article:${id}`, false);
  return (
    <details open={open} onToggle={event => setOpen(event.currentTarget.open)} className={`group/fold ${className ?? ""}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">{summary}</span>
        <ChevronDown size={18} className="shrink-0 ink-soft transition-transform group-open/fold:rotate-180" />
      </summary>
      {children}
    </details>
  );
}

/**
 * 計算表只露主推的幾隻：其他列帶 data-extra，收著時藏起來（還在 HTML 裡）。
 * 用 data-open 讓表的列自己看要不要藏，表本身留在伺服器元件。
 */
export function ExpandRows({ total, children }: { total: number; children: React.ReactNode }) {
  const [open, setOpen] = useVisitState("article:table", false);
  return (
    <div data-open={open} className="group/rows space-y-1.5">
      {children}
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="w-full rounded-lg border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3 py-2 text-sm font-bold"
      >
        {open ? "收回去，只看主推的怪" : `看全部 ${total} 隻怪`}
      </button>
    </div>
  );
}
