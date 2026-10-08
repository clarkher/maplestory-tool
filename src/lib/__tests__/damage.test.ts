/**
 * 傷害公式（src/lib/damage.ts）。例子出自研究筆記：
 * side-session-notes/local_88ec5ceb…/2026-10-08-傷害公式研究.md、local_bac19159…/2026-10-08-傷害公式補查.md
 */
import { describe, expect, it } from "vitest";
import {
  arrowBombBase,
  average,
  chargeFactor,
  combineFactors,
  diffPercent,
  dragonRoarBase,
  elementFactor,
  expectedHit,
  hitRange,
  killCounts,
  levelGap,
  luckySevenBase,
  magicBase,
  panelRange,
  rawPanel,
  sureHitAccuracy,
} from "@/lib/damage";

const stats = (STR: number, DEX: number, INT: number, LUK: number) => ({ STR, DEX, INT, LUK });

describe("能力視窗攻擊力（波波：依客戶端計算式整理）", () => {
  it("拳套：主幸運、副力＋敏，上下限各自取整", () => {
    // 刺客 50 一般點法：幸 172、敏 90、力 4，赤紅手甲 26＋海星鏢 15，精準暗器 20 級 60%
    expect(panelRange("拳套", stats(4, 90, 4, 172), 41, 0.6)).toEqual({ min: 175, max: 292 });
  });
  it("單手斧上下限係數不同（3.2／4.4）", () => {
    const r = rawPanel("單手斧", stats(100, 20, 4, 4), 50, 0.6)!;
    expect(r.max).toBeCloseTo(((4.4 * 100 + 20) * 50) / 100);
    expect(r.min).toBeCloseTo(((3.2 * 100 * 0.9 * 0.6 + 20) * 50) / 100);
  });
  it("弓：主敏、副力；不認得的武器回 null", () => {
    expect(rawPanel("弓", stats(55, 207, 4, 4), 66, 0.6)!.max).toBeCloseTo(((3.4 * 207 + 55) * 66) / 100);
    expect(rawPanel("短杖", stats(4, 4, 200, 4), 30, 0.6)).toBeNull();
  });
});

describe("技能基本傷害（舊版公式）", () => {
  it("雙飛斬：幸運×5.0／×2.5×攻÷100，乘 150% 後＝研究的例子 187～375", () => {
    const base = luckySevenBase(stats(4, 25, 4, 100), 50);
    expect(base).toEqual({ min: 125, max: 250 });
    expect(hitRange({ base, magic: false, modifier: 1, ignoreDefense: false, multiplier: 1.5, charLevel: 30, target: null })).toEqual({ min: 187, max: 375 });
    // 爆擊：150%＋100%＝250% → 312～625
    expect(hitRange({ base, magic: false, modifier: 1, ignoreDefense: false, multiplier: 2.5, charLevel: 30, target: null })).toEqual({ min: 312, max: 625 });
  });
  it("龍咆哮：力量係數固定 4.0", () => {
    const r = dragonRoarBase(stats(300, 60, 4, 4), 100, 0.6);
    expect(r.max).toBeCloseTo(((300 * 4 + 60) * 100) / 100);
    expect(r.min).toBeCloseTo(((300 * 4 * 0.6 * 0.9 + 60) * 100) / 100);
  });
  it("強弓／強弩：除以 150、熟練度固定 10%", () => {
    const r = arrowBombBase(stats(50, 200, 4, 4), 75);
    expect(r.max).toBeCloseTo(((200 * 3.4 + 50) * 75) / 150);
    expect(r.min).toBeCloseTo(((200 * 3.4 * 0.1 * 0.9 + 50) * 75) / 150);
  });
  it("魔法：魔攻含智力，熟練度看法術", () => {
    // 智 208、黃色雨傘魔攻 52 → 魔 260；火焰箭 30 級 基本攻擊 120、熟練度 60%
    const r = magicBase(208, 260, 120, 0.6);
    expect(r.max).toBeCloseTo(((260 * 260) / 1000 + 260) / 30 * 120 + (208 / 200) * 120);
    expect(r.min).toBeCloseTo(((260 * 260) / 1000 + 260 * 0.6 * 0.9) / 30 * 120 + (208 / 200) * 120);
  });
});

describe("打怪（舊版國際服公式，經典版沒驗證）", () => {
  const base = { min: 200, max: 400 };
  const target = { lv: 50, pdd: 100, mdd: 80 };
  it("等級差只算怪比較高的時候", () => {
    expect(levelGap(50, 55)).toBe(5);
    expect(levelGap(60, 55)).toBe(0);
  });
  it("物理：先扣防禦（上限×0.5、下限×0.6）再乘技能%", () => {
    expect(hitRange({ base, magic: false, modifier: 1, ignoreDefense: false, multiplier: 2, charLevel: 50, target })).toEqual({
      min: Math.floor((200 - 60) * 2),
      max: Math.floor((400 - 50) * 2),
    });
  });
  it("物理：怪高 10 級先乘 0.9 再扣防禦", () => {
    expect(hitRange({ base, magic: false, modifier: 1, ignoreDefense: false, multiplier: 1, charLevel: 40, target })).toEqual({
      min: Math.floor(200 * 0.9 - 60),
      max: Math.floor(400 * 0.9 - 50),
    });
  });
  it("魔法：扣 魔防×0.5／0.6×(1＋0.01×等級差)，不乘技能%", () => {
    expect(hitRange({ base, magic: true, modifier: 1, ignoreDefense: false, multiplier: 1, charLevel: 45, target })).toEqual({
      min: Math.floor(200 - 80 * 0.6 * 1.05),
      max: Math.floor(400 - 80 * 0.5 * 1.05),
    });
  });
  it("無視防禦：只乘等級差，不扣防禦", () => {
    expect(hitRange({ base, magic: false, modifier: 1, ignoreDefense: true, multiplier: 1, charLevel: 50, target })).toEqual({ min: 200, max: 400 });
  });
  it("扣到負的最少 1；免疫每下 1", () => {
    expect(hitRange({ base: { min: 10, max: 20 }, magic: false, modifier: 1, ignoreDefense: false, multiplier: 1, charLevel: 50, target })).toEqual({ min: 1, max: 1 });
    expect(hitRange({ base, magic: true, modifier: "immune", ignoreDefense: false, multiplier: 1, charLevel: 50, target })).toEqual({ min: 1, max: 1 });
  });
  it("屬性：弱 1.5、抗 0.5、免疫、沒寫 1；沒有屬性的攻擊一律 1", () => {
    expect(elementFactor("f", { f: "w" })).toBe(1.5);
    expect(elementFactor("i", { i: "r" })).toBe(0.5);
    expect(elementFactor("l", { l: "i" })).toBe("immune");
    expect(elementFactor("h", { f: "w" })).toBe(1);
    expect(elementFactor(undefined, { f: "w" })).toBe(1);
  });
  it("白騎士充能：一般乘 damage%，弱 ×(105%＋1.5%×等級)，抗 ×(95%−1.5%×等級)", () => {
    expect(chargeFactor("f", 30, 120, undefined)).toBeCloseTo(1.2);
    expect(chargeFactor("f", 30, 120, { f: "w" })).toBeCloseTo(1.2 * 1.5);
    expect(chargeFactor("f", 30, 120, { f: "r" })).toBeCloseTo(1.2 * 0.5);
    expect(chargeFactor("i", 30, 110, { i: "i" })).toBe("immune");
  });
  it("修正相乘，有一個免疫就免疫", () => {
    expect(combineFactors([1.4, 1.5])).toBeCloseTo(2.1);
    expect(combineFactors([1.5, "immune"])).toBe("immune");
    expect(combineFactors([])).toBe(1);
  });
});

describe("期望、幾下打死、差幾 %、命中", () => {
  it("期望：上下限平均；有爆擊照機率加權", () => {
    expect(average({ min: 100, max: 300 })).toBe(200);
    expect(expectedHit({ min: 100, max: 300 }, { min: 200, max: 400 }, 0.5)).toBe(250);
    expect(expectedHit({ min: 100, max: 300 }, null, 0.5)).toBe(200);
  });
  it("幾下打死：無條件進位", () => {
    expect(killCounts(3200, 611.8, 892, 330)).toEqual({ avg: 6, fastest: 4, slowest: 10 });
  });
  it("差幾 %：四捨五入；差不到 0.5% 是 0", () => {
    expect(diffPercent(611.8, 591.6)).toBe(3);
    expect(diffPercent(100.4, 100)).toBe(0);
  });
  it("必中命中：迴避×(3.68＋0.14×等級差) 無條件進位", () => {
    expect(sureHitAccuracy(50, { lv: 50, eva: 18 })).toBe(Math.ceil(18 * 3.68));
    expect(sureHitAccuracy(50, { lv: 55, eva: 20 })).toBe(Math.ceil(20 * (3.68 + 0.7)));
  });
});
