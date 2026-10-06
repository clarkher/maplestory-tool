"use client";

import Image from "next/image";
import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronRight } from "@/components/Icons";
import { npcImage } from "@/lib/data";
import {
  JOB_LINES, SECOND_JOB_LEVEL, THIRD_JOB_LEVEL, branchPairs, commitLevelText, jobLineOf, jobOption, jobTier, minLevelFor, pickJobKeepingLevel, typedLevel,
} from "@/lib/jobs";
import { LEVEL_CAP } from "@/lib/profile";
import { useBeforeV002 } from "@/lib/release";
import type { Profile } from "@/lib/types";
import { Sprite } from "./bits";

/**
 * 角色列：職業＋等級。升級了改這裡，整頁跟著換。
 * 第一次來（還沒填）直接展開選單，不另外做一個「開始」頁。
 */
export function CharacterBar({ profile, onChange }: { profile: Profile; onChange: (next: Profile) => void }) {
  const beforeOpen = useBeforeV002();
  const incomplete = profile.level <= 0 || profile.job < 0;
  const [editing, setEditing] = useState(incomplete);
  const [levelText, setLevelText] = useState(profile.level ? String(profile.level) : "");
  // 等級跟職業對不起來時的提示（例：狂戰士至少 30 等、目前等級上限 Lv.120）
  const [hint, setHint] = useState<string | null>(null);
  // 選職業把等級拉高前的等級（劍士 18 手滑點狂戰士 → 30）；點回允許它的職業就還原
  const raisedFrom = useRef<number | null>(null);
  const min = minLevelFor(profile.job);

  useEffect(() => {
    setLevelText(profile.level ? String(profile.level) : "");
  }, [profile.level]);

  useEffect(() => {
    if (incomplete) setEditing(true);
  }, [incomplete]);

  const option = jobOption(profile.job);
  const tier = jobTier(profile.job);
  const currentLine = jobLineOf(profile.job);
  const stageText = profile.job < 0
    ? "還沒選職業"
    : profile.job === 0
      ? "還沒轉職"
      : tier === 3
        ? `${option?.line} · 三轉`
        : tier === 2
          ? profile.level >= THIRD_JOB_LEVEL
            ? `${option?.line} · 二轉 · ${THIRD_JOB_LEVEL} 等${beforeOpen ? "可以三轉（10/15 開放）" : "可以三轉了（照舊版）"}`
            : `${option?.line} · 二轉`
          : profile.level >= SECOND_JOB_LEVEL ? `一轉 · ${SECOND_JOB_LEVEL} 等可以二轉了` : "一轉";

  /** 打字當下：這個職業允許、又沒超過上限的等級才套用，其他先等，也不給提示（要打 15 先打 1 不會閃紅字） */
  function setLevel(raw: string) {
    setLevelText(raw);
    setHint(null);
    const value = typedLevel(raw, profile.job, LEVEL_CAP);
    if (value === null || value === profile.level) return;
    raisedFrom.current = null;
    onChange({ ...profile, level: value });
  }

  /** 離開輸入框或按 Enter：空白、0 改回現在的等級；超過上限改成上限並提示；比職業最低等級低給提示、等級不動 */
  function commitLevel() {
    const { level, hint: note } = commitLevelText(levelText, profile, LEVEL_CAP);
    setHint(note);
    setLevelText(level ? String(level) : "");
    if (level === profile.level) return;
    raisedFrom.current = null;
    onChange({ ...profile, level });
  }

  function step(delta: number) {
    setHint(null);
    raisedFrom.current = null;
    const next = Math.max(min, Math.min(LEVEL_CAP, (profile.level || 0) + delta));
    onChange({ ...profile, level: next });
  }

  /**
   * 按職業鈕時不讓等級輸入框失焦：失焦會先把輸入框改回去、提示收掉，按鈕往上跳一行、點擊落空，
   * 打的數字也來不及拿給 pickJob 重新驗。
   */
  function keepTyping(event: React.MouseEvent) {
    event.preventDefault();
  }

  /** 二轉、三轉那一格的按鈕：撐滿欄寬，一組二轉 → 三轉左右對齊 */
  function jobPill([id, name]: [number, string]) {
    const active = profile.job === id;
    return (
      <button
        type="button"
        onMouseDown={keepTyping}
        onClick={() => pickJob(id)}
        aria-pressed={active}
        className={[
          "w-full rounded-full px-2 py-1.5 text-[13px] font-bold transition-colors",
          active ? "bg-[color:var(--maple)] text-white" : "border border-[color:var(--paper-edge)] bg-[color:var(--paper)]",
        ].join(" ")}
      >
        {name}
      </button>
    );
  }

  /**
   * 選的職業等級不夠時，直接把等級調到它的最低等級並說一聲。
   * 輸入框裡被原本職業擋下的等級（狂戰士狀態下打的 25）一起重新驗：新職業允許就套用，
   * 不允許就把輸入框改回實際等級——輸入框跟標題不會對不起來。
   * 手滑點到二轉被拉到 30 時記住原本的等級，點回允許那個等級的職業就改回去（pickJobKeepingLevel）。
   */
  function pickJob(id: number) {
    const typed = Number(levelText.replace(/[^0-9]/g, ""));
    const { next, note, raisedFrom: memory } = pickJobKeepingLevel(profile, id, typed > 0 ? Math.min(LEVEL_CAP, typed) : undefined, raisedFrom.current);
    raisedFrom.current = memory;
    setHint(note);
    setLevelText(next.level ? String(next.level) : "");
    onChange(next);
  }

  return (
    <section aria-label="你的角色" className="rounded-[var(--radius-card)] glass wood-frame p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-14 shrink-0 place-items-end overflow-hidden rounded-2xl bg-[color:var(--paper-deep)]">
          {option ? (
            <Sprite src={npcImage(option.npcId)} size={56} alt={option.npcName} />
          ) : (
            <Image src="/brand-emblem.png" alt="" width={56} height={56} className="size-14" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold ink-faint">{incomplete ? "先選職業跟等級" : stageText}</span>
          {/* 收合時把等級 −/+ 跟「換其他職業」都放這裡：寬度夠（桌機）擠成一行，不夠（手機）換其他職業自動換到第二行、跟名字對齊 */}
          <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-black leading-tight">
                {option?.name ?? (profile.job === 0 ? "初心者" : "選職業")}
                {profile.level > 0 ? <span className="ml-1.5 tabular-nums text-[color:var(--maple)]">Lv.{profile.level}</span> : null}
              </span>
              {!incomplete && !editing ? (
                <span className="flex items-center gap-1.5">
                  <button type="button" onClick={() => step(-1)} disabled={profile.level > 0 && profile.level <= min} className="tap-safe grid w-11 place-items-center rounded-xl border border-[color:var(--paper-edge)] text-lg font-black disabled:opacity-40" aria-label="等級減一">−</button>
                  <button type="button" onClick={() => step(1)} className="tap-safe grid w-11 place-items-center rounded-xl border border-[color:var(--paper-edge)] text-lg font-black" aria-label="等級加一">+</button>
                </span>
              ) : null}
            </span>
            {!incomplete && !editing ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-expanded={false}
                className="tap-safe shrink-0 rounded-full border border-[color:var(--paper-edge)] px-4 text-sm font-bold transition-colors hover:border-[color:var(--maple)]"
              >
                換其他職業
              </button>
            ) : null}
          </span>
        </span>
      </div>

      {editing ? (
        <div className="mt-3 space-y-3 border-t border-[color:var(--paper-edge)] pt-3">
          <div>
            <p className="mb-1.5 text-sm font-bold">
              等級 <span className="text-xs font-normal ink-faint">目前開放到 {LEVEL_CAP}</span>
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => step(-1)} disabled={profile.level > 0 && profile.level <= min} className="tap-safe grid w-11 place-items-center rounded-xl border border-[color:var(--paper-edge)] text-lg font-black disabled:opacity-40" aria-label="等級減一">−</button>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={levelText}
                placeholder={`${min}–${LEVEL_CAP}`}
                onChange={event => setLevel(event.target.value)}
                onBlur={commitLevel}
                onKeyDown={event => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                className="tap-safe w-24 rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3 text-center text-lg font-black tabular-nums outline-none focus:border-[color:var(--maple)]"
                aria-label="你的等級"
              />
              <button type="button" onClick={() => step(1)} className="tap-safe grid w-11 place-items-center rounded-xl border border-[color:var(--paper-edge)] text-lg font-black" aria-label="等級加一">+</button>
            </div>
            {hint ? <p role="status" className="mt-1.5 text-[12px] font-bold text-[color:var(--maple)]">{hint}</p> : null}
          </div>

          <div>
            <p className="mb-1.5 text-sm font-bold">
              職業 <span className="text-xs font-normal ink-faint">法師 8 等、其他 10 等轉職；二轉 30 等起；三轉先照舊版 70 等（等開機公告確認）</span>
            </p>
            {/* 先選一轉（系別），下面只列這一系的二轉，每個二轉右邊接它的三轉（刺客 → 暗殺者）；
                2026-10-06 使用者：三排全列「不好找也不直覺、不曉得是從哪個職業二轉的」 */}
            <div className="space-y-2.5">
              <div>
                <p className="mb-1 text-[11px] font-bold ink-faint">一轉</p>
                <div className="flex flex-wrap gap-1.5">
                  {JOB_LINES.map(line => {
                    const selected = profile.job === line.base;
                    // 選的是這一系的二轉或三轉：系別也標起來，看得出下面列的是哪一系
                    const inLine = !selected && currentLine?.base === line.base;
                    return (
                      <button
                        key={line.base}
                        type="button"
                        onMouseDown={keepTyping}
                        onClick={() => pickJob(line.base)}
                        aria-pressed={selected}
                        className={[
                          "rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors",
                          selected
                            ? "bg-[color:var(--maple)] text-white"
                            : inLine
                              ? "border border-[color:var(--maple)] bg-[color:var(--maple-wash)] text-[color:var(--maple)]"
                              : "border border-[color:var(--paper-edge)] bg-[color:var(--paper)]",
                        ].join(" ")}
                      >
                        {line.line}
                      </button>
                    );
                  })}
                </div>
              </div>

              {currentLine ? (
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1.5 gap-y-2 rounded-xl bg-[color:var(--paper-deep)] p-2.5">
                  <p className="text-[11px] font-bold ink-faint">二轉</p>
                  <span />
                  <p className="text-[11px] font-bold ink-faint">{beforeOpen ? "三轉（10/15 開放）" : "三轉"}</p>
                  {branchPairs(currentLine).map(({ second, third }) => (
                    <Fragment key={second[0]}>
                      {jobPill(second)}
                      <ChevronRight size={14} className="ink-faint" />
                      {jobPill(third)}
                    </Fragment>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] ink-faint">選了一轉，這裡會列出它的二轉跟三轉。</p>
              )}

              <button
                type="button"
                onMouseDown={keepTyping}
                onClick={() => pickJob(0)}
                aria-pressed={profile.job === 0}
                className={[
                  "rounded-full px-3 py-1.5 text-[13px] font-bold",
                  profile.job === 0 ? "bg-[color:var(--maple)] text-white" : "border border-dashed border-[color:var(--paper-edge)] ink-soft",
                ].join(" ")}
              >
                初心者／還沒轉職
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={incomplete}
            className="tap-safe w-full rounded-full bg-[color:var(--maple)] text-sm font-bold text-white disabled:opacity-40"
          >
            {incomplete ? "選好職業、填好等級就能看" : "看我的路線"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
