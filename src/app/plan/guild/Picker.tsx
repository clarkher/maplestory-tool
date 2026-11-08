"use client";

/**
 * 挑選卡：分頁「底圖／圖案」。底圖頁＝底圖顏色 16 色＋底圖格子；圖案頁＝分類膠囊（可橫捲）＋圖案顏色＋圖案格子。
 * 格子畫 2 倍、顏色照目前選的（shownColour：這格沒那色就畫它的第一色）。圖案頁目前圖案沒有的顏色變淡、按不到。
 */
import marksJson from "@/lib/guild-mark/marks.json";
import {
  type Badge,
  type Category,
  type MarkEntry,
  CATEGORIES,
  bgEntry,
  cellStyle,
  markEntry,
  pickMark,
  shownColour,
} from "@/lib/guild-mark/badge";

export type GuildTab = "bg" | "mark";

const data = marksJson as {
  backgrounds: MarkEntry[];
  marks: Record<Category, MarkEntry[]>;
  bgSwatches: string[];
  markSwatches: string[];
};

const TABS: { key: GuildTab; label: string }[] = [
  { key: "bg", label: "底圖" },
  { key: "mark", label: "圖案" },
];

function Swatches({
  label,
  colours,
  on,
  has,
  onPick,
}: {
  label: string;
  colours: string[];
  on: number;
  has: (n: number) => boolean;
  onPick: (n: number) => void;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 text-[13px] font-extrabold">{label}</div>
      <div className="grid grid-cols-8 gap-2">
        {colours.map((hex, i) => {
          const n = i + 1;
          const sel = n === on;
          const ok = has(n);
          return (
            <button
              key={n}
              type="button"
              data-swatch={n}
              data-on={sel ? "" : undefined}
              aria-label={`顏色 ${n}`}
              aria-pressed={sel}
              disabled={!ok}
              onClick={() => onPick(n)}
              className="aspect-square rounded-full disabled:cursor-not-allowed disabled:opacity-25"
              style={{
                background: hex,
                border: sel ? "3px solid var(--maple)" : "2px solid var(--paper)",
                boxShadow: "0 0 0 1px var(--paper-edge)",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function Grid({
  entries,
  colourOf,
  on,
  label,
  onPick,
}: {
  entries: MarkEntry[];
  colourOf: (e: MarkEntry) => number;
  on: number;
  label: string;
  onPick: (e: MarkEntry) => void;
}) {
  return (
    <div className="mt-3 grid grid-cols-6 gap-2">
      {entries.map((e, i) => {
        const sel = e.id === on;
        return (
          <button
            key={e.id}
            type="button"
            data-cell={e.id}
            data-on={sel ? "" : undefined}
            aria-label={`${label} 第 ${i + 1} 個`}
            aria-pressed={sel}
            onClick={() => onPick(e)}
            className={`flex aspect-square items-center justify-center rounded-xl ${
              sel
                ? "border-2 border-[color:var(--maple)] bg-[color:var(--maple-wash)]"
                : "border border-[color:var(--paper-edge)] bg-[color:var(--paper)]"
            }`}
          >
            <span className="block flex-none" style={{ ...cellStyle(e.row, colourOf(e), 2), imageRendering: "pixelated" }} />
          </button>
        );
      })}
    </div>
  );
}

export function Picker({
  badge,
  wanted,
  tab,
  onTab,
  cat,
  onCat,
  onChange,
  onWanted,
}: {
  badge: Badge;
  wanted: number;
  tab: GuildTab;
  onTab: (t: GuildTab) => void;
  cat: Category;
  onCat: (c: Category) => void;
  onChange: (b: Badge) => void;
  onWanted: (mc: number) => void;
}) {
  const bg = bgEntry(badge.b);
  const mark = markEntry(badge.m)?.entry;
  return (
    <section className="glass-solid min-w-0 rounded-[var(--radius-card)] p-3.5">
      <div className="grid grid-cols-2 gap-1 rounded-[14px] bg-[color:var(--paper-deep)] p-1">
        {TABS.map((t) => {
          const sel = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={sel}
              data-tab={t.key}
              data-on={sel ? "" : undefined}
              onClick={() => onTab(t.key)}
              className={`flex min-h-10 items-center justify-center rounded-[10px] text-[15px] font-extrabold ${
                sel ? "bg-[color:var(--paper)] text-[color:var(--maple)] shadow-[0_1px_3px_rgb(0_0_0/0.12)]" : "ink-soft"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "bg" ? (
        <>
          <Swatches
            label="底圖顏色"
            colours={data.bgSwatches}
            on={badge.bc}
            has={(n) => !bg || bg.colours.includes(n)}
            onPick={(bc) => onChange({ ...badge, bc })}
          />
          <Grid
            entries={data.backgrounds}
            colourOf={(e) => shownColour(e, badge.bc)}
            on={badge.b}
            label="底圖"
            onPick={(e) => onChange({ ...badge, b: e.id, bc: shownColour(e, badge.bc) })}
          />
        </>
      ) : (
        <>
          <div className="scroll-x mt-3 flex gap-2 overflow-x-auto">
            {CATEGORIES.map((c) => {
              const sel = c.key === cat;
              return (
                <button
                  key={c.key}
                  type="button"
                  data-cat={c.key}
                  data-on={sel ? "" : undefined}
                  aria-pressed={sel}
                  onClick={() => onCat(c.key)}
                  className={`inline-flex min-h-9 flex-none items-center whitespace-nowrap rounded-full border px-3.5 text-[14px] font-bold ${
                    sel
                      ? "border-[color:var(--maple)] bg-[color:var(--maple)] text-[color:var(--on-accent)]"
                      : "border-[color:var(--paper-edge)] bg-[color:var(--paper)] text-[color:var(--ink)]"
                  }`}
                >
                  {c.label} {data.marks[c.key].length}
                </button>
              );
            })}
          </div>
          <Swatches
            label="圖案顏色"
            colours={data.markSwatches}
            on={badge.mc}
            has={(n) => !mark || mark.colours.includes(n)}
            onPick={onWanted}
          />
          <Grid
            entries={data.marks[cat]}
            colourOf={(e) => shownColour(e, wanted)}
            on={badge.m}
            label={CATEGORIES.find((c) => c.key === cat)!.label}
            onPick={(e) => onChange(pickMark(badge, e.id, wanted))}
          />
        </>
      )}
    </section>
  );
}
