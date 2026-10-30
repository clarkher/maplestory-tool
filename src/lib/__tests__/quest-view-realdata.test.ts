/**
 * 真資料常駐檢查：直接讀 public/data，確認任務頁清單「沒寫需求等級的任務」真的推得出建議等級
 * （跟首頁同一套 effectiveLevels），不會整批掉到「推不出來」排最後。跟著 npm test 一起跑。
 *
 * 用法：npx vitest run src/lib/__tests__/quest-view-realdata.test.ts
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { effectiveLevels } from "@/lib/now-plan";
import { payText, rewardSummary } from "@/lib/format";
import { listLevel } from "@/lib/quest-view";
import type { GuideCommon, Monster, Quest } from "@/lib/types";

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const read = <T,>(name: string): T => JSON.parse(fs.readFileSync(`${DATA}${name}`, "utf8")) as T;

const quests = read<Quest[]>("quests.json");
const effective = effectiveLevels(quests, read<Monster[]>("monsters.json"), read<GuideCommon>("guides/common.json"));

describe("真資料：任務清單的建議等級", () => {
  it("沒寫需求等級的任務裡，推得出建議等級的至少 50 個", () => {
    const withoutMinLv = quests.filter(quest => !quest.minLv);
    const suggested = withoutMinLv.filter(quest => listLevel(quest, effective)?.suggested);
    expect(withoutMinLv.length).toBeGreaterThan(0);
    expect(suggested.length).toBeGreaterThanOrEqual(50);
  });

  it("「調查木妖」沒寫需求等級，建議等級是 35（承接前置任務「謠言的真相」的 Lv.35）", () => {
    const quest = quests.find(row => row.n === "調查木妖");
    expect(quest?.n).toBe("調查木妖");
    expect(quest?.minLv).toBeUndefined();
    expect(listLevel(quest!, effective)).toEqual({ level: 35, suggested: true });
  });
});

describe("真資料：任務卡的楓幣、獎勵技能、接取道具（v1.15）", () => {
  const byId = (id: string) => {
    const quest = quests.find(row => row.id === id);
    if (!quest) throw new Error(`quests.json 沒有任務 ${id}`);
    return quest;
  };

  it("楓幣是負的任務，獎勵那行不寫楓幣、要交的東西寫要付多少", () => {
    const nero = byId("3046");
    expect(rewardSummary(nero.exp, nero.money, nero.pop)).not.toContain("楓幣");
    expect(payText(nero.money, Boolean(nero.needItems?.length))).toBe("另外要付 10,000 楓幣");
    const paper = byId("2215");
    expect(payText(paper.money, Boolean(paper.needItems?.length))).toBe("要付 2,000 楓幣");
    for (const quest of quests.filter(row => (row.money ?? 0) < 0)) {
      expect(rewardSummary(quest.exp, quest.money, quest.pop), quest.n).not.toContain("楓幣");
    }
  });

  it("流浪煉金術師的新技術寫學會神匠之魂（三個編號只有冒險家那個）", () => {
    expect(byId("6000").rewardSkillNames).toEqual(["神匠之魂"]);
  });

  it("瑪亞愛情象徵、尋找皺摺的紙片：那件道具是身上不能有，不是要有", () => {
    for (const [id, item] of [["1115", 4031683], ["2215", 4031894]] as const) {
      const quest = byId(id);
      expect(quest.startNone?.map(row => row.id), quest.n).toEqual([item]);
      expect(quest.startItems?.some(row => row.id === item) ?? false, quest.n).toBe(false);
    }
  });

  it("客戶端寫了數量的照舊是身上要有（戰劍的覺醒方法要帶舊戰劍）", () => {
    expect(byId("2048").startItems?.map(row => row.id)).toEqual([1302014]);
    expect(byId("2048").startNone).toBeUndefined();
  });
});
