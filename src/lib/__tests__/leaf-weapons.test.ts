// 攻略文 maple-leaf-weapon-jobs 的每個數字都要跟傷害計算機重算的一樣：資料更新、公式改了這裡會紅，文章要跟著改
import fs from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { leafWeaponReport, ratioAt, ratioText, untilText, type LeafJob } from "../leaf-weapons";
import { staticCalcData } from "../static-data";

const article = fs.readFileSync("src/content/guides/maple-leaf-weapon-jobs.md", "utf8").replace(/\r\n?/g, "\n");

/** 文章的職業名 → 職業代碼 */
const JOB_NAMES: Record<string, number[]> = {
  狂戰士: [110], 見習騎士: [120], 槍騎兵: [130], 法師三種: [210, 220, 230],
  獵人: [310], 弩弓手: [320], 刺客: [410], 俠盜: [420], 打手: [510], 槍手: [520],
};

/** 「每把武器強多少」各段 → 那段的職業 */
const SECTIONS: Record<string, number[]> = {
  劍士: [110, 120], 槍騎兵: [130], 法師: [210, 220, 230], 弓箭手: [310, 320], 盜賊: [410, 420], 海盜: [510, 520],
};

const rows = (text: string) =>
  text.split("\n").filter(line => line.startsWith("|") && !line.startsWith("|---")).slice(1)
    .map(line => line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim()));

let report: LeafJob[];
beforeAll(() => {
  report = leafWeaponReport(staticCalcData(), JSON.parse(fs.readFileSync("public/data/items.json", "utf8")));
}, 300000);

const weaponOf = (job: number, name: string) => report.find(entry => entry.job === job)?.weapons.find(row => row.name === name);

describe("楓葉武器攻略文對答案", () => {
  it("結論表：每個職業換的那把、用到幾等", () => {
    const table = article.split("## 每個職業換哪把、用到幾等")[1].split("\n- ")[0];
    const found = rows(table);
    expect(found.length).toBe(Object.keys(JOB_NAMES).length);
    for (const [jobName, weaponName, until] of found) {
      for (const job of JOB_NAMES[jobName]) {
        const row = weaponOf(job, weaponName);
        expect(row, `${jobName} 拿得到 ${weaponName}`).toBeTruthy();
        expect(untilText(row!.until), `${jobName} ${weaponName}`).toBe(until);
        // 換這把＝這職業的楓葉武器裡用最久的
        const best = Math.max(...report.find(entry => entry.job === job)!.weapons.map(other => other.until ?? 0));
        expect(row!.until, `${jobName} 沒有更久的楓葉武器`).toBe(best);
      }
    }
  });

  it("每段的強弱 %：43、50、60 等", () => {
    for (const [section, jobs] of Object.entries(SECTIONS)) {
      const body = article.split(`### ${section}\n`)[1].split("\n### ")[0].split("\n## ")[0];
      const found = rows(body.split("\n\n").map(part => part.trim()).find(part => part.startsWith("|"))!);
      expect(found.length, section).toBeGreaterThan(0);
      for (const [cell, ...texts] of found) {
        const weaponName = cell.replace(/!\[[^\]]*\]\([^)]*\)\s*/, "");
        const holders = jobs.map(job => weaponOf(job, weaponName)).filter(row => row);
        expect(holders.length, `${section} 有人拿得到 ${weaponName}`).toBeGreaterThan(0);
        for (const row of holders) {
          expect([43, 50, 60].map(lv => ratioText(ratioAt(row!, lv)!)), `${section} ${weaponName}`).toEqual(texts);
        }
      }
    }
  });
});
