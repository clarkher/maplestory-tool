"use client";

/**
 * 紙娃娃的挑衣服卡：15 個分頁（髮型、臉型、膚色＋12 類）、跨類別搜尋、只看商城有賣、髮色／瞳色色塊、四欄格子、一次 40 個。
 * - 清單怎麼挑、怎麼排都在 src/lib/avatar/list.ts（只列這個性別穿得到的；點裝在前、畫得出來的在前），這裡只管畫
 * - 搜尋框不分類別：有字時分頁都不亮、色塊藏起來，上面一行「找到 N 件」，一類一組（區頭「帽子（12）」，目前分頁那類排第一），
 *   一次 40 個是所有組加起來；點格子跟在那一頁點一樣，不清搜尋、不換分頁；點任何一個分頁＝清掉搜尋、回那一頁
 * - 「只看商城有賣」：只留有商城價的裝備，格子名字下面寫「80 樂豆點」；有字時照樣篩（髮型、臉型、膚色沒價錢就不列），
 *   沒字時只在 12 類裝備分頁顯示、髮型臉型膚色分頁不顯示也不套用。切分頁不重設它，重新整理回到關著
 * - 分頁、搜尋字、看到第幾個都不進網址（重新整理回到髮型）；換分頁清掉搜尋、回到 40 個，改搜尋字、開關「只看商城有賣」回到 40 個
 * - 驗收腳本認 data-tab（分頁）、data-colour（色塊）、data-cell／data-name／data-missing（格子）、data-group（搜尋結果的區頭），不認樣式 class
 * - 點格子＝算出下一套交給 onChange；畫不出來的不穿，跳 MISSING；點穿著的裝備＝脫掉（髮型、臉型、膚色不能脫）
 * - 穿上一件時規則順手脫掉別格（removedSlots 比前後），跳「{類別}跟這件不能一起穿，先脫下來了」
 *
 *   <Picker ref={pickerRef} data={data} outfit={outfit} tab={tab} onTab={setTab} onChange={commit} toast={showToast} />
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "@/components/Icons";
import { SearchClear, searchKeys } from "@/components/SearchClear";
import { candidates, coloursOf, searchGroups } from "@/lib/avatar/list";
import type { Entry, TabKey } from "@/lib/avatar/list";
import { EYE_COLORS, HAIR_COLORS, eyeColour, faceStyle, hairColour, hairStyle, removedSlots, takeOff, wearItem } from "@/lib/avatar/outfit";
import type { Outfit } from "@/lib/avatar/outfit";
import type { AvatarData, AvatarStyle, SlotKey } from "@/lib/avatar/types";
import { itemImage } from "@/lib/data";
import { CARD, SLOTS } from "./parts";

export type { TabKey };

const TABS: { k: TabKey; label: string }[] = [{ k: "hair", label: "髮型" }, { k: "face", label: "臉型" }, { k: "skin", label: "膚色" }, ...SLOTS];
const TAB_KEYS = TABS.map((t) => t.k);
const labelOf = (k: TabKey) => TABS.find((t) => t.k === k)?.label ?? "";

/** 一次列幾個、「再看 40 個」多幾個 */
const PAGE = 40;
const MISSING = "這件暫時看不到樣子，先挑別件";

/** 一格要畫的樣子；next 是點了之後的下一套（null＝不換）；slot 是裝備那一格（髮型、臉型、膚色沒有）；price 是商城單件的樂豆點（沒有＝不寫） */
type Cell = { key: string; name: string; icon: number; fallback?: number; on: boolean; ok: boolean; slot?: SlotKey; price?: number; next: () => Outfit | null };

/** 「上衣、褲裙跟這件不能一起穿，先脫下來了」：類別名用 SLOTS 的，「、」接 */
function takenOffText(slots: SlotKey[]): string {
  return `${slots.map((k) => SLOTS.find((s) => s.k === k)?.label ?? k).join("、")}跟這件不能一起穿，先脫下來了`;
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
      return { key: String(it.id), name: it.n, icon: it.id, on, ok: !!it.r, slot: it.k, price: it.pr, next: () => (on ? takeOff(o, it.k) : wearItem(o, it, data)) };
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
  const [text, setText] = useState("");
  const [limit, setLimit] = useState(PAGE);
  // 「只看商城有賣」：切分頁不重設（回到 12 類裝備分頁還開著），重新整理回到關著，所以不進網址、不存起來
  const [shopOnly, setShopOnly] = useState(false);
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

  const searching = text.trim() !== "";
  // 髮型、臉型、膚色沒有價錢：沒在搜尋時這三頁不顯示那顆鈕、也不套用（開著的狀態留著，回到裝備分頁還在）
  const shopShown = searching || !(tab === "hair" || tab === "face" || tab === "skin");
  const shop = shopShown && shopOnly;

  // 沒搜尋＝目前分頁一組（不寫區頭）；有搜尋＝跨類別一類一組
  const groups = useMemo(
    () => (searching ? searchGroups(data, outfit.g, text, TAB_KEYS, tab, shop) : [{ tab, entries: candidates(data, outfit.g, tab, text, shop) }]),
    [data, outfit.g, tab, text, searching, shop],
  );
  const total = groups.reduce((n, g) => n + g.entries.length, 0);
  // 一次 40 個是所有組加起來：排到第 40 個就停（可以停在一組中間），每組區頭的數字照寫那一組的全部
  const shown = useMemo(() => {
    let left = limit;
    const out: { tab: TabKey; total: number; cells: Cell[] }[] = [];
    for (const g of groups) {
      const part = g.entries.slice(0, left);
      if (part.length === 0) break;
      left -= part.length;
      out.push({ tab: g.tab, total: g.entries.length, cells: part.map((e) => toCell(e, outfit, data)) });
    }
    return out;
  }, [groups, limit, outfit, data]);

  // 從穿了什麼小卡跳過來、分頁在橫捲列外面：把那顆捲進來（只捲這一列，不動整頁）
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = tabsRef.current;
    const btn = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !btn) return;
    const r = row.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    if (b.left < r.left || b.right > r.right) row.scrollLeft += b.left - r.left - (r.width - b.width) / 2;
  }, [tab, searching]);

  const pick = (cell: Cell) => {
    if (!cell.ok) return toast(MISSING);
    const next = cell.next();
    if (!next) return;
    onChange(next);
    // 規則順手脫掉別格（套服↔上衣褲裙、雙手武器↔盾牌）就說一聲；只有這裡點格子會跳，隨機、換性別、重置不跳
    const gone = cell.slot ? removedSlots(outfit.wear, next.wear, cell.slot) : [];
    if (gone.length > 0) toast(takenOffText(gone));
  };

  // 搜尋時色塊藏起來（結果裡髮型、臉型的顏色照目前這套）；清掉字就回來
  const hair = !searching && tab === "hair" ? hairStyle(data, outfit.hair) : undefined;
  const face = !searching && tab === "face" ? faceStyle(data, outfit.face) : undefined;

  return (
    <section
      ref={ref}
      aria-label="挑衣服"
      // 捲到這張卡時讓出頁首＋小窗（小窗 128px＋上下空隙）；電腦版沒有小窗，只讓頁首
      className={`${CARD} scroll-mt-[calc(var(--header-offset)+148px)] lg:scroll-mt-header`}
    >
      <div ref={tabsRef} role="group" aria-label="類別" className="scroll-x flex gap-1.5 pb-1">
        {TABS.map((t) => {
          // 搜尋時分頁都不亮（結果跨類別，不屬於哪一頁）
          const on = !searching && t.k === tab;
          return (
            <button
              key={t.k}
              type="button"
              aria-pressed={on}
              data-tab={t.k}
              onClick={() => {
                // 點的剛好是目前分頁，分頁沒變、不會觸發上面的重設，所以搜尋要自己清
                if (searching) search("");
                onTab(t.k);
              }}
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
          placeholder="搜尋髮型、臉型、裝備名稱"
          aria-label="搜尋髮型、臉型、裝備名稱"
          {...searchKeys}
          className="min-h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none"
        />
        {text ? <SearchClear onClear={() => search("")} /> : null}
      </div>

      {shopShown ? (
        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            aria-pressed={shopOnly}
            onClick={() => {
              setShopOnly(!shopOnly);
              setLimit(PAGE);
            }}
            className={`tap-safe shrink-0 whitespace-nowrap rounded-full px-3.5 text-[14px] font-extrabold ${
              shopOnly ? "bg-[color:var(--maple)] text-[color:var(--on-accent)]" : "border border-[color:var(--paper-edge)] bg-[color:var(--paper)]"
            }`}
          >
            只看商城有賣
          </button>
          {/* 搜尋時總數寫在下面「找到 N 件」，這裡不重複 */}
          {shop && !searching ? <span className="text-[13px] ink-soft">{`${total} 件`}</span> : null}
        </div>
      ) : null}

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

      {searching && total > 0 ? <p className="mt-2.5 text-[13px] ink-soft">{`找到 ${total} 件`}</p> : null}

      {total === 0 ? (
        <p className="py-8 text-center text-[14px] ink-soft">{searching ? "找不到，換個字試試" : "沒有可以挑的"}</p>
      ) : (
        shown.map((group) => (
          <div key={group.tab}>
            {searching ? (
              <h3 data-group={group.tab} className="mt-3 text-[14px] font-black">
                {`${labelOf(group.tab)}（${group.total}）`}
              </h3>
            ) : null}
            <ul aria-label={labelOf(group.tab)} className={`${searching ? "mt-2" : "mt-3"} grid grid-cols-4 gap-2`}>
              {group.cells.map((cell) => (
                <li key={cell.key}>
                  <CellButton cell={cell} onClick={() => pick(cell)} />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {total > limit ? (
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
      {cell.price ? <span className="max-w-full whitespace-nowrap text-[12px] font-bold leading-tight ink-soft">{`${cell.price.toLocaleString("en-US")} 樂豆點`}</span> : null}
    </button>
  );
}
