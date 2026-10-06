import { describe, expect, it } from "vitest";
import { canJobUse, equipGroups, jobFit } from "@/lib/item-view";
import type { Item } from "@/lib/types";

const spear: Item = {
  id: 1432011, n: "佛羅利刃", c: "裝備", s: "槍",
  eq: { reqLevel: 90, reqJob: 1, reqSTR: 280, incPAD: 97, tuc: 7 },
};
const sake: Item = {
  id: 1422011, n: "清酒", c: "裝備", s: "雙手棍",
  eq: { reqLevel: 30, reqJob: -1, reqSTR: 110, incPAD: 100 },
};
const medal: Item = { id: 1142094, n: "10日夢勳章", c: "裝備", s: "勳章", eq: { incSTR: 1, incACC: 1 } };
const fashionHat: Item = { id: 1000000, n: "時裝帽", c: "時裝", s: "帽子", eq: { incPDD: 1 } };
const potion: Item = { id: 2000000, n: "紅色藥水", c: "消耗", s: "藥水" };

// 職業代碼：0 初心者、130 槍騎兵（劍士系）、210 火毒巫師（法師系）、410 刺客（盜賊系）
describe("職業能不能用這件裝備", () => {
  it("沒有職業限制的誰都能用，初心者也行", () => {
    expect(canJobUse(undefined, 130)).toBe(true);
    expect(canJobUse(undefined, 0)).toBe(true);
    expect(canJobUse(0, 210)).toBe(true);
  });

  it("職業系對得上才能用：槍騎兵能用劍士（1）、劍士＋盜賊（9），不能用法師（2）", () => {
    expect(canJobUse(1, 130)).toBe(true);
    expect(canJobUse(9, 130)).toBe(true);
    expect(canJobUse(9, 410)).toBe(true);
    expect(canJobUse(2, 130)).toBe(false);
    expect(canJobUse(13, 210)).toBe(false);
  });

  it("-1 只有初心者能用；初心者不能用有職業限制的", () => {
    expect(canJobUse(-1, 0)).toBe(true);
    expect(canJobUse(-1, 130)).toBe(false);
    expect(canJobUse(1, 0)).toBe(false);
  });

  it("認不得的值回 null，不猜能不能用", () => {
    expect(canJobUse(32, 130)).toBeNull();
    expect(canJobUse(-2, 130)).toBeNull();
  });
});

describe("穿戴條件旁的小標籤（對照角色列的職業和等級）", () => {
  it("職業對、等級夠：藍色「槍騎兵能用」", () => {
    expect(jobFit(spear, { job: 130, level: 95 })).toEqual({ tone: "sky", text: "槍騎兵能用" });
    expect(jobFit(spear, { job: 130, level: 90 })).toEqual({ tone: "sky", text: "槍騎兵能用" });
  });

  it("職業對、等級不夠：金色「槍騎兵還差 55 級」", () => {
    expect(jobFit(spear, { job: 130, level: 35 })).toEqual({ tone: "gold", text: "槍騎兵還差 55 級" });
  });

  it("職業不對：紅色「火毒巫師不能用」，等級夠不夠都一樣", () => {
    expect(jobFit(spear, { job: 210, level: 95 })).toEqual({ tone: "maple", text: "火毒巫師不能用" });
    expect(jobFit(spear, { job: 210, level: 35 })).toEqual({ tone: "maple", text: "火毒巫師不能用" });
  });

  it("初心者專用武器：初心者看等級，其他職業不能用", () => {
    expect(jobFit(sake, { job: 0, level: 20 })).toEqual({ tone: "gold", text: "初心者還差 10 級" });
    expect(jobFit(sake, { job: 0, level: 30 })).toEqual({ tone: "sky", text: "初心者能用" });
    expect(jobFit(sake, { job: 130, level: 95 })).toEqual({ tone: "maple", text: "槍騎兵不能用" });
  });

  it("沒有職業和等級限制的裝備：誰都能用", () => {
    expect(jobFit(medal, { job: 410, level: 10 })).toEqual({ tone: "sky", text: "刺客能用" });
  });

  it("還沒選職業、沒填等級、不是裝備（藥水、時裝）、職業值認不得：都不顯示", () => {
    expect(jobFit(spear, { job: -1, level: 50 })).toBeNull();
    expect(jobFit(spear, { job: 130, level: 0 })).toBeNull();
    expect(jobFit(potion, { job: 130, level: 95 })).toBeNull();
    expect(jobFit(fashionHat, { job: 130, level: 95 })).toBeNull();
    expect(jobFit({ ...spear, eq: { ...spear.eq, reqJob: 32 } }, { job: 130, level: 95 })).toBeNull();
  });
});

describe("裝備數值拆成「穿戴條件」和「裝備數值」兩組", () => {
  it("需求等級、職業、力量放穿戴條件，其他放裝備數值", () => {
    expect(equipGroups(spear)).toEqual({
      requirements: [["需求等級", "90"], ["需求職業", "劍士"], ["需求力量", "280"]],
      stats: [["物理攻擊", "97"], ["可衝卷次數", "7"]],
    });
  });

  it("穿戴條件照固定順序排（等級、職業、力量…），不管資料裡的順序", () => {
    const shuffled: Item = { id: 1, n: "測試劍", c: "裝備", s: "單手劍", eq: { incPAD: 5, reqSTR: 20, reqJob: 1, reqLevel: 10 } };
    expect(equipGroups(shuffled)).toEqual({
      requirements: [["需求等級", "10"], ["需求職業", "劍士"], ["需求力量", "20"]],
      stats: [["物理攻擊", "5"]],
    });
  });

  it("裝備沒寫職業限制時補一格「不限職業」，排在需求等級後面", () => {
    expect(equipGroups(medal).requirements).toEqual([["需求職業", "不限職業"]]);
    const shield: Item = { id: 2, n: "測試盾", c: "裝備", s: "盾牌", eq: { reqLevel: 10, incPDD: 3 } };
    expect(equipGroups(shield).requirements).toEqual([["需求等級", "10"], ["需求職業", "不限職業"]]);
  });

  it("時裝不補「不限職業」；沒有數值的道具兩組都是空的", () => {
    expect(equipGroups(fashionHat)).toEqual({ requirements: [], stats: [["物理防禦", "1"]] });
    expect(equipGroups(potion)).toEqual({ requirements: [], stats: [] });
  });

  it("裝備欄位只留佔兩格的「雙手，不能配盾」，只佔一格的不給格子；攻擊速度寫成字", () => {
    const bow: Item = { id: 3, n: "測試弓", c: "裝備", s: "弓", eq: { reqLevel: 35, reqJob: 4, incPAD: 50, islot: "WpSi", attackSpeed: 5 } };
    expect(equipGroups(bow).stats).toEqual([["物理攻擊", "50"], ["裝備欄位", "雙手，不能配盾"], ["攻擊速度", "快（5）"]]);
    const oneSlot: Item = { ...spear, eq: { ...spear.eq, islot: "Wp", attackSpeed: 6 } };
    expect(equipGroups(oneSlot).stats).toEqual([["物理攻擊", "97"], ["可衝卷次數", "7"], ["攻擊速度", "普通（6）"]]);
  });

  it("只剩不顯示的欄位時「裝備數值」是空的，道具頁不會多一組空的", () => {
    const wig: Item = { id: 1000030, n: "薩基爾假髮", c: "時裝", s: "帽子", eq: { islot: "HrCp" } };
    expect(equipGroups(wig)).toEqual({ requirements: [], stats: [] });
  });
});
