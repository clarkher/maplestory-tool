"use client";

import { setQuestDone, useDoneQuests } from "@/lib/done-quests";

/**
 * 「我做完了」：點一下記成做完了（記在這台裝置的瀏覽器），按鈕變楓葉綠底白字「做完了」，再點一下取消。
 * 大小跟篩選標籤（FilterTag）一樣，高 36px 的膠囊。任務圖鑑的任務卡、拍賣買齊就能交的任務（/plan/buy）的卡片用；首頁用的 QuestDetailBody 不放。
 * onToggle：按下去之後通知頁面（/plan/buy 拿來讓剛按的那張先留在畫面上）。
 */
export function DoneButton({ id, onToggle }: { id: string; onToggle?: (id: string, done: boolean) => void }) {
  const done = useDoneQuests().has(id);
  return (
    <button
      type="button"
      aria-pressed={done}
      onClick={() => {
        setQuestDone(id, !done);
        onToggle?.(id, !done);
      }}
      className={[
        "inline-flex min-h-9 shrink-0 touch-manipulation items-center whitespace-nowrap rounded-full border px-[11px] text-[13px] font-bold transition-colors",
        done
          ? "border-[color:var(--leaf)] bg-[color:var(--leaf)] text-[color:var(--on-accent)]"
          : "border-[color:var(--paper-edge)] bg-[color:var(--paper)] hover:bg-[color:var(--maple-wash)]",
      ].join(" ")}
    >
      {done ? "做完了" : "我做完了"}
    </button>
  );
}
