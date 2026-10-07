import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { monsterSuitsJob, trainingRuleNote } from "@/lib/job-rules";
import { inTrainingBand, isDevQuest, questBucket, questEligible } from "@/lib/planner";
import type { Monster, Quest } from "@/lib/types";

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const quests = JSON.parse(fs.readFileSync(`${DATA}quests.json`, "utf8")) as Quest[];

const monster = (extra: Partial<Monster> = {}): Monster =>
  ({ id: 1, n: "怪", lv: 40, exp: 1, hp: 1, pad: 0, pdd: 0, mad: 0, mdd: 0, acc: 0, eva: 0, spd: 0, maps: [], drops: [], ...extra }) as Monster;

const quest = (extra: Partial<Quest> = {}): Quest =>
  ({ id: "1", n: "任務", cat: "主線", ...extra }) as Quest;

describe("怪物頁「只看適合我練的」：練功帶", () => {
  it("從你的等級到高你 5 級（Lv.35 → 35～40），跟練功推薦的甜蜜區同一條", () => {
    expect(inTrainingBand(35, 35)).toBe(true);
    expect(inTrainingBand(35, 40)).toBe(true);
    expect(inTrainingBand(35, 41)).toBe(false);
    expect(inTrainingBand(35, 34)).toBe(false);
  });
});

describe("怪物頁「只看適合我練的」：職業規則（跟練功推薦同一套）", () => {
  it("僧侶、祭司 31～70 等只列不死系；30 以下、71 以上不限", () => {
    expect(monsterSuitsJob(230, 40, monster({ und: 1 }))).toBe(true);
    expect(monsterSuitsJob(230, 40, monster())).toBe(false);
    expect(monsterSuitsJob(231, 70, monster())).toBe(false);
    expect(monsterSuitsJob(230, 30, monster())).toBe(true);
    expect(monsterSuitsJob(231, 71, monster())).toBe(true);
  });

  it("火毒不列抗火、火免疫的怪；冰雷不列抗冰、冰免疫的怪", () => {
    expect(monsterSuitsJob(210, 40, monster({ el: { f: "r" } }))).toBe(false);
    expect(monsterSuitsJob(211, 80, monster({ el: { f: "i" } }))).toBe(false);
    expect(monsterSuitsJob(210, 40, monster({ el: { f: "w" } }))).toBe(true);
    expect(monsterSuitsJob(220, 40, monster({ el: { i: "r" } }))).toBe(false);
    expect(monsterSuitsJob(220, 40, monster({ el: { f: "r" } }))).toBe(true);
  });

  it("其他職業、還沒選職業不加規則", () => {
    expect(monsterSuitsJob(110, 45, monster({ el: { f: "r" } }))).toBe(true);
    expect(monsterSuitsJob(-1, 45, monster())).toBe(true);
  });

  it("有規則的寫原因（篩選旁邊顯示），沒有的回 null", () => {
    expect(trainingRuleNote(230, 40)).toBe("只列不死系：群體治癒補得到");
    expect(trainingRuleNote(210, 40)).toBe("不列抗火的怪：火焰箭傷害打折");
    expect(trainingRuleNote(221, 80)).toBe("不列抗冰的怪：冰雷傷害打折");
    expect(trainingRuleNote(230, 75)).toBeNull();
    expect(trainingRuleNote(110, 40)).toBeNull();
  });
});

describe("任務頁「只看我現在接得到的」（沿用首頁的判斷）", () => {
  it("等級在範圍內、職業對得上才算；前置任務做了沒網站不知道，不判斷", () => {
    expect(questEligible(quest({ minLv: 30 }), { job: 130, level: 35 })).toBe(true);
    expect(questEligible(quest({ minLv: 40 }), { job: 130, level: 35 })).toBe(false);
    expect(questEligible(quest({ maxLv: 30 }), { job: 130, level: 35 })).toBe(false);
    expect(questEligible(quest({ jobs: [200] }), { job: 130, level: 35 })).toBe(false);
    expect(questEligible(quest({ jobs: [100] }), { job: 130, level: 35 })).toBe(true);
    expect(questEligible(quest({ pre: ["999"] }), { job: 130, level: 35 })).toBe(true);
  });
});

describe("開發測試用的任務哪裡都不列", () => {
  it("名字剛好是「開發測試用」的是開發測試任務；「白瑞德的測試」是正常任務", () => {
    expect(isDevQuest({ n: "開發測試用" })).toBe(true);
    expect(isDevQuest({ n: "白瑞德的測試" })).toBe(false);
  });

  it("名字只是帶「測試用」的正常任務不算（只認整個名字）", () => {
    expect(isDevQuest({ n: "測試用的鑰匙" })).toBe(false);
    expect(isDevQuest({ n: "開發測試用（２）" })).toBe(false);
  });

  it("接得到的判斷直接排除開發測試任務", () => {
    expect(questEligible({ id: "9999", n: "開發測試用", cat: "職業" } as Quest, { level: 35, job: 130 })).toBe(false);
  });

  it("真資料裡只有 9999 是開發測試任務", () => {
    expect(quests.filter(isDevQuest).map(item => item.id)).toEqual(["9999"]);
  });
});

describe("任務分段（首頁跟任務頁同一套）", () => {
  const profile = { level: 35, job: 130 };

  it("等級上限在 8 級內是快過期，levelsLeft＝上限－現在等級", () => {
    expect(questBucket(quest({ minLv: 30, maxLv: 40 }), profile)).toEqual({ bucket: "expiring", levelsLeft: 5 });
  });

  it("10 級內解鎖的是剛解鎖；其他是隨時可以補", () => {
    expect(questBucket(quest({ minLv: 30 }), profile).bucket).toBe("fresh");
    expect(questBucket(quest({ minLv: 20 }), profile).bucket).toBe("backlog");
    expect(questBucket(quest({}), profile).bucket).toBe("backlog");
  });
});
