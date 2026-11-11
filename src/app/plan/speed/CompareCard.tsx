// src/app/plan/speed/CompareCard.tsx
"use client";

import { formatNumber } from "@/lib/format";
import type { CompareRow } from "@/lib/speed/records";
import { BUTTON_MAIN, Card } from "./parts";

export type { CompareRow };

/** 加倍券多拿的那截：同色淡一點加斜線，跟實色的還原值分得開（色盲也看得出是兩截） */
const BONUS_STYLE = (color: string): React.CSSProperties => ({
  backgroundColor: `color-mix(in srgb, ${color} 35%, transparent)`,
  backgroundImage: `repeating-linear-gradient(135deg, color-mix(in srgb, ${color} 55%, transparent) 0 3px, transparent 3px 6px)`,
});

/**
 * 「跟我之前比」卡（v1.22 版面 C；v2.06 改橫向堆疊）：這段（楓葉橘）跟同一隻角色（沒填 ID 就是同一個職業）在別張圖最好的那筆（綠）。
 * 每條長條前段實色＝扣掉加倍券的還原值（排序、右邊的數字都用它），後段淡色斜線＝加倍券多拿的（2026-11-11 使用者選 A）。
 * 長度照「還原值＋加倍」最長的那條比；右上「產生分享圖」（沒給 onShare＝手機自己填的，不放）。
 */
export function CompareCard({ rows, byId, onShare, canShare }: { rows: CompareRow[]; byId: boolean; onShare?: () => void; canShare: boolean }) {
  const max = Math.max(1, ...rows.map(row => row.exp10 + row.bonus));
  const others = rows.some(row => !row.current);
  const boosted = rows.some(row => row.bonus > 0);
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-black">跟我之前比</h2>
        {onShare ? (
          <button type="button" onClick={onShare} disabled={!canShare} className={BUTTON_MAIN}>
            產生分享圖
          </button>
        ) : null}
      </div>
      {rows.length ? (
        <ul className="mt-2">
          {rows.map(row => {
            const color = row.current ? "var(--maple)" : "var(--leaf)";
            return (
              <li key={`${row.current ? "now" : "old"}-${row.label}`} className="mt-2">
                <div className={`flex justify-between gap-2 text-[13px] ${row.current ? "font-black" : ""}`}>
                  <span className="min-w-0 truncate">{row.label}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatNumber(row.exp10)}
                    {row.bonus > 0 ? <span className="ml-1 text-[12px] font-normal ink-soft">＋加倍 {formatNumber(row.bonus)}</span> : null}
                  </span>
                </div>
                <div className="mt-1 flex h-2.5 overflow-hidden rounded-md bg-[color:var(--paper-deep)]">
                  <div className="h-full" style={{ width: `${Math.max(2, (row.exp10 / max) * 100)}%`, backgroundColor: color }} />
                  {row.bonus > 0 ? <div className="h-full" style={{ width: `${(row.bonus / max) * 100}%`, ...BONUS_STYLE(color) }} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      <p className="mt-2 text-[12px] ink-soft">
        {others ? `10 分鐘經驗，${byId ? "同一隻角色" : "同一個職業"}在不同地圖（存在這台電腦）` : "練過別張圖之後，這裡會並排比較"}
        {boosted ? "。數字跟排名都扣掉了加倍券，斜線那截是加倍券多拿的" : ""}
      </p>
    </Card>
  );
}
