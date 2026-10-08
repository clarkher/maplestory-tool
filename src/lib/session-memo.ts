"use client";

/**
 * 跟 useMemo 一樣比較依賴（每一個都用 Object.is），但記在模組裡：離開首頁再回來（元件重新掛上、useMemo 全部清空），
 * 資料跟角色沒變就直接拿上次算好的。資料檔這次瀏覽只載一次（data.ts），同一份資料一直是同一個物件，比得出來。
 * 每個 slot 只記最後一次，切到別的職業再切回來會重算——要省的是換頁回來那一下。
 * compute 必須是純函式：渲染時呼叫，React 可能算了又丟掉。
 */
const slots = new Map<string, { deps: readonly unknown[]; value: unknown }>();

export function sessionMemo<T>(slot: string, deps: readonly unknown[], compute: () => T): T {
  const last = slots.get(slot);
  if (last && last.deps.length === deps.length && last.deps.every((dep, index) => Object.is(dep, deps[index]))) {
    return last.value as T;
  }
  const value = compute();
  slots.set(slot, { deps, value });
  return value;
}
