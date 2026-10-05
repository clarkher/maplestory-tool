"use client";

import { useState } from "react";
import { ChevronDown } from "@/components/Icons";
import { skillImage } from "@/lib/data";
import { availableSp, buildProgress, mainBuild, type PlannedStep } from "@/lib/skill-plan";
import type { GuideBuild, GuideJob } from "@/lib/types";
import { SourceLinks, SourceTag, Sprite } from "./bits";

/**
 * 技能條：依等級算出現在有幾點，對照主流點法，只講「現在點哪個」。
 * 點開才看完整順序、其他點法、素質配點、注意事項。
 */
export function SkillStrip({ guide, job, level, prefer }: { guide: GuideJob; job: number; level: number; prefer?: string; leftover?: { t: string; s: string[] } }) {
  const [open, setOpen] = useState(false);
  const build = mainBuild(guide.builds, prefer);
  if (!build) return null;

  const sp = availableSp(job, level);
  const progress = buildProgress(build, sp);
  const current = progress.current;
  const next = progress.steps.find(step => step.state === "next");
  // 點完時顯示最後一步的技能圖，不留一個空白框
  const iconId = current?.id ?? [...progress.steps].reverse().find(step => step.id)?.id ?? null;

  return (
    <section aria-label="技能怎麼點" className="overflow-hidden rounded-[var(--radius-card)] wood-frame">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 bg-[color:var(--maple)] px-3 py-2.5 text-left text-white"
      >
        {iconId ? (
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/90">
            <Sprite src={skillImage(iconId)} size={28} />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 text-[14px] leading-snug">
          <span className="block text-[11px] font-bold opacity-85">
            {guide.name}・技能點這個（Lv.{level} 共 {sp} 點）
          </span>
          {current ? (
            <>
              <b className="text-[16px]">{current.name} 點到 {current.to}</b>
              {next ? <span className="opacity-90">，再來{next.name} {next.to}</span> : null}
            </>
          ) : (
            <b>主流點法 {progress.total} 點已經點完</b>
          )}
        </span>
        <ChevronDown size={18} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="space-y-4 glass-solid p-3.5">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-[14px] font-black">完整順序</h3>
              <SourceTag kind="guide" verified={build.v} />
            </div>
            <p className="mb-2 text-[12px] ink-soft">{build.label}</p>
            <ol className="space-y-1.5">
              {progress.steps.map((step, index) => (
                <StepRow key={index} step={step} />
              ))}
            </ol>
            <div className="mt-2">
              <SourceLinks urls={build.s} />
            </div>
          </div>

          {guide.builds.length > 1 ? (
            <div>
              <h3 className="mb-2 text-[14px] font-black">其他點法</h3>
              <ul className="space-y-2.5">
                {guide.builds.filter(other => other !== build).map(other => (
                  <OtherBuild key={other.label} build={other} />
                ))}
              </ul>
            </div>
          ) : null}

          {guide.stat.length ? (
            <div>
              <h3 className="mb-2 text-[14px] font-black">素質怎麼點</h3>
              <ul className="space-y-2">
                {guide.stat.map((entry, index) => (
                  <li key={index} className="space-y-1 rounded-xl bg-[color:var(--paper-deep)] p-2.5">
                    <p className="text-[13px] leading-relaxed">{entry.t}</p>
                    <SourceLinks urls={entry.s} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {guide.notes.length ? (
            <div>
              <h3 className="mb-2 text-[14px] font-black">玩家提醒</h3>
              <ul className="space-y-2">
                {guide.notes.map((note, index) => (
                  <li key={index} className="space-y-1 rounded-xl bg-[color:var(--gold-wash)] p-2.5">
                    <p className="text-[13px] leading-relaxed">{note.t}</p>
                    <SourceLinks urls={note.s} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const STATE_TEXT = { done: "點完", now: "現在", next: "下一個", later: "" } as const;

function StepRow({ step }: { step: PlannedStep }) {
  return (
    <li className={`flex items-center gap-2.5 ${step.state === "done" ? "opacity-55" : ""}`}>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[color:var(--paper-deep)]">
        {step.id ? <Sprite src={skillImage(step.id)} size={24} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold">
          {step.name}
          <span className="ml-1 tabular-nums">{step.from > 0 ? `${step.from} → ${step.to}` : `→ ${step.to}`}</span>
        </span>
        {step.note ? <span className="block text-[12px] ink-soft">{step.note}</span> : null}
      </span>
      {STATE_TEXT[step.state] ? (
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
            step.state === "now" ? "bg-[color:var(--maple)] text-white" : step.state === "next" ? "bg-[color:var(--paper-deep)]" : "ink-faint"
          }`}
        >
          {STATE_TEXT[step.state]}
        </span>
      ) : null}
    </li>
  );
}

function OtherBuild({ build }: { build: GuideBuild }) {
  return (
    <li className="space-y-1 rounded-xl bg-[color:var(--paper-deep)] p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-bold">{build.label}</p>
        <SourceTag kind="guide" verified={build.v} />
      </div>
      <p className="text-[13px] leading-relaxed ink-soft">{build.steps.map(step => `${step.name} ${step.to}`).join(" → ")}</p>
      <SourceLinks urls={build.s} />
    </li>
  );
}
