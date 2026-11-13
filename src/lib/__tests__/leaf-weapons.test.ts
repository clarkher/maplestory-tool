// 攻略文 maple-leaf-weapon-jobs 的每個數字都要跟傷害計算機重算的一樣：資料更新、公式改了這裡會紅，文章要跟著改
import fs from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { leafWeaponReport, ratioAt, ratioText, untilText, type LeafJob } from "../leaf-weapons";
import { staticCalcData } from "../static-data";

const article = fs.readFileSync("src/content/guides/maple-leaf-weapon-jobs.md", "utf8").replace(/\r\n?/g, "\n");

/** 「刺客（全幸）」→ 刺客、全幸；沒寫點法＝那職業的主推（盜賊是一般點法、法師是全智）或只有一套 */
const DEFAULT_TAB: Record<string, string> = { 刺客: "一般點法", 俠盜: "一般點法", 盜賊: "一般點法" };
const split = (name: string) => {
  const match = name.match(/^(.+?)(?:（(.+)）)?$/)!;
  return { base: match[1], tab: match[2] ?? DEFAULT_TAB[match[1]] ?? null };
};

/** 文章的職業名 → 職業代碼 */
const JOB_NAMES: Record<string, number[]> = {
  狂戰士: [110], 見習騎士: [120], 槍騎兵: [130], 法師: [210, 220, 230],
  獵人: [310], 弩弓手: [320], 刺客: [410], 俠盜: [420], 打手: [510], 槍手: [520],
};

/** 「每把武器強多少」各段 → 那段的職業 */
const SECTIONS: Record<string, number[]> = {
  劍士: [110, 120], 槍騎兵: [130], 法師: [210, 220, 230], 弓箭手: [310, 320], 盜賊: [410, 420], 海盜: [510, 520],
};
const SECTION_HEADINGS = ["劍士", "槍騎兵", "法師（全智）", "法師（裝備法）", "弓箭手", "盜賊（全幸）", "盜賊（一般點法）", "海盜"];

const rows = (text: string) =>
  text.split("\n").filter(line => line.startsWith("|") && !line.startsWith("|---")).slice(1)
    .map(line => line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim()));

let report: LeafJob[];
beforeAll(() => {
  report = leafWeaponReport(staticCalcData(), JSON.parse(fs.readFileSync("public/data/items.json", "utf8")));
}, 300000);

const jobOf = (job: number, tab: string | null) => report.find(entry => entry.job === job && entry.tab === tab);
const weaponOf = (job: number, tab: string | null, name: string) => jobOf(job, tab)?.weapons.find(row => row.name === name);

/** 同一段幾個職業算出來不一樣（火毒 8%、冰雷 7%）寫成「強 7～8%」 */
function cellText(ratios: number[]): string {
  const texts = [...new Set(ratios.map(ratioText))];
  if (texts.length === 1) return texts[0];
  const percents = ratios.map(ratio => Math.round((ratio - 1) * 100));
  const low = Math.min(...percents), high = Math.max(...percents);
  if (low <= 0) throw new Error(`同一格有強有差：${texts.join("、")}，文章要拆開寫`);
  return `強 ${low}～${high}%`;
}

describe("楓葉武器攻略文對答案", () => {
  it("結論表：每個職業換的那把、用到幾等", () => {
    const table = article.split("## 每個職業換哪把、用到幾等")[1].split("\n- ")[0];
    const found = rows(table);
    // 每個職業、每套點法都要有一列
    expect(found.length).toBe(report.length - 2 * 2);
    for (const [jobName, weaponName, until] of found) {
      const { base, tab } = split(jobName);
      for (const job of JOB_NAMES[base]) {
        const row = weaponOf(job, tab, weaponName);
        expect(row, `${jobName} 拿得到 ${weaponName}`).toBeTruthy();
        expect(untilText(row!.until), `${jobName} ${weaponName}`).toBe(until);
        // 換這把＝這職業的楓葉武器裡用最久的
        const best = Math.max(...jobOf(job, tab)!.weapons.map(other => other.until ?? 0));
        expect(row!.until, `${jobName} 沒有更久的楓葉武器`).toBe(best);
      }
    }
  });

  it("每段的強弱 %：43、50、60 等", () => {
    for (const section of SECTION_HEADINGS) {
      const { base, tab } = split(section);
      const jobs = SECTIONS[base];
      const body = article.split(`### ${section}\n`)[1].split("\n### ")[0].split("\n## ")[0];
      const found = rows(body.split("\n\n").map(part => part.trim()).find(part => part.startsWith("|"))!);
      expect(found.length, section).toBeGreaterThan(0);
      for (const [cell, ...texts] of found) {
        const weaponName = cell.replace(/!\[[^\]]*\]\([^)]*\)\s*/, "");
        const holders = jobs.map(job => weaponOf(job, tab, weaponName)).filter(row => row !== undefined);
        expect(holders.length, `${section} 有人拿得到 ${weaponName}`).toBeGreaterThan(0);
        expect([43, 50, 60].map(lv => cellText(holders.map(row => ratioAt(row, lv)!))), `${section} ${weaponName}`).toEqual(texts);
      }
    }
  });
});
