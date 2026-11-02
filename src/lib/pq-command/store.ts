"use client";

import { useCallback, useEffect, useState } from "react";
import { combos, firstAssign, nextAssign } from "./combo";
import { PQS, findPq, type PqKey } from "./data";

/**
 * 組隊指揮存在這台電腦（localStorage，2026-11-02 使用者拍板 3A）：
 * - pq：上次看的任務
 * - names：隊員名字（最多 6 個，每個最多 12 字），重來不清
 * - prog：每個任務打到第幾關（stage）、每個試組合的關試到第幾組（i，0 起算；hit＝這組是答案）、勾了哪些「隊長要做」（checked：「關代號:第幾條」）
 * 壞掉的欄位各自回預設，不拖累其他欄位。
 */
export type ComboProg = { i: number; hit: boolean };
export type PqProg = { stage: number; combo: Record<string, ComboProg>; checked: string[] };
export type PqState = { pq: PqKey; names: string[]; prog: Record<PqKey, PqProg> };

const KEY = "ms-pq";
export const MAX_NAMES = 6;
const MAX_NAME_LEN = 12;

const emptyProg = (): PqProg => ({ stage: 0, combo: {}, checked: [] });

export function defaultPqState(): PqState {
  return { pq: "moon", names: [], prog: { moon: emptyProg(), kerning: emptyProg(), goddess: emptyProg() } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseProg(key: PqKey, value: unknown): PqProg {
  const info = findPq(key)!;
  if (!isRecord(value)) return emptyProg();
  const stage = Number.isInteger(value.stage) && (value.stage as number) >= 0 && (value.stage as number) < info.stages.length ? (value.stage as number) : 0;
  const combo: Record<string, ComboProg> = {};
  if (isRecord(value.combo)) {
    for (const st of info.stages) {
      const raw = value.combo[st.key];
      if (!st.combo || !isRecord(raw)) continue;
      const total = combos(st.combo.n, st.combo.k).length;
      if (!Number.isInteger(raw.i) || (raw.i as number) < 0 || (raw.i as number) > total) continue;
      combo[st.key] = { i: raw.i as number, hit: raw.hit === true && (raw.i as number) < total };
    }
  }
  const valid = new Set(info.stages.flatMap((st) => st.todo.map((_, n) => `${st.key}:${n}`)));
  const checked = Array.isArray(value.checked) ? value.checked.filter((c): c is string => typeof c === "string" && valid.has(c)) : [];
  return { stage, combo, checked: [...new Set(checked)] };
}

export function parsePqState(raw: string | null): PqState {
  const base = defaultPqState();
  if (!raw) return base;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!isRecord(value)) return base;
  const pq = findPq(typeof value.pq === "string" ? value.pq : null)?.key ?? base.pq;
  const names = Array.isArray(value.names)
    ? value.names.slice(0, MAX_NAMES).map((n) => (typeof n === "string" ? n.slice(0, MAX_NAME_LEN) : ""))
    : [];
  const progRaw = isRecord(value.prog) ? value.prog : {};
  const prog = Object.fromEntries(PQS.map((p) => [p.key, parseProg(p.key, progRaw[p.key])])) as Record<PqKey, PqProg>;
  return { pq, names, prog };
}

/** 重來：只清這個任務的進度，名字留著 */
export function resetPq(state: PqState, key: PqKey): PqState {
  return { ...state, prog: { ...state.prog, [key]: emptyProg() } };
}

/** 試到第 i 組時每個人站幾號（從第一組一路換過來） */
export function assignAt(list: number[][], i: number): number[] {
  let assign = firstAssign(list[0]);
  for (let step = 1; step <= Math.min(i, list.length - 1); step++) assign = nextAssign(assign, list[step]);
  return assign;
}

function read(): PqState {
  try {
    return parsePqState(localStorage.getItem(KEY));
  } catch {
    return defaultPqState();
  }
}

/**
 * 頁面用：第一次畫用預設（跟伺服器一樣），掛上後讀存檔；每次改都寫回去。
 * 網址帶了任務（從攻略、首頁點進來）讀存檔時就一起換過去，不會先閃一格上次的任務。
 */
export function usePqState(urlPq?: PqKey): [PqState, (update: (s: PqState) => PqState) => void, boolean] {
  const [state, setState] = useState<PqState>(() => (urlPq ? { ...defaultPqState(), pq: urlPq } : defaultPqState()));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const saved = read();
    setState(urlPq ? { ...saved, pq: urlPq } : saved);
    setReady(true);
    // 只在掛上時讀一次；之後切任務由頁面自己改
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const update = useCallback((fn: (s: PqState) => PqState) => {
    setState((prev) => {
      const next = fn(prev);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // 無痕或存不了：這次照用，只是不會記住
      }
      return next;
    });
  }, []);
  return [state, update, ready];
}
