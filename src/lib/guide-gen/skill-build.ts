/**
 * 職業配點文章的表格（v2.28）：一條二轉職業線一篇，一轉、二轉、三轉各一張「第幾等點到幾級」。
 * 點法跟首頁升級路線、算傷害同一套（mainBuild，有指定二轉職業名就挑提到它的那條），從上一轉點完的等級接著算（earlierJobLevels）。
 * 等級＝這一步的點數累計第一次拿得到的那一級（轉職當下 1 點、之後每級 3 點）；超過這一轉拿得到的點數的步驟不列。
 * 點法是舊版玩家整理的標「參考舊版資料」，其他標「站上計算」（點法來自玩家，第幾等是站上換算的）。
 */
import { jobTier, tierStartLevel } from "../jobs";
import { buildProgress, earlierJobLevels, lastLevelOfJob, mainBuild, spAtLevel, stepText } from "../skill-plan";
import type { GuideBuild, GuideJob } from "../types";

/** 12 條二轉職業線（三轉＝+1、一轉＝百位） */
export const BUILD_LINES = [110, 120, 130, 210, 220, 230, 310, 320, 410, 420, 510, 520];

const MAX_LEVEL = 200;

export type BuildRow = { id: number | null; name: string; text: string; to: number; note?: string; end: number; level: number | null };

/** 這一步第幾等點得到：這一轉的點數第一次 ≥ 累計用掉的點數；這一轉點不到就是 null */
function reachLevel(job: number, end: number): number | null {
  const last = jobTier(job) === 3 ? MAX_LEVEL : lastLevelOfJob(job);
  for (let level = tierStartLevel(job); level <= last; level++) if (spAtLevel(job, level) >= end) return level;
  return null;
}

export function buildRows(job: number, build: GuideBuild, guideOf: (job: number) => GuideJob | undefined, prefer?: string): BuildRow[] {
  const known = earlierJobLevels(job, guideOf, prefer);
  return buildProgress(build, 0, known)
    .steps.filter(step => step.cost > 0)
    .map(step => ({ id: step.id, name: step.name, text: stepText(step), to: step.to, note: step.note, end: step.end, level: reachLevel(job, step.end) }));
}

/** 「雙修（我流，板上玩家…）」→「雙修」：表上只放點法的名字，出處細節不進文章 */
const shortLabel = (label: string) => label.split(/[（(]/)[0].replace(/^(舊版主流點法|舊版|主流)[：:・]\s*/, "").trim() || label;
const cell = (text = "") => text.replace(/\|/g, "／").replace(/\n/g, " ");

function stageTable(job: number, build: GuideBuild, guideOf: (job: number) => GuideJob | undefined, prefer: string, skillHref: (id: number) => string | undefined): string {
  const rows = buildRows(job, build, guideOf, prefer).filter((row): row is BuildRow & { level: number } => row.level !== null);
  const source =
    build.v === "legacy"
      ? "這套點法是舊版玩家整理的，經典版的技能數值可能不一樣。 {{src:legacy}}"
      : "點法照玩家整理的主流點法，第幾等點得到是站上照技能點換算的。 {{src:calc}}";
  const body = rows.map(row => {
    const href = row.id === null ? undefined : skillHref(row.id);
    const what = row.id === null ? row.text : href ? `[${row.name}](${href})` : row.name;
    return `| ${row.level} 等 | ${what} | ${row.id === null ? "" : `${row.to} 級`} | ${cell(row.note)} |`;
  });
  return [`點法：**${shortLabel(build.label)}**。${source}`, "", "| 等級 | 點什麼 | 點到 | 說明 |", "|---|---|---|---|", ...body].join("\n");
}

export function skillBuildMarkdown(
  line: number,
  guideOf: (job: number) => GuideJob | undefined,
  skillHref: (id: number) => string | undefined,
): Record<"first" | "second" | "third" | "others", string> {
  const prefer = guideOf(line)!.name;
  const stages = { first: line - (line % 100), second: line, third: line + 1 } as const;
  const out = { first: "", second: "", third: "", others: "" };
  const others: string[] = [];
  for (const [key, job] of Object.entries(stages) as Array<[keyof typeof stages, number]>) {
    const guide = guideOf(job);
    const build = guide ? mainBuild(guide.builds, prefer) : undefined;
    if (!guide || !build) continue;
    out[key] = stageTable(job, build, guideOf, prefer, skillHref);
    for (const other of guide.builds.filter(entry => entry.main && entry !== build)) {
      // 短名字跟主推或前面一套撞名（槍騎兵三套都叫「雙修」）就寫第幾套；完整名字有玩家暱稱，不進文章
      const short = `${guide.name}・${shortLabel(other.label)}`;
      const same = (shortLabel(build.label) === shortLabel(other.label) ? 1 : 0) + others.filter(line => line.startsWith(`- ${short}`)).length;
      const label = same ? `${short} 第 ${same + 1} 套` : short;
      others.push(`- ${label}：${buildRows(job, other, guideOf, prefer).slice(0, 5).map(row => row.text).join("、")}…${other.v === "legacy" ? " {{src:legacy}}" : ""}`);
    }
  }
  out.others = others.join("\n");
  return out;
}
