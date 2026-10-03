"use client";

import { useEffect, useState } from "react";
import { JOB_LINES, normalizeJob } from "@/lib/jobs";
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

  useEffect(() => {
    setLevelText(profile.level ? String(profile.level) : "");
  }, [profile.level]);

  function commitLevel(raw: string) {
    const value = Number(raw.replace(/[^0-9]/g, ""));
    const level = Number.isFinite(value) ? Math.max(0, Math.min(LEVEL_CAP, value)) : 0;
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
            placeholder={`1–${LEVEL_CAP}`}
            onChange={event => {
              setLevelText(event.target.value);
              commitLevel(event.target.value);
            }}
            className="tap-safe w-full rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3.5 py-2.5 text-lg font-bold tabular-nums outline-none transition-colors focus:border-[color:var(--maple)]"
            aria-label="你的等級"
          />
        </label>

        <label className="flex-[2]">
          <span className="mb-1.5 block text-sm font-bold">
            你的職業
            <span className="ml-1.5 text-xs font-normal ink-faint">目前開放到二轉</span>
          </span>
          <select
            value={normalizeJob(profile.job)}
            onChange={event => onChange({ ...profile, job: Number(event.target.value) })}
            className="tap-safe w-full rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3 py-2.5 text-base outline-none transition-colors focus:border-[color:var(--maple)]"
            aria-label="你的職業"
          >
            <option value={0}>初心者／還沒轉職</option>
            {JOB_LINES.map(line => (
              <optgroup key={line.base} label={`${line.line}系`}>
                <option value={line.base}>{line.line}（還沒二轉）</option>
                {line.branches.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
