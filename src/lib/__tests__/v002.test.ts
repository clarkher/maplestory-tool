import { describe, expect, it } from "vitest";
import {
  isV002Item, isV002Map, isV002Monster, isV002Quest, isV002Skill, v002MonsterIds, v002QuestIds,
} from "@/lib/v002";
import type { MapRecord, Monster, Quest } from "@/lib/types";

const OPEN_A: MapRecord = { zh: "天空之城", st: "", o: "2026-10-15" };
const OPEN_B: MapRecord = { zh: "雲彩公園Ⅰ", st: "", o: "2026-10-15" };
const OLD: MapRecord = { zh: "弓箭手村", st: "" };

const MAPS: Record<string, MapRecord> = { "1": OPEN_A, "2": OPEN_B, "3": OLD };

describe("isV002Map：地圖是不是 V002 才開放（有開放日欄位 o）", () => {
  it("有開放日欄位：是", () => {
    expect(isV002Map(OPEN_A)).toBe(true);
  });

  it("沒有開放日欄位：不是", () => {
    expect(isV002Map(OLD)).toBe(false);
  });

  it("查無地圖（undefined）：不是", () => {
    expect(isV002Map(undefined)).toBe(false);
  });
});

describe("isV002Skill：adv 是三轉才算", () => {
  it("三轉：是", () => {
    expect(isV002Skill({ adv: "三轉" })).toBe(true);
  });

  it("二轉：不是", () => {
    expect(isV002Skill({ adv: "二轉" })).toBe(false);
  });

  it("零轉／一轉：不是", () => {
    expect(isV002Skill({ adv: "零轉" })).toBe(false);
    expect(isV002Skill({ adv: "一轉" })).toBe(false);
  });
});

describe("isV002Monster：要有出沒地圖、而且每一張出沒地圖都是 V002 地圖", () => {
  it("每張出沒地圖都是 V002：是", () => {
    expect(isV002Monster({ maps: [1, 2] }, MAPS)).toBe(true);
  });

  it("出沒地圖裡有一張不是 V002：不是", () => {
    expect(isV002Monster({ maps: [1, 3] }, MAPS)).toBe(false);
  });

  it("沒有出沒地圖（空陣列）：不是", () => {
    expect(isV002Monster({ maps: [] }, MAPS)).toBe(false);
  });

  it("出沒地圖查無資料：不是（當作不是 V002 地圖）", () => {
    expect(isV002Monster({ maps: [999] }, MAPS)).toBe(false);
  });
});

describe("isV002Quest：Lv.100 以上、接取 NPC 在 V002 地圖、或職業全是三轉代碼，三選一", () => {
  it("minLv 超過 100：是", () => {
    expect(isV002Quest({ minLv: 120 }, MAPS)).toBe(true);
  });

  it("minLv 剛好 100：不是（要「超過」100）", () => {
    expect(isV002Quest({ minLv: 100 }, MAPS)).toBe(false);
  });

  it("minLv 沒給：不是（當 0 處理，不算超過 100）", () => {
    expect(isV002Quest({}, MAPS)).toBe(false);
  });

  it("接取 NPC 站在 V002 地圖：是", () => {
    expect(isV002Quest({ sNpc: { id: 1, n: "x", map: 1 } }, MAPS)).toBe(true);
  });

  it("接取 NPC 站在舊地圖：不是", () => {
    expect(isV002Quest({ sNpc: { id: 1, n: "x", map: 3 } }, MAPS)).toBe(false);
  });

  it("接取 NPC 沒有地圖欄位：不是", () => {
    expect(isV002Quest({ sNpc: { id: 1, n: "x" } }, MAPS)).toBe(false);
  });

  it("可接職業全部是三轉代碼（111、121）：是", () => {
    expect(isV002Quest({ jobs: [111, 121] }, MAPS)).toBe(true);
  });

  it("可接職業混了二轉代碼（110）：不是", () => {
    expect(isV002Quest({ jobs: [111, 110] }, MAPS)).toBe(false);
  });

  it("可接職業是 [0]（初心者專屬）：不是", () => {
    expect(isV002Quest({ jobs: [0] }, MAPS)).toBe(false);
  });

  it("jobs 是空陣列：不是", () => {
    expect(isV002Quest({ jobs: [] }, MAPS)).toBe(false);
  });

  it("三個條件都不符合：不是", () => {
    expect(isV002Quest({ minLv: 50, sNpc: { id: 1, n: "x", map: 3 }, jobs: [110] }, MAPS)).toBe(false);
  });
});

describe("v002MonsterIds／v002QuestIds：整批算一次給道具判斷用", () => {
  const monsters: Monster[] = [
    { id: 10, n: "V002怪", lv: 70, exp: 1, hp: 1, pad: 0, pdd: 0, mad: 0, mdd: 0, acc: 0, eva: 0, spd: 0, maps: [1], drops: [] },
    { id: 11, n: "舊怪", lv: 50, exp: 1, hp: 1, pad: 0, pdd: 0, mad: 0, mdd: 0, acc: 0, eva: 0, spd: 0, maps: [3], drops: [] },
  ];
  const quests: Quest[] = [
    { id: "q1", n: "V002任務", cat: "測試", minLv: 120 },
    { id: "q2", n: "舊任務", cat: "測試", minLv: 10 },
  ];

  it("只收 V002 怪的 id", () => {
    expect(v002MonsterIds(monsters, MAPS)).toEqual(new Set([10]));
  });

  it("只收 V002 任務的 id", () => {
    expect(v002QuestIds(quests, MAPS)).toEqual(new Set(["q1"]));
  });
});

describe("isV002Item：來源只有「掉落的怪都是 V002 怪」或「給的任務都是 V002 任務」，且沒有商店賣", () => {
  const monsterIds = new Set([10]);
  const questIds = new Set(["q1"]);

  it("掉落的怪都是 V002 怪：是", () => {
    expect(isV002Item({ dm: [10] }, monsterIds, questIds)).toBe(true);
  });

  it("掉落的怪裡有一隻不是 V002：不是", () => {
    expect(isV002Item({ dm: [10, 11] }, monsterIds, questIds)).toBe(false);
  });

  it("給的任務都是 V002 任務：是", () => {
    expect(isV002Item({ qr: ["q1"] }, monsterIds, questIds)).toBe(true);
  });

  it("給的任務裡有一個不是 V002：不是", () => {
    expect(isV002Item({ qr: ["q1", "q2"] }, monsterIds, questIds)).toBe(false);
  });

  it("怪物來源跟任務來源都是 V002：是", () => {
    expect(isV002Item({ dm: [10], qr: ["q1"] }, monsterIds, questIds)).toBe(true);
  });

  it("有商店賣：不是，就算其他來源都是 V002", () => {
    expect(isV002Item({ dm: [10], sh: 1 }, monsterIds, questIds)).toBe(false);
  });

  it("沒有任何來源（也沒商店）：不是", () => {
    expect(isV002Item({}, monsterIds, questIds)).toBe(false);
  });
});
