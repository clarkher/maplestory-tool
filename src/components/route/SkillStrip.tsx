"use client";

import { useEffect } from "react";
import { ChevronDown } from "@/components/Icons";
import { skillImage } from "@/lib/data";
import { availableSp, buildProgress, isFreeStep, mainBuild, stepText, type PlannedStep } from "@/lib/skill-plan";
import type { GuideBuild, GuideJob } from "@/lib/types";
import { useVisitState } from "@/lib/visit-state";
import { SourceLinks, SourceTag, Sprite } from "./bits";

/**
 * 技能條：依等級算出現在有幾點，對照主流點法，只講「現在點哪個」。
 * 點開才看完整順序、其他點法、注意事項。能力值怎麼點改由下面的「能力值與裝備」卡給數字（GearCard）。
 */
export function SkillStrip({ guide, job, level, prefer, leftover }: {
  guide: GuideJob; job: number; level: number; prefer?: string; leftover?: { t: string; s: string[] } | null;
}) {
  // 展開記在這一筆瀏覽紀錄上（lib/visit-state）：重新整理、按返回時首頁一樣長，才捲得回同一段
  const [open, setOpen] = useVisitState("home:skill", false);
  const build = mainBuild(guide.builds, prefer);
  // 收合時就先把這條點法的技能圖載進快取，展開時不會一格一格冒出來
  useEffect(() => {
    for (const step of build?.steps ?? []) {
      if (step.id) new window.Image().src = skillImage(step.id);
    }
  }, [build]);
  if (!build) return null;

  const sp = availableSp(job, level);
  const progress = buildProgress(build, sp);
  const current = progress.current;
  const next = progress.steps.find(step => step.state === "next");
  // 點完時顯示最後一步的技能圖，不留一個空白框；現在這步沒有指定技能（自由分配）就不放圖
  const iconId = current ? current.id : [...progress.steps].reverse().find(step => step.id)?.id ?? null;

  return (
    <section aria-label="技能怎麼點" className="overflow-hidden rounded-[var(--radius-card)] wood-frame">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 bg-[color:var(--maple)] px-3 py-2.5 text-left text-[color:var(--on-accent)]"
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
              <b className="whitespace-nowrap text-[16px]">{isFreeStep(current) ? stepText(current) : `${current.name} 點到 ${current.to}`}</b>
              {/* 「再來致命毒霧 30」整塊不斷行，放不下就整塊換到下一行，「30」不會單獨一行；「，」跟著前一塊 */}
              {next ? <span className="opacity-90">，<span className="whitespace-nowrap">再來{stepText(next)}</span></span> : null}
            </>
          ) : (
            <b>主流點法 {progress.total} 點已經點完{sp > progress.total ? `，還剩 ${sp - progress.total} 點` : ""}</b>
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

          {progress.finished && sp > progress.total ? (
            <div className="space-y-1 rounded-xl bg-[color:var(--gold-wash)] p-2.5">
              <h3 className="text-[14px] font-black">剩下的 {sp - progress.total} 點</h3>
              {leftover !== null ? (
                <>
                  <p className="text-[13px] leading-relaxed">{leftover?.t ?? "攻略沒有定論。"}</p>
                  {leftover ? <SourceLinks urls={leftover.s} /> : null}
                </>
              ) : null}
            </div>
          ) : null}

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
      {/* 沒有指定技能的步驟（自由分配）不放圖，只留位置對齊 */}
      {isFreeStep(step) ? (
        <span aria-hidden className="size-8 shrink-0" />
      ) : (
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[color:var(--paper-deep)]">
          {step.id ? <Sprite src={skillImage(step.id)} size={24} /> : null}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold">
          {isFreeStep(step) ? (
            stepText(step)
          ) : (
            <>
              {step.name}
              <span className="ml-1 tabular-nums">{step.from > 0 ? `${step.from} → ${step.to}` : `→ ${step.to}`}</span>
            </>
          )}
        </span>
        {step.note ? <span className="block text-[12px] ink-soft">{step.note}</span> : null}
      </span>
      {STATE_TEXT[step.state] ? (
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
            step.state === "now" ? "bg-[color:var(--maple)] text-[color:var(--on-accent)]" : step.state === "next" ? "bg-[color:var(--paper-deep)]" : "ink-faint"
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
      <p className="text-[13px] leading-relaxed ink-soft">{buildProgress(build, 0).steps.map(stepText).join(" → ")}</p>
      <SourceLinks urls={build.s} />
    </li>
  );
}
