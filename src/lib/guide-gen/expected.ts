/**
 * 一篇文章的產生區塊現在應該長怎樣（v2.28）：照網址分給系列任務、地區懶人包、職業配點的產生器。
 * 測試（guide-gen.test.ts）拿它跟檔案比，npm run guide:gen 拿它改寫檔案。只在建置／測試時跑（讀 public/data）。
 */
import fs from "node:fs";
import path from "node:path";
import { JOB_SLUGS } from "../job-article";
import { mustDoIndex } from "../route-planner";
import { staticGuide, staticGuideCommon, staticQuestStepContext, staticQuests, staticSkills } from "../static-data";
import { questLineMarkdown, questLines } from "./quest-lines";
import { REGIONS, regionMarkdown } from "./region-quests";
import { BUILD_LINES, skillBuildMarkdown } from "./skill-build";

export const GEN_PREFIXES = ["quest-line-", "quests-", "skill-build-"];

const GUIDE_DIR = path.join(process.cwd(), "src", "content", "guides");
const hasArticle = (slug: string) => fs.existsSync(path.join(GUIDE_DIR, `${slug}.md`));

export function expectedSections(slug: string): Record<string, string> | null {
  const quests = staticQuests();
  if (slug.startsWith("quest-line-")) {
    const line = questLines(quests).find(entry => `quest-line-${entry.id}` === slug);
    return line ? questLineMarkdown(line, staticQuestStepContext()) : null;
  }
  if (slug.startsWith("quests-")) {
    const region = REGIONS.find(entry => `quests-${entry.slug}` === slug);
    if (!region) return null;
    const lineHref = (id: string) => (hasArticle(`quest-line-${id}`) ? `/guides/quest-line-${id}` : undefined);
    return regionMarkdown(region, quests, questLines(quests), mustDoIndex(staticGuideCommon()), lineHref);
  }
  if (slug.startsWith("skill-build-")) {
    const line = BUILD_LINES.find(job => `skill-build-${JOB_SLUGS[job]}` === slug);
    if (!line) return null;
    const skills = new Set(staticSkills().map(skill => skill.id));
    return skillBuildMarkdown(line, job => staticGuide(job), id => (skills.has(id) ? `/db/skills/${id}` : undefined));
  }
  return null;
}
