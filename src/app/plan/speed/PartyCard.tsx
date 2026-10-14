// src/app/plan/speed/PartyCard.tsx
"use client";

import { useId, useRef, useState } from "react";
import type { SpeedParty } from "@/lib/speed/settings";
import { draftParty, hitterAfterRemove, MAX_OTHERS, partyLevel } from "@/lib/speed/view";
import { BUTTON_LINE, Card } from "./parts";

type Row = { id: number; text: string };

/** 讀螢幕軟體分得出是哪一位隊友：照順序叫，等級填好了一起唸 */
function mateName(index: number, text: string): string {
  const level = partyLevel(text);
  return `第 ${index + 1} 個隊友（${level !== null ? `Lv.${level}` : "還沒填等級"}）`;
}

/**
 * 組隊卡（10/13 使用者拍板：組隊不從畫面認，玩家自己填）。沒勾只有勾選框；勾了列「你」跟每個隊友的等級（最多 5 個），
 * 每列一個「打怪的人」單選。等級欄打的字放在這張卡自己的草稿裡；存進這台電腦的只有填好的那幾格（draftParty），
 * 不合法的等級不存——存了的話重新整理時那一格會被濾掉，打怪的人就跟著位移到別人身上。
 * 等級打完（離開欄位或按 Enter）才存：一邊打一邊存的話，打 44 會先存一次 4；練到一半換隊伍頁面會把這段收掉，
 * 打一個數字就會切出一段。勾選框、單選、刪掉、加一個是一按就存。
 */
export function PartyCard({ party, selfLevel, onChange }: { party: SpeedParty; selfLevel: number | null; onChange: (next: SpeedParty) => void }) {
  const nextId = useRef(0);
  const makeRow = (text: string): Row => ({ id: nextId.current++, text });
  const [rows, setRows] = useState<Row[]>(() => party.others.map(level => makeRow(String(level))));
  const [hitter, setHitter] = useState(party.hitter);
  const group = useId();

  /** 草稿換成新的；存的（也是拿來算經驗的）只有填好的那幾格，打怪的人跟著同一位隊友 */
  const update = (nextRows: Row[], nextHitter: number, on = party.on) => {
    setRows(nextRows);
    setHitter(nextHitter);
    onChange(draftParty(on, nextRows.map(row => row.text), nextHitter));
  };

  return (
    <Card>
      <label className="flex w-fit items-center gap-2 font-bold">
        <input
          type="checkbox"
          checked={party.on}
          onChange={event => {
            const on = event.target.checked;
            // 剛勾、還沒填過隊友：先給一格，不用再多按一次「加一個隊友」
            update(on && !rows.length ? [makeRow("")] : rows, hitter, on);
          }}
          className="size-4 accent-[color:var(--maple)]"
        />
        組隊
      </label>
      {party.on ? (
        <div className="mt-3 space-y-2">
          <div className="flex min-h-9 items-center gap-3">
            <span className="min-w-0 flex-1 text-sm font-bold">{selfLevel !== null ? `你 Lv.${selfLevel}` : "你（等級還沒讀到）"}</span>
            <HitterRadio name={group} checked={hitter === 0} onPick={() => update(rows, 0)} label="你是打怪的人" />
          </div>
          {rows.map((row, i) => {
            const invalid = row.text !== "" && partyLevel(row.text) === null;
            return (
              <div key={row.id} className="flex min-h-9 items-center gap-3">
                <label className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm">
                  隊友等級
                  <input
                    value={row.text}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="1～120"
                    aria-label={`隊友等級（第 ${i + 1} 個）`}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? `${group}-bad-${row.id}` : undefined}
                    onChange={event => {
                      const text = event.target.value.replace(/\D/g, "").slice(0, 3);
                      setRows(rows.map(each => (each.id === row.id ? { ...each, text } : each)));
                    }}
                    onBlur={() => update(rows, hitter)}
                    onKeyDown={event => {
                      if (event.key === "Enter") update(rows, hitter);
                    }}
                    className="w-20 rounded-lg border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-2 py-1 text-base tabular-nums outline-none focus:border-[color:var(--maple)]"
                  />
                  {invalid ? (
                    <span id={`${group}-bad-${row.id}`} className="text-[12px] font-bold text-[color:var(--maple)]">
                      要 1～120
                    </span>
                  ) : null}
                </label>
                <button
                  type="button"
                  onClick={() => update(rows.filter(each => each.id !== row.id), hitterAfterRemove(hitter, i))}
                  aria-label={`刪掉${mateName(i, row.text)}`}
                  className="shrink-0 text-sm font-bold ink-soft hover:text-[color:var(--maple)]"
                >
                  刪掉
                </button>
                <HitterRadio name={group} checked={hitter === i + 1} onPick={() => update(rows, i + 1)} label={`${mateName(i, row.text)}是打怪的人`} />
              </div>
            );
          })}
          {rows.length < MAX_OTHERS ? (
            <button type="button" onClick={() => update([...rows, makeRow("")], hitter)} className={BUTTON_LINE}>
              加一個隊友
            </button>
          ) : null}
          {/* 一段紀錄只會有一種隊伍（頁面的 onParty、splitOnPartyChange）：先講清楚，玩家才不會以為改了隊伍時間被吃掉 */}
          <p className="text-[12px] leading-relaxed ink-soft">練到一半改隊伍，會從改的那一刻重新算一段（不到 5 分鐘的那段不存）。</p>
        </div>
      ) : null}
    </Card>
  );
}

function HitterRadio({ name, checked, onPick, label }: { name: string; checked: boolean; onPick: () => void; label: string }) {
  return (
    <label className="flex shrink-0 items-center gap-1.5 text-sm">
      <input type="radio" name={name} checked={checked} onChange={onPick} aria-label={label} className="size-4 accent-[color:var(--maple)]" />
      <span aria-hidden="true">打怪的人</span>
    </label>
  );
}
