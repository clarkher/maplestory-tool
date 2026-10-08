"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/Icons";
import { Sprite } from "@/components/route/bits";
import { monsterImage } from "@/lib/data";
import { killLists, type CalcData, type CalcState, type KillEntry, type MonsterChoice } from "@/lib/damage-view";
import { useVisitState } from "@/lib/visit-state";
import { Tag } from "./parts";

const CELL = 38;
const GAP = 6;

/** 這個寬度一排放得下幾格（收起來時顯示兩排） */
function useColumns() {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(7);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setColumns(Math.max(1, Math.floor((element.clientWidth + GAP) / (CELL + GAP))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, columns] as const;
}

function Section({ title, storeKey, list, beforeOpen, onOpen }: {
  title: string; storeKey: string; list: KillEntry[]; beforeOpen: boolean; onOpen: (entry: KillEntry, opener: HTMLElement) => void;
}) {
  const [ref, columns] = useColumns();
  // 「看全部」展開的狀態記在同一筆瀏覽紀錄上（重新整理、按返回回來還是展開的）
  const [open, setOpen] = useVisitState(storeKey, false);
  const limit = columns * 2;
  const shown = open ? list : list.slice(0, limit);
  return (
    <div>
      <h2 className="mb-2 text-[15px] font-black">
        {title}
        <span className="ml-1 text-[13px] font-bold ink-soft">{list.length} 隻</span>
      </h2>
      <div ref={ref} className="flex flex-wrap" style={{ gap: GAP }}>
        {list.length === 0 ? <p className="text-[13px] ink-soft">沒有</p> : null}
        {shown.map(entry => (
          <button
            key={entry.monster.id}
            type="button"
            title={`${entry.monster.n} Lv.${entry.monster.lv}`}
            aria-label={`${entry.monster.n} Lv.${entry.monster.lv}`}
            onClick={event => onOpen(entry, event.currentTarget)}
            className="relative grid place-items-center rounded-lg bg-[color:var(--paper-deep)] transition-transform hover:-translate-y-0.5 hover:ring-2 hover:ring-[color:var(--maple-soft)]"
            style={{ width: CELL, height: CELL }}
          >
            <Sprite src={monsterImage(entry.monster.id)} size={30} />
            <span className="absolute -bottom-1 right-0 rounded bg-[color:var(--ink)] px-0.5 text-[10px] font-bold leading-tight text-[color:var(--paper)]">Lv.{entry.monster.lv}</span>
            {entry.v002 && beforeOpen ? <span className="absolute -top-1 left-0 rounded bg-[color:var(--gold)] px-0.5 text-[10px] font-bold leading-tight text-[color:var(--on-accent)]">10/15</span> : null}
          </button>
        ))}
      </div>
      {list.length > limit ? (
        <button type="button" onClick={() => setOpen(value => !value)} className="tap-safe mt-1.5 text-[13px] font-bold text-[color:var(--sky)]" aria-expanded={open}>
          {open ? "收起來" : `看全部 ${list.length} 隻`}
        </button>
      ) : null}
    </div>
  );
}

function Sheet({ entry, kind, onClose, onPick }: { entry: KillEntry; kind: string; onClose: () => void; onPick: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  // 打開時把焦點放在第一顆按鈕（只做一次，跟 Esc 的監聽拆開，onClose 換了不會把焦點又搶回來）
  useEffect(() => {
    first.current?.focus();
  }, []);
  // Esc 關掉；Tab 在小卡裡的三個可聚焦元素（關掉、設成要打的怪、看掉寶）之間繞圈，不跑到後面的頁面
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = dialog.current?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)");
      if (!items?.length) return;
      const head = items[0];
      const tail = items[items.length - 1];
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
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const { monster } = entry;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={onClose}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={`${monster.n} Lv.${monster.lv}`}
        className="w-full max-w-3xl rounded-t-2xl border-t border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-4 pb-5 pt-2 shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.3)]"
        onClick={event => event.stopPropagation()}
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[color:var(--paper-edge)]" />
        <div className="flex items-start gap-2.5">
          <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-[color:var(--paper-deep)]">
            <Sprite src={monsterImage(monster.id)} size={44} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-black">
              {monster.n} <span className="text-[13px] ink-soft">Lv.{monster.lv}</span>
            </p>
            <p className="text-[12px] ink-soft">HP {monster.hp.toLocaleString()}・經驗 {monster.exp.toLocaleString()}</p>
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] font-bold text-[color:var(--leaf)]">
              <span>最低一次 {entry.minUse.toLocaleString()}，穩穩{kind}</span>
              <Tag level="unverified" />
            </p>
          </div>
          <button type="button" aria-label="關掉" onClick={onClose} className="grid size-9 place-items-center rounded-full ink-soft">
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <button ref={first} type="button" onClick={onPick} className="rounded-full bg-[color:var(--maple)] py-2.5 text-[14px] font-bold text-[color:var(--on-accent)]">設成要打的怪</button>
          <Link href={`/db/monsters?id=${monster.id}`} className="rounded-full border border-[color:var(--paper-edge)] py-2.5 text-center text-[14px] font-bold">看掉寶、出沒地點</Link>
        </div>
      </div>
    </div>
  );
}

export function KillCard({ data, state, active, label, onPick, beforeOpen, choices }: {
  data: CalcData; state: CalcState; active: 0 | 1; label: string; onPick: (monsterId: number) => void; beforeOpen: boolean; choices: MonsterChoice[];
}) {
  const lists = useMemo(() => killLists(data, state.shared, state.groups[active], choices), [data, state, active, choices]);
  const [selected, setSelected] = useState<{ entry: KillEntry; kind: string } | null>(null);
  // 小卡是從哪個圖示點開的：關掉後把焦點還給它（鍵盤、讀屏的人才不會掉到頁首）
  const opener = useRef<HTMLElement | null>(null);
  const close = useCallback(() => {
    setSelected(null);
    const element = opener.current;
    opener.current = null;
    if (element?.isConnected) element.focus({ preventScroll: true });
  }, []);
  const open = (kind: string) => (entry: KillEntry, element: HTMLElement) => {
    opener.current = element;
    setSelected({ entry, kind });
  };
  return (
    <section aria-label="一下、兩下打死的怪" className="space-y-3 rounded-[var(--radius-card)] glass wood-frame p-3.5">
      {lists ? (
        <>
          <Section title="一下打死" storeKey="damage:kill-one" list={lists.one} beforeOpen={beforeOpen} onOpen={open("一下")} />
          <Section title="兩下打死" storeKey="damage:kill-two" list={lists.two} beforeOpen={beforeOpen} onOpen={open("兩下")} />
          <p className="text-[11px] ink-faint">照「{label}」算、最低傷害也打得死才算；等級高的排前面。打怪公式是舊版國際服的，經典版沒驗證。</p>
        </>
      ) : (
        <p className="text-[13px] ink-soft">「{label}」這組算不出來（看上面的原因），名單出不來</p>
      )}
      {/* 小卡掛在 body 上：這張卡的毛玻璃（backdrop-filter）會把裡面的 fixed 框成這張卡的範圍，不掛出去就蓋不滿整個畫面 */}
      {selected
        ? createPortal(
            <Sheet
              entry={selected.entry}
              kind={selected.kind}
              onClose={close}
              onPick={() => {
                onPick(selected.entry.monster.id);
                close();
              }}
            />,
            document.body,
          )
        : null}
    </section>
  );
}
