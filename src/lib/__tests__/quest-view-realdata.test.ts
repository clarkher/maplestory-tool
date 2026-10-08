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
