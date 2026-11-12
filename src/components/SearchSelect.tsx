"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, SearchIcon } from "./Icons";
import { SearchClear, searchKeys } from "./SearchClear";
import { filterOptions, type SearchOption } from "@/lib/search-select";

/**
 * 能打字找的下拉選單（v2.13 使用者：選怪、選武器的地方都要能輸入搜尋）。
 * 平常是一顆跟原本 <select> 一樣的按鈕；按下去變搜尋框＋清單，沒打字時整份照原本順序列（照樣能從頭滑），
 * 打字就只剩對得上的。上下鍵移、Enter 選、Esc 或點外面收起來。
 */
export function SearchSelect({
  label,
  value,
  options,
  onSelect,
  placeholder,
  emptyText,
  className,
}: {
  /** 讀屏念的名字，也是驗收腳本認的 aria-label */
  label: string;
  value: number | null;
  options: SearchOption[];
  onSelect: (value: number | null) => void;
  placeholder: string;
  /** value 是 null 又不在選項裡時按鈕上的字（例如「選武器」） */
  emptyText?: string;
  /** 按鈕外觀，跟頁面上其他 <select> 同一套 */
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const matches = useMemo(() => filterOptions(options, query), [options, query]);
  const current = options.find(option => option.value === value);

  // 打開時亮在目前選的那一個（沒打字的整份清單才找得到它），清單捲到它
  useEffect(() => {
    if (!open) return;
    const index = query ? 0 : Math.max(0, matches.findIndex(option => option.value === value));
    setActive(index);
  }, [open, query]); // 只在打開、改字時重設，移上下鍵不重設

  // 只捲清單自己，不用 scrollIntoView（那個連整頁一起捲，手機一打開清單畫面就跳）
  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!open || !list || !item) return;
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function pick(option: SearchOption) {
    onSelect(option.value);
    setOpen(false);
    setQuery("");
  }

  if (!open) {
    return (
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        onClick={() => {
          setQuery("");
          setOpen(true);
        }}
        className={`${className} flex items-center gap-1 text-left`}
      >
        <span className="min-w-0 truncate">{current?.label ?? emptyText ?? ""}</span>
        <ChevronDown size={14} className="shrink-0 ink-faint" />
      </button>
    );
  }

  return (
    <div ref={boxRef} className="relative min-w-0">
      <div className="flex w-[min(60vw,15rem)] items-center gap-1.5 rounded-lg border border-[color:var(--maple)] bg-[color:var(--paper)] pl-2">
        <SearchIcon size={15} className="shrink-0 ink-faint" />
        <input
          autoFocus
          role="combobox"
          aria-label={label}
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={matches[active] ? `${listId}-${active}` : undefined}
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          // 手機 16px 才不會被 iOS 自動放大
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[16px] font-bold outline-none sm:text-[14px]"
          enterKeyHint={searchKeys.enterKeyHint}
          onKeyDown={event => {
            if (event.key === "Escape") {
              setOpen(false);
              return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!matches.length) return;
              const step = event.key === "ArrowDown" ? 1 : -1;
              setActive(index => (index + step + matches.length) % matches.length);
              return;
            }
            // 注音選字的 Enter 不算（keyCode 229）
            if (event.key === "Enter" && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
              event.preventDefault();
              if (matches[active]) pick(matches[active]);
            }
          }}
        />
        {query ? <SearchClear onClear={() => setQuery("")} /> : null}
      </div>
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={label}
        className="absolute right-0 z-30 mt-1 max-h-72 w-[min(85vw,20rem)] overflow-y-auto rounded-xl glass-solid p-1 text-left shadow-[var(--float-shadow)]"
      >
        {matches.length ? (
          matches.map((option, index) => {
            const selected = option.value === value;
            return (
              <li
                key={option.value ?? "none"}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={selected}
                // 按下去就選：不用 click，免得手機上鍵盤收起、清單位移時點空
                onPointerDown={event => {
                  event.preventDefault();
                  pick(option);
                }}
                onPointerEnter={() => setActive(index)}
                className={[
                  "tap-safe cursor-pointer rounded-lg border px-2.5 py-2 text-[14px] font-bold",
                  selected ? "border-[color:var(--maple)] bg-[color:var(--maple-wash)] text-[color:var(--maple)]" : "border-transparent",
                  index === active && !selected ? "bg-[color:var(--paper-deep)]" : "",
                ].join(" ")}
              >
                {option.label}
              </li>
            );
          })
        ) : (
          <li className="px-2.5 py-2 text-[13px] ink-faint">找不到「{query.trim()}」，換個字試試</li>
        )}
      </ul>
    </div>
  );
}
