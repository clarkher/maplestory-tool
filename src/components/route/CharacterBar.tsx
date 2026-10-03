"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { npcImage } from "@/lib/data";
import { JOB_LINES, advancementLevel, isSecondJob, jobOption } from "@/lib/jobs";
import { LEVEL_CAP } from "@/lib/profile";
import type { Profile } from "@/lib/types";
import { Sprite } from "./bits";

/**
 * 角色列：職業＋等級。升級了改這裡，整頁跟著換。
 * 第一次來（還沒填）直接展開選單，不另外做一個「開始」頁。
 */
export function CharacterBar({ profile, onChange }: { profile: Profile; onChange: (next: Profile) => void }) {
  const incomplete = profile.level <= 0;
  const [editing, setEditing] = useState(incomplete);
  const [levelText, setLevelText] = useState(profile.level ? String(profile.level) : "");

  useEffect(() => {
    setLevelText(profile.level ? String(profile.level) : "");
  }, [profile.level]);

  useEffect(() => {
    if (incomplete) setEditing(true);
  }, [incomplete]);

  const option = jobOption(profile.job);
  const stageText = profile.job === 0
    ? "還沒轉職"
    : profile.level > 0 && profile.level < advancementLevel(profile.job)
      ? `還沒轉職（${advancementLevel(profile.job)} 等可以轉${option?.line}）`
      : isSecondJob(profile.job) ? `${option?.line} · 二轉` : "一轉";

  function setLevel(raw: string) {
    setLevelText(raw);
    const value = Number(raw.replace(/[^0-9]/g, ""));
    if (Number.isFinite(value) && value > 0) onChange({ ...profile, level: Math.min(LEVEL_CAP, value) });
  }

  function step(delta: number) {
    const next = Math.max(1, Math.min(LEVEL_CAP, (profile.level || 0) + delta));
    onChange({ ...profile, level: next });
  }

  return (
    <section aria-label="你的角色" className="rounded-[var(--radius-card)] glass wood-frame p-3 sm:p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-14 shrink-0 place-items-end overflow-hidden rounded-2xl bg-[color:var(--paper-deep)]">
          {option ? (
            <Sprite src={npcImage(option.npcId)} size={56} alt={option.npcName} />
          ) : (
            <Image src="/brand-emblem.png" alt="" width={56} height={56} className="size-14" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold ink-faint">{incomplete ? "先選職業跟等級" : stageText}</span>
          <span className="block text-xl font-black leading-tight">
            {option?.name ?? "初心者"}
            {profile.level > 0 ? <span className="ml-1.5 tabular-nums text-[color:var(--maple)]">Lv.{profile.level}</span> : null}
          </span>
        </span>
        {!incomplete ? (
          <button
            type="button"
            onClick={() => setEditing(open => !open)}
            aria-expanded={editing}
            className="tap-safe shrink-0 rounded-full border border-[color:var(--paper-edge)] px-4 text-sm font-bold transition-colors hover:border-[color:var(--maple)]"
          >
            {editing ? "好了" : "改"}
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-3 space-y-3 border-t border-[color:var(--paper-edge)] pt-3">
          <div>
            <p className="mb-1.5 text-sm font-bold">
              等級 <span className="text-xs font-normal ink-faint">目前開放到 {LEVEL_CAP}</span>
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => step(-1)} className="tap-safe grid w-11 place-items-center rounded-xl border border-[color:var(--paper-edge)] text-lg font-black" aria-label="等級減一">−</button>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={levelText}
                placeholder={`1–${LEVEL_CAP}`}
                onChange={event => setLevel(event.target.value)}
                className="tap-safe w-24 rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3 text-center text-lg font-black tabular-nums outline-none focus:border-[color:var(--maple)]"
                aria-label="你的等級"
              />
              <button type="button" onClick={() => step(1)} className="tap-safe grid w-11 place-items-center rounded-xl border border-[color:var(--paper-edge)] text-lg font-black" aria-label="等級加一">+</button>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-bold">
              職業 <span className="text-xs font-normal ink-faint">還沒二轉就選第一個</span>
            </p>
            <div className="space-y-1.5">
              {JOB_LINES.map(line => (
                <div key={line.base} className="flex flex-wrap gap-1.5">
                  {[[line.base, line.line] as [number, string], ...line.branches].map(([id, name]) => {
                    const active = profile.job === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onChange({ ...profile, job: id })}
                        aria-pressed={active}
                        className={[
                          "rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors",
                          active
                            ? "bg-[color:var(--maple)] text-white"
                            : id === line.base
                              ? "border border-[color:var(--paper-edge)] bg-[color:var(--paper)]"
                              : "bg-[color:var(--paper-deep)]",
                        ].join(" ")}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              ))}
              <button
                type="button"
                onClick={() => onChange({ ...profile, job: 0 })}
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

          {!incomplete ? (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="tap-safe w-full rounded-full bg-[color:var(--maple)] text-sm font-bold text-white"
            >
              看我的路線
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
