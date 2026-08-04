"use client";

import { useEffect, useMemo, useState } from "react";
import { loadJobs } from "@/lib/data";
import type { Job, Profile } from "@/lib/types";

/**
 * 等級與職業。
 * 職業名稱直接沿用遊戲技能書的名稱（例如「遊俠之路」），不自行改寫，
 * 因為那是資料裡唯一有中文的職業標示，硬翻成別的名字就是編造。
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
  const [jobs, setJobs] = useState<Job[]>([]);
  const [levelText, setLevelText] = useState(profile.level ? String(profile.level) : "");

  useEffect(() => {
    loadJobs().then(setJobs).catch(() => setJobs([]));
  }, []);

  useEffect(() => {
    setLevelText(profile.level ? String(profile.level) : "");
  }, [profile.level]);

  const groups = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const job of jobs) {
      // 管理員技能與活動技能不是玩家職業，不要出現在選單裡
      if (job.group.includes("管理") || job.group.includes("特殊")) continue;
      const list = map.get(job.group);
      if (list) list.push(job);
      else map.set(job.group, [job]);
    }
    return [...map.entries()];
  }, [jobs]);

  function commitLevel(raw: string) {
    const value = Number(raw.replace(/[^0-9]/g, ""));
    const level = Number.isFinite(value) ? Math.max(0, Math.min(200, value)) : 0;
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
          <span className="mb-1.5 block text-sm font-bold">你的等級</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={levelText}
            placeholder="例如 35"
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
            <span className="ml-1.5 text-xs font-normal ink-faint">選了才會過濾任務</span>
          </span>
          <select
            value={profile.job}
            onChange={event => onChange({ ...profile, job: Number(event.target.value) })}
            className="tap-safe w-full rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3 py-2.5 text-base outline-none transition-colors focus:border-[color:var(--maple)]"
            aria-label="你的職業"
          >
            <option value={0}>初心者／還沒轉職</option>
            {groups.map(([group, list]) => (
              <optgroup key={group} label={group}>
                {list.map(job => (
                  <option key={job.id} value={job.id}>
                    {job.name}（{job.adv}）
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
