import Link from "next/link";
import type { QuestStep, StepSeg } from "@/lib/quest-steps";

/**
 * 任務單獨頁「一步一步怎麼解」：伺服器畫好的有序清單（爬蟲讀得到），樣式跟 SeoSection 同一套。
 * 道具單獨頁只留 html，next/link 預先載入會 404，那種連結用一般 <a>（同 SeoLinks）。
 */
export function QuestSteps({ steps }: { steps: QuestStep[] }) {
  if (!steps.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold ink-faint">一步一步怎麼解</h2>
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li key={step.kind} className="flex gap-2.5 rounded-xl bg-[color:var(--paper-deep)] p-3 text-sm">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--maple)] text-xs font-black tabular-nums text-[color:var(--on-accent)]"
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1 break-words leading-relaxed">
              <h3 className="font-black">{step.title}</h3>
              {step.lines.map((line, lineIndex) => (
                <p key={lineIndex} className={lineIndex && line.length === 1 && typeof line[0] === "string" && line[0].startsWith("怎麼去") ? "ink-soft" : undefined}>
                  {line.map((seg, segIndex) => (
                    <Seg key={segIndex} seg={seg} />
                  ))}
                </p>
              ))}
              {step.go ? (
                // 跟 NPC 頁、地圖頁大標下面那顆「帶我去」同一個樣子、同一個網址
                <Link
                  href={step.go}
                  className="tap-safe inline-flex min-h-6 items-center rounded-md border border-[color:var(--paper-edge)] px-2.5 text-xs font-extrabold text-[color:var(--maple)] hover:border-[color:var(--maple)]"
                >
                  帶我去
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const linkClass = "font-bold underline decoration-[color:var(--ink-faint)] underline-offset-4 hover:text-[color:var(--maple)]";

function Seg({ seg }: { seg: StepSeg }) {
  if (typeof seg === "string") return seg;
  if (seg.href.startsWith("/db/items/")) {
    return (
      <a href={seg.href} className={linkClass}>
        {seg.t}
      </a>
    );
  }
  return (
    <Link href={seg.href} className={linkClass}>
      {seg.t}
    </Link>
  );
}
