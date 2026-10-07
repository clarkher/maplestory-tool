"use client";

import { CloseIcon } from "./Icons";

/** 搜尋框右邊那顆「×」的樣子（帶我去選地圖的「取消更改」也用這個）：按得到的範圍放大到 40px，手指好按 */
export const X_BUTTON = "-mr-2 grid size-10 shrink-0 place-items-center text-[color:var(--ink-faint)] hover:text-[color:var(--ink)]";

/**
 * 搜尋框有字時右邊的「×」：一鍵清掉字，焦點留在搜尋框，可以直接打新的。
 * 放在搜尋框旁邊（跟輸入框同一個外框裡），按完找外框裡的輸入框放焦點。
 */
export function SearchClear({ onClear }: { onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={event => {
        onClear();
        event.currentTarget.parentElement?.querySelector("input")?.focus();
      }}
      className={X_BUTTON}
      aria-label="清除搜尋"
    >
      <CloseIcon size={16} />
    </button>
  );
}
