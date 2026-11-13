/**
 * 職業配點文章的產生器（v2.27）：照首頁升級路線那套主流點法（mainBuild），換算成「第幾等點到幾級」。
 * 三轉點法只有舊版資料的照出、標「參考舊版資料」（11/13 使用者拍板 A）。
 */
import { describe, expect, it } from "vitest";
import { BUILD_LINES, buildRows, skillBuildMarkdown } from "@/lib/guide-gen/skill-build";
import { availableSp, mainBuild } from "@/lib/skill-plan";
import { staticGuide, staticSkills } from "@/lib/static-data";

const guideOf = (job: number) => staticGuide(job);
const skillIds = new Set(staticSkills().map(skill => skill.id));
const skillHref = (id: number) => (skillIds.has(id) ? `/db/skills/${id}` : undefined);

describe("skillBuildMarkdown", () => {
  it("12 條二轉職業線", () => {
    expect(BUILD_LINES).toEqual([110, 120, 130, 210, 220, 230, 310, 320, 410, 420, 510, 520]);
  });

  it("每條線一轉、二轉、三轉都產得出表格", () => {
    for (const job of BUILD_LINES) {
      const md = skillBuildMarkdown(job, guideOf, skillHref);
      for (const key of ["first", "second", "third"] as const) expect(md[key], `${job} ${key}`).toMatch(/^\| \d+ 等 \|/m);
    }
  });

  it("槍騎兵二轉照 mainBuild 那套：第一列是精準之槍", () => {
    const build = mainBuild(staticGuide(130).builds, "槍騎兵")!;
    expect(build.steps[0].name).toBe("精準之槍");
    const rows = buildRows(130, build, guideOf, "槍騎兵");
    expect(rows[0].name).toBe("精準之槍");
  });

  it("每一列用掉的點數不超過那個等級拿得到的技能點", () => {
    for (const line of BUILD_LINES) {
      for (const job of [line - (line % 100), line, line + 1]) {
        const prefer = staticGuide(line).name;
        const build = mainBuild(staticGuide(job).builds, prefer)!;
        for (const row of buildRows(job, build, guideOf, prefer)) {
          if (row.level === null) continue;
          expect(row.end, `${job} ${row.name} ${row.level} 等`).toBeLessThanOrEqual(availableSp(job, row.level));
        }
      }
    }
  });

  it("三轉主流點法是舊版的，表上標「參考舊版資料」；有台服資料的不標", () => {
    for (const line of BUILD_LINES) {
      const third = skillBuildMarkdown(line, guideOf, skillHref).third;
      const legacy = mainBuild(staticGuide(line + 1).builds, staticGuide(line).name)!.v === "legacy";
      expect(third.includes("{{src:legacy}}"), String(line + 1)).toBe(legacy);
    }
    expect(skillBuildMarkdown(130, guideOf, skillHref).third).toContain("{{src:legacy}}");
  });

  it("技能連結只連查得到的技能", () => {
    for (const line of BUILD_LINES) {
      const text = Object.values(skillBuildMarkdown(line, guideOf, skillHref)).join("\n");
      for (const [, id] of text.matchAll(/\/db\/skills\/(\d+)/g)) expect(skillIds.has(Number(id)), id).toBe(true);
    }
  });

  it("others 每行名字不重複，跟主推同名的分得出來（槍騎兵三套都叫雙修）", () => {
    const names = skillBuildMarkdown(130, guideOf, skillHref).others.split("\n").map(line => line.split("：")[0]);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every(name => name !== "- 槍騎兵・雙修")).toBe(true);
    // 出處（玩家暱稱、網站）不進文章
    expect(names.some(name => /[（(]/.test(name))).toBe(false);
  });

  it("others 列同一轉的其他主流點法（槍騎兵二轉有 3 套主流）", () => {
    expect(skillBuildMarkdown(130, guideOf, skillHref).others.split("\n").filter(line => line.startsWith("- ")).length).toBeGreaterThanOrEqual(2);
  });
});
