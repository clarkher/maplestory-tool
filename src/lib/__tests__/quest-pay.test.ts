import { describe, expect, it } from "vitest";
import { payText, rewardSummary } from "@/lib/format";
import { planQuestBundles } from "@/lib/planner";
import type { Quest } from "@/lib/types";

// 任務的楓幣是負的＝交任務時要付（客戶端完成那段寫 money: -1000000），不是獎勵
describe("負的楓幣不是獎勵", () => {
  it("獎勵那行只寫正的楓幣：奈洛的禮物（經驗 7,500、楓幣 -10,000）只寫經驗", () => {
    expect(rewardSummary(7500, -10000)).toBe("經驗 7,500");
    expect(rewardSummary(undefined, -1000000)).toBe("");
    expect(rewardSummary(100, 500, 1)).toBe("經驗 100 · 楓幣 500 · 人氣 +1");
  });

  it("要付的寫在要交的東西底下：有道具寫「另外要付」（跟 /plan/buy 同一句），沒道具寫「要付」", () => {
    expect(payText(-10000, true)).toBe("另外要付 10,000 楓幣");
    expect(payText(-2000, false)).toBe("要付 2,000 楓幣");
  });

  it("不用付（正的、沒寫）回空字串", () => {
    expect(payText(500, true)).toBe("");
    expect(payText(undefined, false)).toBe("");
  });

  it("任務打包的總楓幣只加獎勵，不扣要付的", () => {
    const quest = (id: string, money: number): Quest => ({
      id, n: `任務${id}`, cat: "維多利亞島", minLv: 10, money, needItems: [{ id: 4000001, n: "菇菇寶貝傘", c: 10 }],
    });
    const bundles = planQuestBundles(
      { level: 30, job: 100 },
      [quest("a", 3000), quest("b", -10000)],
      { 4000001: [[100000, 5, [100100]]] },
      new Map(),
    );
    expect(bundles[0].quests.map(row => row.id).sort()).toEqual(["a", "b"]);
    expect(bundles[0].reward.money).toBe(3000);
  });
});
