"use client";

/**
 * 紙娃娃的挑衣服卡：15 個分頁（髮型、臉型、膚色＋12 類）、搜尋、髮色／瞳色色塊、四欄格子、一次 40 個。
 * - 只列這個性別穿得到的（g 是這個性別或 2）
 * - 裝備：點裝在前、一般裝備在後，各自畫得出來的在前，其他照資料順序；髮型、臉型：畫得出來的照資料順序，畫不出來的接在最後
 * - 分頁、搜尋字、看到第幾個都不進網址（重新整理回到髮型）；換分頁清掉搜尋、回到 40 個，改搜尋字回到 40 個
 * - 驗收腳本認 data-tab（分頁）、data-colour（色塊）、data-cell／data-name／data-missing（格子），不認樣式 class
 * - 點格子＝算出下一套交給 onChange；畫不出來的不穿，跳 MISSING；點穿著的裝備＝脫掉（髮型、臉型、膚色不能脫）
 *
 *   <Picker ref={pickerRef} data={data} outfit={outfit} tab={tab} onTab={setTab} onChange={commit} toast={showToast} />
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "@/components/Icons";
import { SearchClear, searchKeys } from "@/components/SearchClear";
import { EYE_COLORS, HAIR_COLORS, eyeColour, faceStyle, hairColour, hairStyle, takeOff, wearItem } from "@/lib/avatar/outfit";
import type { Outfit } from "@/lib/avatar/outfit";
import type { AvatarData, AvatarItem, AvatarSkin, AvatarStyle, Gender, SlotKey } from "@/lib/avatar/types";
import { itemImage } from "@/lib/data";
import { CARD, SLOTS } from "./parts";

export type TabKey = "hair" | "face" | "skin" | SlotKey;

const TABS: { k: TabKey; label: string }[] = [{ k: "hair", label: "髮型" }, { k: "face", label: "臉型" }, { k: "skin", label: "膚色" }, ...SLOTS];

/** 一次列幾個、「再看 40 個」多幾個 */
const PAGE = 40;
const MISSING = "這件暫時看不到樣子，先挑別件";

type Entry =
  | { kind: "hair" | "face"; style: AvatarStyle }
  | { kind: "skin"; skin: AvatarSkin }
  | { kind: "item"; item: AvatarItem };

/** 一格要畫的樣子；next 是點了之後的下一套（null＝不換） */
type Cell = { key: string; name: string; icon: number; fallback?: number; on: boolean; ok: boolean; next: () => Outfit | null };

/** 這款有哪些顏色碼（台服＋日服，小到大）；空的＝畫不出來 */
const coloursOf = (s: AvatarStyle) => [...new Set([...s.t, ...s.j])].sort((a, b) => a - b);

/** 這一頁要列的東西（已套性別、搜尋、排序） */
function candidates(data: AvatarData, g: Gender, tab: TabKey, text: string): Entry[] {
  const q = text.trim().toLowerCase();
  const hit = (n: string) => !q || n.toLowerCase().includes(q);
  const fits = (x: { g: 0 | 1 | 2 }) => x.g === g || x.g === 2;
  if (tab === "skin") return data.skin.filter((s) => hit(s.n)).map((skin): Entry => ({ kind: "skin", skin }));
  if (tab === "hair" || tab === "face") {
    const styles = data[tab].filter((s) => fits(s) && hit(s.n));
    const drawn = styles.filter((s) => coloursOf(s).length > 0);
    const missing = styles.filter((s) => coloursOf(s).length === 0);
    return [...drawn, ...missing].map((style): Entry => ({ kind: tab, style }));
  }
  const rank = (i: AvatarItem) => (i.cash ? 0 : 2) + (i.r ? 0 : 1);
  return data.items
    .filter((i) => i.k === tab && fits(i) && hit(i.n))
    .sort((a, b) => rank(a) - rank(b)) // sort 是穩定的：同一級照資料順序
    .map((item): Entry => ({ kind: "item", item }));
}

/** 髮型、臉型一格：小圖用目前的顏色（這款沒有這個顏色就用這款的小圖）；換款保留目前顏色，沒有就用最小的 */
function styleCell(style: AvatarStyle, current: number, colour: number, step: number, wear: (id: number) => Outfit): Cell {
  const colours = coloursOf(style);
  const has = colours.includes(colour);
  const on = current - colour * step === style.id;
  return {
    key: String(style.id),
    name: style.n,
    icon: has ? style.id + colour * step : style.ic,
    fallback: style.ic,
    on,
    ok: colours.length > 0,
    next: () => (on ? null : wear(style.id + (has ? colour : colours[0]) * step)),
  };
}

function toCell(e: Entry, o: Outfit, data: AvatarData): Cell {
  switch (e.kind) {
    case "hair":
      return styleCell(e.style, o.hair, hairColour(o.hair), 1, (hair) => ({ ...o, hair }));
    case "face":
      return styleCell(e.style, o.face, eyeColour(o.face), 100, (face) => ({ ...o, face }));
    case "skin": {
      const { id, n } = e.skin;
      const on = o.skin === id;
      return { key: String(id), name: n, icon: id + 10000, on, ok: true, next: () => (on ? null : { ...o, skin: id }) };
    }
    case "item": {
      const it = e.item;
      const on = o.wear[it.k] === it.id;
      return { key: String(it.id), name: it.n, icon: it.id, on, ok: !!it.r, next: () => (on ? takeOff(o, it.k) : wearItem(o, it, data)) };
    }
  }
}

export function Picker({
  ref,
  data,
  outfit,
  tab,
  onTab,
  onChange,
  toast,
}: {
  ref?: React.Ref<HTMLElement>;
  data: AvatarData;
  outfit: Outfit;
  tab: TabKey;
  onTab: (t: TabKey) => void;
  onChange: (next: Outfit) => void;
  toast: (msg: string) => void;
}) {
  const label = TABS.find((t) => t.k === tab)?.label ?? "";
  const [text, setText] = useState("");
  const [limit, setLimit] = useState(PAGE);
  // 分頁、性別一換（不管換去哪、換回來）：清掉搜尋字、回到 40 個。
  // 畫面算到一半就重設、不等 effect（React「props 變了就調整 state」的寫法），換過去那一格不會先閃出舊的字
  const [seen, setSeen] = useState({ tab, g: outfit.g });
  if (seen.tab !== tab || seen.g !== outfit.g) {
    setSeen({ tab, g: outfit.g });
    if (seen.tab !== tab) setText("");
    setLimit(PAGE);
  }
  /** 改搜尋字（打字、刪字、按叉叉）一律回到 40 個 */
  const search = (next: string) => {
    setText(next);
    setLimit(PAGE);
  };

  const list = useMemo(() => candidates(data, outfit.g, tab, text), [data, outfit.g, tab, text]);
  const cells = useMemo(() => list.slice(0, limit).map((e) => toCell(e, outfit, data)), [list, limit, outfit, data]);

  // 從穿了什麼小卡跳過來、分頁在橫捲列外面：把那顆捲進來（只捲這一列，不動整頁）
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = tabsRef.current;
    const btn = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !btn) return;
    const r = row.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    if (b.left < r.left || b.right > r.right) row.scrollLeft += b.left - r.left - (r.width - b.width) / 2;
  }, [tab]);

  const pick = (cell: Cell) => {
    if (!cell.ok) return toast(MISSING);
    const next = cell.next();
    if (next) onChange(next);
  };

  const hair = tab === "hair" ? hairStyle(data, outfit.hair) : undefined;
  const face = tab === "face" ? faceStyle(data, outfit.face) : undefined;

  return (
    <section
      ref={ref}
      aria-label="挑衣服"
      // 捲到這張卡時讓出頁首＋小窗（小窗 128px＋上下空隙）；電腦版沒有小窗，只讓頁首
      className={`${CARD} scroll-mt-[calc(var(--header-offset)+148px)] lg:scroll-mt-header`}
    >
      <div ref={tabsRef} role="group" aria-label="類別" className="scroll-x flex gap-1.5 pb-1">
        {TABS.map((t) => {
          const on = t.k === tab;
          return (
            <button
              key={t.k}
              type="button"
              aria-pressed={on}
              data-tab={t.k}
              onClick={() => onTab(t.k)}
              className={`tap-safe shrink-0 whitespace-nowrap rounded-full px-4 text-[15px] font-black ${
                on ? "bg-[color:var(--maple)] text-[color:var(--on-accent)]" : "border border-[color:var(--paper-edge)] bg-[color:var(--paper)]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center gap-2 rounded-full border border-[color:var(--paper-edge)] bg-[color:var(--glass-strong)] px-3">
        <SearchIcon size={16} className="shrink-0 ink-faint" />
        <input
          type="search"
          value={text}
          onChange={(e) => search(e.target.value)}
          placeholder={`搜尋${label}名稱`}
          aria-label={`搜尋${label}名稱`}
          {...searchKeys}
          className="min-h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none"
        />
        {text ? <SearchClear onClear={() => search("")} /> : null}
      </div>

      {hair ? (
        <Swatches
          label="髮色"
          palette={HAIR_COLORS}
          colours={coloursOf(hair)}
          current={hairColour(outfit.hair)}
          onPick={(c) => onChange({ ...outfit, hair: hair.id + c })}
        />
      ) : null}
      {face ? (
        <Swatches
          label="瞳色"
          palette={EYE_COLORS}
          colours={coloursOf(face)}
          current={eyeColour(outfit.face)}
          onPick={(c) => onChange({ ...outfit, face: face.id + c * 100 })}
        />
      ) : null}

      {cells.length === 0 ? (
        <p className="py-8 text-center text-[14px] ink-soft">{text.trim() ? "找不到，換個字試試" : "沒有可以挑的"}</p>
      ) : (
        <ul aria-label={label} className="mt-3 grid grid-cols-4 gap-2">
          {cells.map((cell) => (
            <li key={cell.key}>
              <CellButton cell={cell} onClick={() => pick(cell)} />
            </li>
          ))}
        </ul>
      )}

      {list.length > limit ? (
        <button
          type="button"
          onClick={() => setLimit(limit + PAGE)}
          className="tap-safe mt-3 w-full rounded-2xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] text-[15px] font-black"
        >
          再看 40 個
        </button>
      ) : null}
    </section>
  );
}

/** 髮色／瞳色色塊：只畫這款有的顏色，正在用的那個有框 */
function Swatches({
  label,
  palette,
  colours,
  current,
  onPick,
}: {
  label: string;
  palette: { n: string; css: string }[];
  colours: number[];
  current: number;
  onPick: (c: number) => void;
}) {
  return (
    <div className="mt-2.5 flex items-center gap-2">
      <span className="shrink-0 text-[14px] font-black">{label}</span>
      <div role="group" aria-label={label} className="grid min-w-0 flex-1 grid-cols-8 gap-0.5">
        {colours
          .filter((c) => palette[c])
          .map((c) => {
            const on = c === current;
            return (
              <button
                key={c}
                type="button"
                aria-label={palette[c].n}
                aria-pressed={on}
                data-colour={c}
                onClick={() => (on ? undefined : onPick(c))}
                className="tap-safe grid place-items-center rounded-full"
              >
                <span
                  aria-hidden="true"
                  className={`block size-[26px] rounded-full border border-[color:var(--paper-edge)] ${
                    on ? "ring-2 ring-[color:var(--maple)] ring-offset-2 ring-offset-[color:var(--paper)]" : ""
                  }`}
                  // 遊戲裡的髮色、瞳色（outfit.ts），不是站上的主題色
                  style={{ backgroundColor: palette[c].css }}
                />
              </button>
            );
          })}
      </div>
    </div>
  );
}

function CellButton({ cell, onClick }: { cell: Cell; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={cell.on}
      data-cell={cell.key}
      data-missing={cell.ok ? undefined : ""}
      onClick={onClick}
      className={`flex h-full w-full flex-col items-center gap-1 rounded-2xl border px-1 pb-2 pt-2 text-center ${
        cell.on
          ? "border-[color:var(--maple)] bg-[color:var(--maple-wash)] ring-1 ring-[color:var(--maple)]"
          : cell.ok
            ? "border-[color:var(--paper-edge)] bg-[color:var(--paper)]"
            : "border-dashed border-[color:var(--paper-edge)]"
      }`}
    >
      <span className="grid h-12 w-full place-items-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- 像素小圖，用原圖不經過最佳化 */}
        <img
          // 換了顏色就重新掛一張，「已經換過備用圖」的記號不會帶過去
          key={cell.icon}
          src={itemImage(cell.icon)}
          alt=""
          loading="lazy"
          className={cell.ok ? undefined : "opacity-40 grayscale"}
          style={{ maxWidth: 48, maxHeight: 48, imageRendering: "pixelated" }}
          onError={(e) => {
            // 這個顏色沒有小圖：換成那一款的小圖，只換一次；備用圖也沒有就藏起來，不放破圖
            const img = e.currentTarget;
            if (cell.fallback === undefined || img.dataset.fallback) {
              img.style.visibility = "hidden";
              return;
            }
            img.dataset.fallback = "1";
            img.src = itemImage(cell.fallback);
          }}
        />
      </span>
      <span data-name className={`line-clamp-2 text-[13px] leading-snug ${cell.on ? "font-black" : "font-bold"}`}>
        {cell.name}
      </span>
      {cell.ok ? null : <span className="text-[12px] leading-tight ink-faint">暫時看不到樣子</span>}
    </button>
  );
}
