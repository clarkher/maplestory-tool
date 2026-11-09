/**
 * 真資料（public/data）跑一遍「一步一步怎麼解」：句子不能缺字、49 等以下不能推傑夫。
 * QUEST_STEP_STATS=1 會印出每個任務幾步的分佈（回報用）。
 */
import { describe, expect, it } from "vitest";
import { questLevel, questSteps, stepText } from "@/lib/quest-steps";
import { staticQuests, staticQuestStepContext } from "@/lib/static-data";

describe("questSteps（真資料）", () => {
  const ctx = staticQuestStepContext();
  const all = staticQuests().map(quest => ({ quest, steps: questSteps(quest, ctx) }));

  it("每個有接任務 NPC 的任務都有「去哪接」", () => {
    const missing = all.filter(({ quest, steps }) => quest.sNpc && steps[0]?.kind !== "start").map(({ quest }) => quest.id);
    expect(missing).toEqual([]);
  });

  it("沒有缺字的句子（找的、到找、空連結）", () => {
    const bad = all.flatMap(({ quest, steps }) =>
      steps.flatMap(step => [
        ...stepText(step).filter(text => /找的|到找|在的|：。|、。|^。/.test(text)).map(text => `${quest.id} ${text}`),
        ...step.lines.flat().flatMap(seg => (typeof seg !== "string" && !seg.t.trim() ? [`${quest.id} 空連結 ${seg.href}`] : [])),
      ]),
    );
    expect(bad).toEqual([]);
  });

  it("49 等以下（含沒寫等級）的任務不出現傑夫路線", () => {
    const bad = all
      .filter(({ quest }) => questLevel(quest) < 50)
      .flatMap(({ quest, steps }) => steps.flatMap(stepText).filter(text => text.includes("找傑夫")).map(text => `${quest.id} ${text}`));
    expect(bad).toEqual([]);
  });

  it.runIf(process.env.QUEST_STEP_STATS)("統計", () => {
    const count = new Map<number, number>();
    const kinds = new Map<string, number>();
    for (const { steps } of all) {
      count.set(steps.length, (count.get(steps.length) ?? 0) + 1);
      for (const step of steps) kinds.set(step.kind, (kinds.get(step.kind) ?? 0) + 1);
    }
    const routes = all.filter(({ steps }) => steps[0]?.kind === "start" && steps[0].lines.length > 1).length;
    for (const id of (process.env.QUEST_STEP_STATS ?? "").split(",").filter(Boolean)) {
      const found = all.find(({ quest }) => quest.id === id);
      if (found) console.log(id, found.steps.map(step => `${step.title}｜${stepText(step).join(" / ")}`).join("\n"));
    }
    console.log(JSON.stringify({ quests: all.length, bySteps: Object.fromEntries([...count].sort((a, b) => a[0] - b[0])), kinds: Object.fromEntries(kinds), startWithRoute: routes }));
  });
});
