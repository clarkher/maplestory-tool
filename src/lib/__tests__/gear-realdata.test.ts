/**
 * 真資料常駐檢查：直接讀 public/data/gear.json，確認 weaponPicks／equipRequirement 套在
 * 真實武器與主流規則上不會推薦穿不上的武器當 best（跟 v002-realdata.test.ts、
 * now-plan-realdata.test.ts 同一招：直接讀檔，不靠假資料）。
 *
 * targetsAt 照 GearCard.tsx 之後會用的方式組：equip 類型的規則才需要 equipRequirement。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { equipRequirement, rulesFor, statShortfall, statTargets, weaponPicks } from "@/lib/gear";
import type { GearData, StatRule } from "@/lib/gear";

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const gear = JSON.parse(fs.readFileSync(`${DATA}gear.json`, "utf8")) as GearData;

function mainstreamRule(job: number): StatRule {
  const { main } = rulesFor(gear.rules, job);
  if (!main) throw new Error(`沒有 ${job} 的主流規則，先跑 npm run data:guides 產生研究檔`);
  return main;
}

function targetsAtFor(job: number, rule: StatRule) {
  return (lv: number) => statTargets(rule, lv, rule.secondary?.type === "equip" ? equipRequirement(gear.weapons, job, lv, rule) : undefined);
}

describe("真資料：火毒巫師（210）Lv40 全點智力", () => {
  const rule = mainstreamRule(210);
  const targetsAt = targetsAtFor(210, rule);

  it("best 是黃色雨傘（不吃幸運，穿得上）；同等級的杖只多 3 點魔力卻要幸運 43，不值得列 stronger", () => {
    const result = weaponPicks(gear.weapons, 210, 40, { targetsAt });
    expect(result.best?.n).toBe("黃色雨傘");
    expect(result.stronger).toBeNull();
  });
});

describe("真資料：祭司（231）Lv75 三轉全點智力", () => {
  const rule = mainstreamRule(231);
  const targetsAt = targetsAtFor(231, rule);

  it("best 還是黃色雨傘；stronger 是最划算的杖（魔力高很多、差在幸運）", () => {
    const result = weaponPicks(gear.weapons, 231, 75, { targetsAt });
    expect(result.best?.n).toBe("黃色雨傘");
    expect(result.stronger?.s.endsWith("杖")).toBe(true);
    expect(result.stronger!.mag! - result.best!.mag!).toBeGreaterThanOrEqual(20);
    const shortfall = statShortfall(result.stronger!, targetsAt(75));
    expect(shortfall.map(s => s.stat)).toEqual(["LUK"]);
  });
});

describe("真資料：俠盜（420）Lv55 幸運為主、敏捷點到短刀需求", () => {
  const rule = mainstreamRule(420);
  const targetsAt = targetsAtFor(420, rule);

  it("best 沒有力量需求（這套點法力量只有 4）；華氏短劍只多 3 攻擊卻要力量 40，不列 stronger", () => {
    const result = weaponPicks(gear.weapons, 420, 55, { targetsAt });
    expect(result.best?.n).toBe("破碎刃");
    expect(result.best?.req?.STR ?? 0).toBeLessThanOrEqual(4);
    expect(result.stronger).toBeNull();
  });
});

describe("真資料：刺客（410）Lv35，10/15 前（beforeOpen）", () => {
  it("next 不是只有 V002 來源才拿得到的武器", () => {
    const result = weaponPicks(gear.weapons, 410, 35, { beforeOpen: true });
    expect(result.next).not.toBeNull();
    expect(result.next?.o).toBeUndefined();
  });
});
