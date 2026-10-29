// src/app/plan/speed/CompareCard.tsx
"use client";

import { formatNumber } from "@/lib/format";
import { BUTTON_MAIN, Card } from "./parts";

export type CompareRow = { label: string; exp10: number; current: boolean };

/**
 * 「跟我之前比」卡（v1.22 版面 C）：這段（楓葉橘）跟同一隻角色（沒填 ID 就是同一個職業）在別張圖最好的那筆（綠），
 * 長條照 10 分鐘經驗比；右上「產生分享圖」。
 */
export function CompareCard({ rows, byId, onShare, canShare }: { rows: CompareRow[]; byId: boolean; onShare: () => void; canShare: boolean }) {
  const max = Math.max(1, ...rows.map(row => row.exp10));
  const others = rows.some(row => !row.current);
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-black">跟我之前比</h2>
        <button type="button" onClick={onShare} disabled={!canShare} className={BUTTON_MAIN}>
          產生分享圖
        </button>
      </div>
      {rows.length ? (
        <ul className="mt-2">
          {rows.map(row => (
            <li key={`${row.current ? "now" : "old"}-${row.label}`} className="mt-2">
              <div className={`flex justify-between gap-2 text-[13px] ${row.current ? "font-black" : ""}`}>
                <span className="min-w-0 truncate">{row.label}</span>
                <span className="shrink-0 tabular-nums">{formatNumber(row.exp10)}</span>
              </div>
              <div className="mt-1 h-2.5 rounded-md bg-[color:var(--paper-deep)]">
                <div
                  className={`h-2.5 rounded-md ${row.current ? "bg-[color:var(--maple)]" : "bg-[color:var(--leaf)]"}`}
                  style={{ width: `${Math.max(2, (row.exp10 / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-[12px] ink-soft">
        {others ? `10 分鐘經驗，${byId ? "同一隻角色" : "同一個職業"}在不同地圖（存在這台電腦）` : "練過別張圖之後，這裡會並排比較"}
      </p>
    </Card>
  );
}
