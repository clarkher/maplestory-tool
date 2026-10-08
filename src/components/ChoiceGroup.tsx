"use client";

import { useRef, type KeyboardEvent } from "react";

/**
 * 互斥的幾個選項選一個（首頁「能力值與裝備」卡的點法：一般點法／全幸、全智／裝備法）：
 * role="radiogroup" 裡一顆一顆 role="radio"＋aria-checked，讀螢幕軟體會念「點法，單選，2 之 2，已選取」。
 * 樣子跟 FilterTag（查資料頁的篩選）一樣，但 FilterTag 是開／關各自獨立的 aria-pressed，兩種不要混用。
 *
 * 鍵盤照 WAI-ARIA 的單選群組：Tab 只停在選中的那顆；左右（上下）方向鍵換到上一個／下一個並直接選它，
 * 到頭會繞回去；Home／End 到第一個／最後一個。
 * 這裡沒有 FilterTag 那層 useHydrated：用它的卡片只在讀到角色之後才畫，伺服器那格不會有這排按鈕。
 */
export function ChoiceGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (option: string) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = Math.max(0, options.indexOf(value));

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = options.length - 1;
    const target =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % options.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index + last) % options.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    onChange(options[target]);
    refs.current[target]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span aria-hidden className="mr-0.5 text-[12px] font-black ink-faint">
        {label}
      </span>
      {options.map((option, index) => {
        const checked = index === selected;
        return (
          <button
            key={option}
            ref={element => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option)}
            onKeyDown={event => onKeyDown(event, index)}
            className={[
              "inline-flex min-h-9 shrink-0 touch-manipulation items-center whitespace-nowrap rounded-full border px-[11px] text-[13px] font-bold transition-colors",
              checked
                ? "border-[color:var(--maple)] bg-[color:var(--maple)] text-white"
                : "border-[color:var(--paper-edge)] bg-[color:var(--paper)] hover:bg-[color:var(--maple-wash)]",
            ].join(" ")}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
