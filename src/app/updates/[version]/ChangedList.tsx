"use client";

import { useState } from "react";

/**
 * 說明改了的道具的開關：列由伺服器畫好（ChangedRows：ul[data-changed-rows]，每列 data-kind、第 4 列起 data-rest），
 * 跟這個元件是兄弟、不是 children（children 也會被序列化進 client 元件的 props），這裡不收任何列資料。
 * 只管「看全部」跟類別篩選，用 <style> 屬性選擇器藏列；一開始的 <style> 也在 SSR 的 HTML 裡，第一格就只露 3 列。
 * 外層是 flex-col：篩選 order-1、列表 order-2（ChangedRows）、按鈕 order-3。
 */
export function ChangedList({ total, rowCount, first, kinds }: {
  /** 改了的道具件數（counts.changed，跟「改了多少」那格同一個數） */
  total: number;
  rowCount: number;
  first: number;
  kinds: { kind: string; count: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string | null>(null);
  const rules: string[] = [];
  if (!open) rules.push("[data-changed-rows] > li[data-rest]{display:none}");
  if (kind !== null) rules.push(`[data-changed-rows] > li:not([data-kind=${JSON.stringify(kind)}]){display:none}`);
  const chip = (label: string, value: string | null) => {
    const on = kind === value;
    return (
      <button
        key={label}
        type="button"
        aria-pressed={on}
        onClick={() => setKind(value)}
        className="inline-flex min-h-[34px] flex-none items-center whitespace-nowrap px-3 text-sm font-bold"
        style={{ borderRadius: 6, border: `1px solid ${on ? "var(--maple)" : "var(--paper-edge)"}`, background: on ? "var(--maple-wash)" : "transparent", color: on ? "var(--maple)" : "var(--ink)" }}
      >
        {label}
      </button>
    );
  };
  return (
    <>
      <style>{rules.join(" ")}</style>
      {open && kinds.length > 1 && (
        <div className="order-1 mt-2.5 flex flex-wrap gap-2" role="group" aria-label="類別">
          {chip("全部", null)}
          {kinds.map(k => chip(`${k.kind} ${k.count}`, k.kind))}
        </div>
      )}
      {!open && rowCount > first && (
        <button type="button" onClick={() => setOpen(true)} className="order-3 mt-2 self-start text-sm font-bold" style={{ color: "var(--maple)" }}>
          看全部 {total} 件道具 ›
        </button>
      )}
    </>
  );
}
