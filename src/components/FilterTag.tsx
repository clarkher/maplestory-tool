"use client";

import { useHydrated } from "@/lib/hydrated";

/**
 * 篩選用的標籤按鈕：點一下開、再點一下關（aria-pressed），開著是楓葉橘底白字，跟角色列選職業的膠囊按鈕同一個樣子。
 * 高 36px（比 tap-safe 的 44px 矮），一排三顆在 360 寬的手機也放得進一行。
 *
 * 記住的篩選（useRemembered）第一個畫面就讀得到，伺服器畫的頁面卻沒有：接手的那一格先照「沒開」畫，兩邊的屬性才對得上，
 * 接手後再照 on 畫。屬性對不上時 React 不會補，整頁重新整理後標籤會一直停在沒開的樣子，清單卻已經篩過了。
 */
export function FilterTag({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  const hydrated = useHydrated();
  const pressed = hydrated && on;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={[
        "inline-flex min-h-9 shrink-0 touch-manipulation items-center whitespace-nowrap rounded-full border px-[11px] text-[13px] font-bold transition-colors",
        pressed
          ? "border-[color:var(--maple)] bg-[color:var(--maple)] text-white"
          : "border-[color:var(--paper-edge)] bg-[color:var(--paper)] hover:bg-[color:var(--maple-wash)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
