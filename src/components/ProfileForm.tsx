"use client";

import { useEffect, useRef, useState } from "react";
import { JOB_LINES, commitLevelText, minLevelFor, normalizeJob, pickJobKeepingLevel, typedLevel } from "@/lib/jobs";
import { LEVEL_CAP } from "@/lib/profile";
import type { Profile } from "@/lib/types";

/**
 * 等級與職業。職業清單跟首頁同一份（經典版的 5 個一轉＋12 個二轉），
 * 客戶端資料裡有、經典版沒有的職業（皇家騎士團、影武者等）不列。
 */
export function ProfileForm({
  profile,
  onChange,
  compact = false,
}: {
  profile: Profile;
  onChange: (next: Profile) => void;
  compact?: boolean;
}) {
  const [levelText, setLevelText] = useState(profile.level ? String(profile.level) : "");
  // 等級跟職業對不起來時的提示（例：狂戰士至少 30 等、目前等級上限 Lv.120）
  const [hint, setHint] = useState<string | null>(null);
  // 點職業選單那一刻輸入框裡的字：選單一點開輸入框就失焦、被改回去，換職業時要拿這個重新驗
  const typedOnOpen = useRef<string | null>(null);
  // 選職業把等級拉高前的等級（手滑點到二轉被拉到 30）；之後選的職業允許它就還原（跟首頁角色列同一套）
  const raisedFrom = useRef<number | null>(null);

  useEffect(() => {
    setLevelText(profile.level ? String(profile.level) : "");
  }, [profile.level]);

  /** 打字當下：允許、沒超過上限的等級才套用，其他先等，也不給提示 */
  function typeLevel(raw: string) {
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

  return (
    <div
      className={[
        "glass wood-frame rounded-[var(--radius-card)] p-3 sm:p-4",
        compact ? "" : "sm:p-5",
      ].join(" ")}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <label className="flex-1">
          <span className="mb-1.5 block text-sm font-bold">
            你的等級
            <span className="ml-1.5 text-xs font-normal ink-faint">目前開放到 {LEVEL_CAP}</span>
          </span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={levelText}
            placeholder={`${minLevelFor(normalizeJob(profile.job))}–${LEVEL_CAP}`}
            onChange={event => typeLevel(event.target.value)}
            onBlur={commitLevel}
            onKeyDown={event => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className="tap-safe w-full rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3.5 py-2.5 text-lg font-bold tabular-nums outline-none transition-colors focus:border-[color:var(--maple)]"
            aria-label="你的等級"
          />
        </label>

        <label className="flex-[2]">
          <span className="mb-1.5 block text-sm font-bold">
            你的職業
            <span className="ml-1.5 text-xs font-normal ink-faint">二轉 30 等起、三轉先照舊版 70 等</span>
          </span>
          <select
            value={normalizeJob(profile.job)}
            onPointerDown={() => {
              typedOnOpen.current = levelText;
            }}
            onBlur={() => {
              // 打開選單沒換職業就離開：丟掉剛才記下的字，免得之後用鍵盤換職業時拿到舊數字
              typedOnOpen.current = null;
            }}
            onChange={event => {
              // 輸入框裡被擋下的等級換職業時重新驗（跟首頁角色列同一套），輸入框跟著實際等級走
              const typed = Number((typedOnOpen.current ?? levelText).replace(/[^0-9]/g, ""));
              typedOnOpen.current = null;
              const { next, note, raisedFrom: memory } = pickJobKeepingLevel(
                profile,
                Number(event.target.value),
                typed > 0 ? Math.min(LEVEL_CAP, typed) : undefined,
                raisedFrom.current,
              );
              raisedFrom.current = memory;
              setHint(note);
              setLevelText(next.level ? String(next.level) : "");
              onChange(next);
            }}
            className="tap-safe w-full rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3 py-2.5 text-base outline-none transition-colors focus:border-[color:var(--maple)]"
            aria-label="你的職業"
          >
            <option value={-1} disabled>選職業</option>
            <option value={0}>初心者／還沒轉職</option>
            {JOB_LINES.map(line => (
              <optgroup key={line.base} label={`${line.line}系`}>
                <option value={line.base}>{line.line}（還沒二轉）</option>
                {line.branches.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
                {line.thirds.map(([id, name]) => (
                  <option key={id} value={id}>{name}（三轉）</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      {hint ? <p role="status" className="mt-2 text-[12px] font-bold text-[color:var(--maple)]">{hint}</p> : null}
    </div>
  );
}
