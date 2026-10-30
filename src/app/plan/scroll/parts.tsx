"use client";

// 衝卷模擬的畫面零件：挑選清單、結果表、數字格式（資料都由 ScrollSim 傳進來）
import { useEffect, useMemo, useRef, useState } from "react";
import { CloseIcon, SearchIcon } from "@/components/Icons";
import { SearchClear, searchKeys } from "@/components/SearchClear";
import { itemImage } from "@/lib/data";
import type { SimRow } from "@/lib/scroll-sim/calc";
import { statLine } from "@/lib/scroll-sim/pick";
import type { SimEquip, SimScroll } from "@/lib/scroll-sim/types";

export const CARD = "rounded-[var(--radius-card)] glass-solid p-4 sm:p-[18px]";

/** 清單一次最多畫幾筆：1975 件裝備全畫會卡，多的請再打字縮小範圍 */
const LIST_CAP = 80;

/** 裝備分組的順序：防具、飾品在前，武器照名字排在後面 */
const SLOT_ORDER = ["帽子", "上衣", "套服", "褲裙", "鞋子", "手套", "披風", "盾牌", "耳環", "戒指", "墜飾", "腰帶", "眼飾", "臉飾"];
function slotRank(s: string): number {
  const i = SLOT_ORDER.indexOf(s);
  return i === -1 ? SLOT_ORDER.length : i;
}
function bySlot(a: string, b: string): number {
  return slotRank(a) - slotRank(b) || a.localeCompare(b, "zh-Hant");
}

// ---------- 文字 ----------

export function statText(s: SimScroll, times = 1): string {
  return s.stats.map((st) => `${st.k} +${st.v * times}`).join("、");
}

export function boomText(boom: number): string {
  if (boom <= 0) return "失敗不會爆";
  if (boom >= 1) return "失敗一定爆掉";
  return `失敗 ${Math.round(boom * 100)}% 機率爆掉`;
}

/** 卷軸那行說明：「成功率 60%・物理攻擊力 +2・失敗不會爆」 */
export function scrollNote(s: SimScroll): string {
  const parts = [`成功率 ${s.rate}%`];
  const stats = statText(s);
  if (stats) parts.push(stats);
  parts.push(boomText(s.boom));
  if (!s.src) parts.push("目前查不到哪裡拿");
  return parts.join("・");
}

export function equipNote(e: SimEquip): string {
  return e.src ? `可以衝 ${e.tuc} 次` : `可以衝 ${e.tuc} 次・目前查不到哪裡拿`;
}

/** 一件衝成：一位小數；差一點點才 100% 的不寫 100% */
export function pctText(row: SimRow): string {
  if (row.tiny) return "不到 0.1%";
  if (row.p >= 1) return "100%";
  const t = (row.p * 100).toFixed(1);
  return `${t === "100.0" ? "99.9" : t}%`;
}

const count = (n: number) => n.toLocaleString("zh-TW");

function itemsText(n: number): string {
  const t = n.toFixed(1);
  if (t === "1.0") return "1 件";
  return `${n >= 1000 ? count(Math.round(n)) : t} 件`;
}

/** 平均要：「12.9 件・30 張」 */
export function avgText(row: SimRow): string {
  if (row.tiny) return "幾乎衝不到";
  return `${itemsText(row.avgItems)}・${count(Math.round(row.avgScrolls))} 張`;
}

/** 九成機率要準備：「64 張・29 件」 */
export function prepText(row: SimRow): string {
  if (row.tiny || row.scrolls90 === null || row.items90 === null) return "幾乎衝不到";
  return `${count(row.scrolls90)} 張・${count(row.items90)} 件`;
}

export function whiteText(row: SimRow): string {
  if (row.tiny) return "—";
  const n = row.avgWhite;
  return `${n < 10 ? n.toFixed(1).replace(/\.0$/, "") : count(Math.round(n))} 張`;
}

export function mesoText(n: number): string {
  return `${Math.round(n).toLocaleString("zh-TW")} 楓幣`;
}

export type Prices = { scroll: number | null; equip: number | null; white: number | null };

/** 要算花費的單價都填了嗎：卷軸、裝備，開白衣再加白衣 */
export function allPriced(prices: Prices, white: boolean): boolean {
  return prices.scroll !== null && prices.equip !== null && (!white || prices.white !== null);
}

/** 平均花費：卷軸＋裝備（＋白衣）。單價沒填齊、或幾乎衝不到回 null */
export function avgCost(row: SimRow, prices: Prices, white: boolean): number | null {
  if (!allPriced(prices, white) || row.tiny || !Number.isFinite(row.avgScrolls) || !Number.isFinite(row.avgItems)) return null;
  return row.avgScrolls * (prices.scroll ?? 0) + row.avgItems * (prices.equip ?? 0) + (white ? row.avgWhite * (prices.white ?? 0) : 0);
}

/** 單價欄：只認正整數，其他（空、0、負數、亂打）當沒填 */
export function parsePrice(raw: string): number | null {
  const digits = raw.replace(/[,，\s]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return n > 0 && Number.isFinite(n) ? n : null;
}

// ---------- 小零件 ----------

export function ItemIcon({ id, size = 32 }: { id: number; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 像素小圖，用原圖不經過最佳化
    <img
      src={itemImage(id)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      style={{ width: size, height: size, imageRendering: "pixelated", objectFit: "contain" }}
      className="shrink-0"
    />
  );
}

/** 上卡的「裝備」「卷軸」那一格：整格可以按，右邊寫「換」 */
export function PickRow({ label, id, name, note, empty, onOpen }: {
  label: string; id: number | null; name: string | null; note: string | null; empty: string; onOpen: (el: HTMLElement) => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => onOpen(event.currentTarget)}
      aria-haspopup="dialog"
      className="flex w-full items-center gap-2.5 rounded-[14px] border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3 py-2.5 text-left"
    >
      {id !== null ? (
        <ItemIcon id={id} />
      ) : (
        <span aria-hidden="true" className="size-8 shrink-0 rounded-lg border border-dashed border-[color:var(--paper-edge)]" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-extrabold ink-soft">{label}</span>
        <span className={`block text-[15px] font-extrabold ${name ? "" : "ink-soft"}`}>{name ?? empty}</span>
        {note ? <span className="block text-[12px] leading-snug ink-soft">{note}</span> : null}
      </span>
      <span className="shrink-0 text-[13px] font-extrabold text-[color:var(--maple)]">{name ? "換" : "挑"}</span>
    </button>
  );
}

export function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
    >
      <span className="text-[14px] font-bold">{label}</span>
      <span aria-hidden="true" className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors ${on ? "bg-[color:var(--maple)]" : "bg-[color:var(--paper-edge)]"}`}>
        <span className={`absolute top-[3px] size-5 rounded-full bg-[color:var(--paper)] shadow transition-[left] ${on ? "left-[21px]" : "left-[3px]"}`} />
      </span>
    </button>
  );
}

export function PriceField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="text-[12px] font-extrabold ink-soft">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="自己填"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block min-h-[38px] w-full rounded-[10px] border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-2.5 py-2 text-[16px] tabular-nums placeholder:text-[color:var(--ink-faint)] sm:text-[14px]"
      />
    </label>
  );
}

// ---------- 挑選清單 ----------

type PickerItem = { id: number; icon: number; name: string; note: string; extra?: string; group: string };

export function equipItems(list: SimEquip[]): PickerItem[] {
  return [...list]
    .sort((a, b) => bySlot(a.s, b.s) || a.lv - b.lv || a.n.localeCompare(b.n, "zh-Hant"))
    .map((e) => ({
      id: e.id,
      icon: e.id,
      name: e.n,
      note: e.lv > 0 ? `${e.lv} 等・可以衝 ${e.tuc} 次` : `可以衝 ${e.tuc} 次`,
      extra: e.src ? undefined : "目前查不到哪裡拿",
      group: e.s,
    }));
}

export function scrollItems(list: SimScroll[], grouped: boolean): PickerItem[] {
  const items = list.map((s) => ({
    id: s.id,
    icon: s.id,
    name: s.n,
    note: [`成功率 ${s.rate}%`, statText(s), boomText(s.boom)].filter(Boolean).join("・"),
    extra: s.src ? undefined : "目前查不到哪裡拿",
    group: grouped ? (s.slot ?? "專用卷") : "",
  }));
  return grouped ? items.sort((a, b) => bySlot(a.group, b.group)) : items;
}

export function Picker({ title, items, selected, onPick, onClose, hint }: {
  title: string; items: PickerItem[]; selected: number | null; onPick: (id: number) => void; onClose: () => void; hint?: string;
}) {
  const [query, setQuery] = useState("");
  const [slot, setSlot] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = dialog.current?.querySelectorAll<HTMLElement>("input, button:not(:disabled)");
      if (!nodes?.length) return;
      const head = nodes[0];
      const tail = nodes[nodes.length - 1];
      const outside = !dialog.current?.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === head || outside)) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && (document.activeElement === tail || outside)) {
        event.preventDefault();
        head.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  // 部位小按鈕：有哪些部位、多的排前面（只有一個部位或沒分組就不放）
  const slots = useMemo(() => {
    const tally = new Map<string, number>();
    for (const it of items) if (it.group) tally.set(it.group, (tally.get(it.group) ?? 0) + 1);
    if (tally.size < 2) return [];
    return [...tally].sort((a, b) => b[1] - a[1] || bySlot(a[0], b[0])).map(([name]) => name);
  }, [items]);
  const activeSlot = slots.includes(slot) ? slot : "";

  const matched = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const inSlot = activeSlot ? items.filter((it) => it.group === activeSlot) : items;
    return words.length ? inSlot.filter((it) => words.every((w) => `${it.name} ${it.group}`.toLowerCase().includes(w))) : inSlot;
  }, [items, query, activeSlot]);
  const shown = matched.slice(0, LIST_CAP);

  // 分組（連續同組併成一段）
  const sections: Array<{ group: string; rows: PickerItem[] }> = [];
  for (const it of shown) {
    const last = sections[sections.length - 1];
    if (last && last.group === it.group) last.rows.push(it);
    else sections.push({ group: it.group, rows: [it] });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-xl flex-col rounded-t-2xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] shadow-[var(--glass-shadow)] sm:rounded-2xl"
      >
        <div className="flex items-center gap-2 px-4 pb-2 pt-3">
          <h2 className="flex-1 text-[16px] font-black">{title}</h2>
          <button type="button" aria-label="關掉" onClick={onClose} className="grid size-10 place-items-center rounded-full ink-soft">
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="px-4">
          <div className="flex items-center gap-2 rounded-full border border-[color:var(--paper-edge)] bg-[color:var(--glass-strong)] px-3">
            <SearchIcon size={16} className="shrink-0 ink-faint" />
            <input
              ref={input}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="打名字找"
              aria-label="打名字找"
              {...searchKeys}
              className="min-h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none"
            />
            {query ? <SearchClear onClear={() => setQuery("")} /> : null}
          </div>
          {hint ? <p className="mt-2 text-[12px] ink-soft">{hint}</p> : null}
          {slots.length ? (
            <div className="scroll-x -mx-4 mt-2 flex gap-1.5 px-4 pb-1" role="group" aria-label="挑部位">
              {slots.map((name) => {
                const on = name === activeSlot;
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSlot(on ? "" : name)}
                    className={`inline-flex min-h-[34px] shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-[14px] font-extrabold ${on ? "bg-[color:var(--maple)] text-[color:var(--on-accent)]" : "border border-[color:var(--paper-edge)]"}`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
          {shown.length === 0 ? (
            <p className="px-2 py-8 text-center text-[14px] ink-soft">{query.trim() ? "找不到，換個字試試" : "沒有可以挑的"}</p>
          ) : (
            sections.map((sec, i) => (
              <div key={`${sec.group}-${i}`}>
                {sec.group ? <p className="px-2 pb-1 pt-3 text-[12px] font-extrabold ink-soft">{sec.group}</p> : null}
                <ul>
                  {sec.rows.map((it) => (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => onPick(it.id)}
                        aria-current={it.id === selected ? "true" : undefined}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-[color:var(--paper-deep)] ${it.id === selected ? "bg-[color:var(--maple-wash)]" : ""}`}
                      >
                        <ItemIcon id={it.icon} size={30} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-bold">{it.name}</span>
                          <span className="block text-[12px] leading-snug ink-soft">
                            {it.note}
                            {it.extra ? `・${it.extra}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
          {matched.length > shown.length ? (
            <p className="px-2 pt-3 text-center text-[12px] ink-soft">還有 {matched.length - shown.length} 筆沒列出來，再打字縮小範圍</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------- 結果表 ----------

/** 「12.9 件・30 張」窄螢幕在「・」後面換行，兩段各自不拆 */
function Pair({ text }: { text: string }) {
  const parts = text.split("・");
  if (parts.length < 2) return <span className="whitespace-nowrap">{text}</span>;
  return (
    <>
      <span className="whitespace-nowrap">{parts[0]}・</span>
      <wbr />
      <span className="whitespace-nowrap">{parts[1]}</span>
    </>
  );
}

export function ResultTable({ rows, scroll, prices, white }: { rows: SimRow[]; scroll: SimScroll; prices: Prices; white: boolean }) {
  const showCost = allPriced(prices, white);
  const last = rows.length - 1;
  // 表格比卡片寬（窄螢幕欄位多的時候）才提醒可以左右滑
  const wrap = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setWide(el.scrollWidth > el.clientWidth + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const table = el.firstElementChild;
    if (table) ro.observe(table);
    return () => ro.disconnect();
  }, [rows, prices, white]);
  const th = "whitespace-nowrap px-1.5 py-1.5 text-left text-[12px] font-extrabold ink-soft";
  return (
    <>
    <div ref={wrap} className="scroll-x -mx-1 mt-2 px-1">
      <table className="w-full border-collapse text-[13px] sm:text-[14px]">
        <thead>
          <tr>
            <th scope="col" className={th}>要成功</th>
            <th scope="col" className={th}>一件衝成</th>
            <th scope="col" className={th}>平均要</th>
            <th scope="col" className={th}><span className="block whitespace-nowrap">九成機率</span><span className="block whitespace-nowrap">要準備</span></th>
            {white ? <th scope="col" className={th}>白衣平均</th> : null}
            {showCost ? <th scope="col" className={th}>平均花費</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isLast = i === last;
            const cost = showCost ? avgCost(row, prices, white) : null;
            return (
              <tr
                key={row.k}
                className={`border-t border-[color:var(--paper-edge)] ${isLast ? "font-black" : ""}`}
                style={isLast ? { background: "color-mix(in srgb, var(--maple) 10%, transparent)" } : undefined}
              >
                <th scope="row" className="min-w-[6.5em] px-1.5 py-2.5 text-left font-[inherit]">
                  <span className="block whitespace-nowrap">{row.k} 張</span>
                  {scroll.stats.length ? (
                    <span className="block text-[12px] font-normal leading-snug text-[color:var(--ink-soft)]">{statLine(row.k, scroll).split("、").map((part, n, all) => (
                        <span key={part} className="whitespace-nowrap">{part}{n < all.length - 1 ? "、" : ""}</span>
                      ))}</span>
                  ) : null}
                </th>
                <td className="whitespace-nowrap px-1.5 tabular-nums">{pctText(row)}</td>
                <td className="px-1.5 tabular-nums"><Pair text={avgText(row)} /></td>
                <td className={`px-1.5 tabular-nums ${isLast && !row.tiny ? "text-[color:var(--maple)]" : ""}`}><Pair text={prepText(row)} /></td>
                {white ? <td className="whitespace-nowrap px-1.5 tabular-nums">{whiteText(row)}</td> : null}
                {showCost ? <td className="whitespace-nowrap px-1.5 tabular-nums">{cost === null ? "—" : mesoText(cost)}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    {wide ? <p className="mt-1.5 text-[12px] ink-soft">表格可以左右滑</p> : null}
    </>
  );
}
