import { describe, expect, it } from "vitest";
import { mapRoute } from "@/lib/atlas-view";
import { coveredBlocks, questLevel, questSteps, stepText, type QuestStepContext } from "@/lib/quest-steps";
import type { Item, MapRecord, Monster, PortalEdge, Quest } from "@/lib/types";

// 假資料：1 城鎮 → 2 → 3 → (傑夫，50 等) → 4；5 是沒中文名的圖；6 是另一個城鎮旁的圖
const maps = {
  "1": { zh: "弓箭手村", st: "", t: 1 },
  "2": { zh: "東邊森林", st: "" },
  "3": { zh: "冰雪峽谷Ⅱ", st: "" },
  "4": { zh: "尖銳的絕壁Ⅰ", st: "", g: 50 },
  "5": { zh: "", st: "" },
  "6": { zh: "西邊森林", st: "" },
} as unknown as Record<string, MapRecord>;
const graph: Record<string, PortalEdge[]> = {
  "1": [[2, "東邊", 0, 0], [6, "西邊", 0, 0]],
  "2": [[3, "上面", 0, 0]],
  "3": [[4, "npc:傑夫:最上面", 0, 0, 50]],
};
const nearestTown = { "2": [1, 0], "3": [1, 0], "4": [1, 0], "6": [1, 0] } as Record<string, [number, number]>;

const monsters: Record<number, Pick<Monster, "n" | "lv" | "sp" | "maps">> = {
  100: { n: "白狼", lv: 55, sp: [[4, 9, 0], [3, 4, 0], [5, 20, 0]], maps: [4, 3, 5] },
  101: { n: "木妖", lv: 10, sp: [[2, 6, 0]], maps: [2] },
  102: { n: "火獨眼獸", lv: 33, sp: [[6, 5, 0]], maps: [6] },
};
const items: Record<number, Pick<Item, "dm" | "sp" | "qr">> = {
  4000007: { dm: [102, 999] },
  4000001: { sp: [{ p: "弓箭手村雜貨店", pr: 100, o: 1 }] },
  4000002: { qr: ["900", "2207"] },
  4000003: {},
};

const ctx: QuestStepContext = {
  graph,
  maps,
  nearestTown,
  monster: id => monsters[id],
  item: id => items[id],
  questName: id => (id === "900" ? "別的任務" : undefined),
  mapHref: id => `/db/maps/${id}`,
  npcHref: id => (id === 7 ? undefined : `/db/npcs/${id}`),
  monsterHref: id => (monsters[id] ? `/db/monsters/${id}` : undefined),
  itemHref: id => (id === 4000007 ? `/db/items/${id}` : undefined),
};

const quest = (fields: Partial<Quest>): Quest => ({ id: "2207", n: "測試任務", cat: "維多利亞島", ...fields });

describe("questSteps", () => {
  it("缺資料的步驟不寫：只有接任務的人、沒有地圖", () => {
    const steps = questSteps(quest({ sNpc: { id: 1, n: "巴勒圖" } }), ctx);
    expect(steps.map(step => step.kind)).toEqual(["start"]);
    // 沒有圖名就不寫「到…」，也不會變成「找的巴勒圖」
    expect(stepText(steps[0])).toEqual(["找巴勒圖接任務。"]);
  });

  it("什麼都沒有就沒有步驟", () => {
    expect(questSteps(quest({}), ctx)).toEqual([]);
  });

  it("去哪接：圖名、等級、從最近城鎮的路線", () => {
    const [start] = questSteps(quest({ minLv: 25, sNpc: { id: 1, n: "巴勒圖", map: 6, mapName: "西邊森林" } }), ctx);
    expect(stepText(start)).toEqual(["到西邊森林找巴勒圖接任務（Lv.25 以上可接）。", "怎麼去：從弓箭手村出發，西邊森林。"]);
    expect(start.lines[0]).toContainEqual({ t: "西邊森林", href: "/db/maps/6" });
    expect(start.lines[0]).toContainEqual({ t: "巴勒圖", href: "/db/npcs/1" });
  });

  it("NPC 在城鎮裡：不寫路線，改給「帶我去」", () => {
    const [start] = questSteps(quest({ sNpc: { id: 1, n: "楓之谷GM", map: 1, mapName: "弓箭手村" } }), ctx);
    expect(stepText(start)).toEqual(["到弓箭手村找楓之谷GM接任務。"]);
    expect(start.go).toBe("/go?to=1");
  });

  it("有路線、不是城鎮、沒圖都不給「帶我去」", () => {
    expect(questSteps(quest({ sNpc: { id: 1, n: "某人", map: 6, mapName: "西邊森林" } }), ctx)[0].go).toBeUndefined();
    expect(questSteps(quest({ sNpc: { id: 1, n: "某人", map: 3, mapName: "冰雪峽谷Ⅱ" } }), { ...ctx, nearestTown: {} })[0].go).toBeUndefined();
    expect(questSteps(quest({ sNpc: { id: 1, n: "某人" } }), ctx)[0].go).toBeUndefined();
  });

  it("回報的人在另一個城鎮：回報那步也給「帶我去」", () => {
    const withTown = { ...maps, "9": { zh: "勇士之村", st: "", t: 1 } } as unknown as Record<string, MapRecord>;
    const steps = questSteps(
      quest({ sNpc: { id: 1, n: "甲", map: 6, mapName: "西邊森林" }, eNpc: { id: 2, n: "乙", map: 9, mapName: "勇士之村" } }),
      { ...ctx, maps: withTown },
    );
    expect(steps.find(step => step.kind === "return")?.go).toBe("/go?to=9");
  });

  it("coveredBlocks：步驟寫過的卡片區塊才藏", () => {
    const npc = { id: 1, n: "奈洛", map: 6, mapName: "西邊森林" };
    const full = quest({ sNpc: npc, eNpc: npc, needMobs: [{ id: 101, n: "木妖", c: 5 }], needItems: [{ id: 4000003, n: "道具" }], money: -100, exp: 5 });
    expect(coveredBlocks(full, questSteps(full, ctx))).toEqual({ mobs: true, needItems: true, rewards: true });
    // 只付楓幣、沒有回報 NPC：步驟沒寫到要付錢，卡片照列
    const payOnly = quest({ money: -100 });
    expect(coveredBlocks(payOnly, questSteps(payOnly, ctx))).toEqual({ mobs: false, needItems: false, rewards: false });
  });

  it("接、回報不同 NPC：寫回去交給誰，在別張圖補路線", () => {
    const steps = questSteps(
      quest({
        minLv: 25,
        sNpc: { id: 1, n: "巴勒圖", map: 6, mapName: "西邊森林" },
        eNpc: { id: 7, n: "瞌睡蟲", map: 2, mapName: "東邊森林" },
        needItems: [{ id: 4000007, n: "火獨眼獸之尾巴", c: 10 }],
        exp: 6000,
      }),
      ctx,
    );
    expect(steps.map(step => step.kind)).toEqual(["start", "items", "return", "reward"]);
    // 掉的怪後面寫刷怪點最多的圖；不存在的怪（999）不列
    expect(stepText(steps[1])).toEqual(["火獨眼獸之尾巴 10 個：火獨眼獸（西邊森林）會掉。"]);
    expect(steps[1].lines[0][0]).toEqual({ t: "火獨眼獸之尾巴", href: "/db/items/4000007" });
    expect(stepText(steps[2])).toEqual(["到東邊森林找瞌睡蟲交任務（不是接任務的巴勒圖）。", "怎麼去：從弓箭手村出發，東邊森林。"]);
    // 沒有 NPC 頁的名字是純文字
    expect(steps[2].lines[0]).toContain("瞌睡蟲");
    expect(stepText(steps[3])).toEqual(["經驗 6,000。"]);
  });

  it("接、回報同一個人：中間有事要做才寫回去", () => {
    const npc = { id: 1, n: "達利額", map: 6, mapName: "西邊森林" };
    expect(questSteps(quest({ sNpc: npc, eNpc: npc, rewardItems: [{ id: 1, n: "勳章", c: 1 }] }), ctx).map(step => step.kind)).toEqual(["start", "reward"]);
    const steps = questSteps(quest({ sNpc: npc, eNpc: npc, needMobs: [{ id: 101, n: "木妖", c: 5 }] }), ctx);
    expect(stepText(steps.find(step => step.kind === "return")!)).toEqual(["做完回去找達利額交任務。"]);
  });

  it("道具來源：舊版店標示、別的任務給（不列自己）、查不到來源只寫名字", () => {
    const steps = questSteps(
      quest({
        needItems: [
          { id: 4000001, n: "藍色蝸牛殼", c: 3 },
          { id: 4000002, n: "信", c: 1 },
          { id: 4000003, n: "神秘道具" },
          { id: 5000000, n: "資料裡沒有" },
        ],
      }),
      ctx,
    );
    expect(stepText(steps[0])).toEqual([
      "藍色蝸牛殼 3 個：弓箭手村雜貨店買得到（參考舊版資料）。",
      "信 1 個：任務「別的任務」會給。",
      "神秘道具。",
      "資料裡沒有。",
    ]);
  });

  it("掉道具的怪任務本來就要打：不再重複寫圖", () => {
    const steps = questSteps(quest({ needMobs: [{ id: 102, n: "火獨眼獸", c: 5 }], needItems: [{ id: 4000007, n: "尾巴", c: 1 }] }), ctx);
    expect(stepText(steps[1])).toEqual(["尾巴 1 個：火獨眼獸會掉。"]);
  });

  it("要付楓幣寫在回報那一步", () => {
    const npc = { id: 1, n: "奈洛", map: 6, mapName: "西邊森林" };
    const steps = questSteps(quest({ sNpc: npc, eNpc: npc, money: -5000 }), ctx);
    expect(stepText(steps.find(step => step.kind === "return")!)).toEqual(["做完回去找奈洛交任務。", "交任務時要付 5,000 楓幣。"]);
    expect(steps.some(step => step.kind === "reward")).toBe(false);
  });

  it("獎勵：固定、隨機分開寫，技能名照寫", () => {
    const steps = questSteps(
      quest({
        exp: 300,
        money: 1000,
        rewardItems: [{ id: 4000007, n: "尾巴", c: 2 }, { id: 2, n: "藥水", c: 1, rand: 1 }, { id: 3, n: "劍", c: 1, rand: 1, job: 100 }],
        rewardSkillNames: ["神匠之魂"],
      }),
      ctx,
    );
    expect(stepText(steps[0])).toEqual(["經驗 300 · 楓幣 1,000。", "道具：尾巴 ×2。", "從這幾樣隨機給一樣：藥水、劍（職業限定）。", "學會技能：神匠之魂。"]);
  });
});

describe("傑夫門檻", () => {
  const sNpc = { id: 1, n: "某人", map: 4, mapName: "尖銳的絕壁Ⅰ" };

  it("沒寫等級當 1 等", () => {
    expect(questLevel({})).toBe(1);
    expect(questLevel({ minLv: 52 })).toBe(52);
  });

  it("49 等以下不推傑夫後面的路線", () => {
    const [start] = questSteps(quest({ minLv: 49, sNpc }), ctx);
    expect(stepText(start)).toEqual(["到尖銳的絕壁Ⅰ找某人接任務（Lv.49 以上可接）。"]);
    expect(stepText(questSteps(quest({ sNpc }), ctx)[0])).toEqual(["到尖銳的絕壁Ⅰ找某人接任務。"]);
  });

  it("50 等以上照走，補參考舊版資料", () => {
    const [start] = questSteps(quest({ minLv: 50, sNpc }), ctx);
    expect(stepText(start)[1]).toBe(
      "怎麼去：從弓箭手村出發，東邊森林 → 冰雪峽谷Ⅱ → 找傑夫（Lv.50 以上） → 尖銳的絕壁Ⅰ。（傑夫只讓 50 等以上的人進去，參考舊版資料）",
    );
  });

  it("打怪：49 等以下不列傑夫後面的圖，沒中文名的圖也不列", () => {
    const low = questSteps(quest({ minLv: 40, needMobs: [{ id: 100, n: "白狼", c: 20 }] }), ctx);
    expect(stepText(low[0])).toEqual(["白狼 20 隻：去冰雪峽谷Ⅱ。"]);
    const high = questSteps(quest({ minLv: 55, needMobs: [{ id: 100, n: "白狼", c: 20 }] }), ctx);
    expect(stepText(high[0])).toEqual(["白狼 20 隻：最多的圖是尖銳的絕壁Ⅰ，其次冰雪峽谷Ⅱ。"]);
  });

  it("自己也算城鎮、回城點是別的城鎮：從回城點出發", () => {
    const withSub = { ...maps, "8": { zh: "中央走廊", st: "", t: 1, ret: 1 } } as unknown as Record<string, MapRecord>;
    const g = { ...graph, "6": [[8, "門", 0, 0]] } as Record<string, PortalEdge[]>;
    expect(mapRoute(8, g, withSub, { "8": [8, 0] })?.text).toBe("怎麼去：從弓箭手村出發，西邊森林 → 中央走廊。");
  });

  it("mapRoute 給等級就擋、不給照走", () => {
    expect(mapRoute(4, graph, maps, nearestTown, 49)).toBeNull();
    expect(mapRoute(4, graph, maps, nearestTown)?.gate).toEqual({ npc: "傑夫", minLevel: 50 });
    expect(mapRoute(2, graph, maps, nearestTown, 1)).toEqual({ text: "怎麼去：從弓箭手村出發，東邊森林。", town: 1, steps: 1 });
  });
});
