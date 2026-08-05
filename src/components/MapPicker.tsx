"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CloseIcon, SearchIcon } from "./Icons";
import { loadSearch } from "@/lib/data";
import type { MapRecord, SearchRow } from "@/lib/types";

/** 地圖搜尋。索引裡地圖是 type "p"，一次載完在前端過濾就夠快。 */
export function MapPicker({
  label,
  value,
  maps,
  onSelect,
  placeholder = "輸入地圖名稱",
}: {
  label: string;
  value: number | null;
  maps: Record<string, MapRecord>;
  onSelect: (mapId: number) => void;
  placeholder?: string;
}) {
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSearch().then(all => setRows(all.filter(row => row[0] === "p"))).catch(() => setRows([]));
  }, []);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const matches = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];
    const starts: SearchRow[] = [];
    const contains: SearchRow[] = [];
    for (const row of rows) {
      const name = String(row[2]).toLowerCase();
      if (name.startsWith(keyword)) starts.push(row);
      else if (name.includes(keyword) || String(row[1]) === keyword) contains.push(row);
      if (starts.length >= 20) break;
    }
    return [...starts, ...contains].slice(0, 20);
  }, [rows, query]);

  const current = value !== null ? maps[String(value)] : null;
  const currentName = current?.zh || (value !== null ? "未開放地圖" : "");

  return (
    <div ref={boxRef} className="relative">
      <span className="mb-1.5 block text-sm font-bold">{label}</span>

      {value !== null && !open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setQuery("");
          }}
          className="tap-safe flex w-full items-center gap-2 rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3.5 py-2.5 text-left transition-colors hover:border-[color:var(--maple)]"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">{currentName}</span>
            {current?.st ? <span className="block truncate text-xs ink-faint">{current.st}</span> : null}
          </span>
          <span className="shrink-0 text-xs font-bold ink-faint">更改</span>
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3 focus-within:border-[color:var(--maple)]">
          <SearchIcon size={17} className="shrink-0 text-[color:var(--ink-faint)]" />
          <input
            autoFocus={open}
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="tap-safe w-full bg-transparent py-2.5 outline-none"
            aria-label={label}
          />
          {value !== null ? (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 text-[color:var(--ink-faint)] hover:text-[color:var(--ink)]"
              aria-label="取消更改"
            >
              <CloseIcon size={16} />
            </button>
          ) : null}
        </div>
      )}

      {open && matches.length > 0 ? (
        <ul className="absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl glass-solid p-1">
          {matches.map(row => (
            <li key={String(row[1])}>
              <button
                type="button"
                onClick={() => {
                  onSelect(Number(row[1]));
                  setQuery("");
                  setOpen(false);
                }}
                className="tap-safe flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-[color:var(--maple-wash)]"
              >
                <span className="font-bold">{row[2]}</span>
                {row[3] ? <span className="text-xs ink-faint">{row[3]}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
