/**
 * 傷害計算機（/plan/damage，v0.79）的純公式。出處與可信度見 docs/superpowers/specs/2026-10-08-damage-calculator-design.md：
 * 能力視窗＝波波攻略島「依客戶端計算式整理」；技能基本傷害＝舊版公式（楓錄、楓憶、舊版公式彙整一致）；
 * 打怪（防禦、等級差、屬性）、爆擊、命中＝舊版國際服公式，經典版沒驗證。
 * 這裡不碰資料格式（技能表、預設值在 damage-skills.ts／damage-view.ts），測試在 __tests__/damage.test.ts。
 */
import type { StatKey } from "./gear";

export type Stats = Record<StatKey, number>;
export type Range = { min: number; max: number };
/** 火冰雷毒聖（怪物資料 el 的鍵） */
export type Element = "f" | "i" | "l" | "p" | "h";

/** 能力視窗的武器係數（下限／上限）、主屬性、副屬性（波波面板計算器；單手斧棍、雙手斧棍、槍矛的上下限係數不同） */
export const PANEL_COEF: Record<string, { min: number; max: number; main: StatKey; sec: StatKey[] }> = {
  單手劍: { min: 4.0, max: 4.0, main: "STR", sec: ["DEX"] },
  雙手劍: { min: 4.6, max: 4.6, main: "STR", sec: ["DEX"] },
  單手斧: { min: 3.2, max: 4.4, main: "STR", sec: ["DEX"] },
  單手棍: { min: 3.2, max: 4.4, main: "STR", sec: ["DEX"] },
  雙手斧: { min: 3.4, max: 4.8, main: "STR", sec: ["DEX"] },
  雙手棍: { min: 3.4, max: 4.8, main: "STR", sec: ["DEX"] },
  槍: { min: 3.0, max: 5.0, main: "STR", sec: ["DEX"] },
  矛: { min: 3.0, max: 5.0, main: "STR", sec: ["DEX"] },
  短刀: { min: 3.6, max: 3.6, main: "LUK", sec: ["STR", "DEX"] },
  拳套: { min: 3.6, max: 3.6, main: "LUK", sec: ["STR", "DEX"] },
  弓: { min: 3.4, max: 3.4, main: "DEX", sec: ["STR"] },
  弩: { min: 3.6, max: 3.6, main: "DEX", sec: ["STR"] },
  指虎: { min: 4.8, max: 4.8, main: "STR", sec: ["DEX"] },
  火槍: { min: 3.6, max: 3.6, main: "DEX", sec: ["STR"] },
};

/** 沒學精準技能的熟練度 */
export const NO_MASTERY = 0.1;

/** 能力視窗攻擊力，不取整（技能計算接著用）：上限＝(上限係數×主＋副)×攻÷100，下限＝(下限係數×主×0.9×熟＋副)×攻÷100 */
export function rawPanel(type: string, stats: Stats, attack: number, mastery: number): Range | null {
  const coef = PANEL_COEF[type];
  if (!coef) return null;
  const main = stats[coef.main];
  const sec = coef.sec.reduce((sum, key) => sum + stats[key], 0);
  return {
    min: ((coef.min * main * 0.9 * mastery + sec) * attack) / 100,
    max: ((coef.max * main + sec) * attack) / 100,
  };
}

/**
 * 取整的容差：浮點乘法會把數學上剛好的整數算成 62.99999999999999（45×1.4）或 24.000000000000004（5×4.8），
 * 直接 floor／ceil 會差 1。差不到 1e-9 就當作整數，照精確算術取整。
 */
const EPS = 1e-9;

export function floorRange(range: Range): Range {
  return { min: Math.floor(range.min + EPS), max: Math.floor(range.max + EPS) };
}

/** 能力視窗上顯示的攻擊力（無條件捨去） */
export function panelRange(type: string, stats: Stats, attack: number, mastery: number): Range | null {
  const raw = rawPanel(type, stats, attack, mastery);
  return raw && floorRange(raw);
}

/** 雙飛斬每一鏢的基本傷害（還沒乘 150%）：幸運×5.0／×2.5×攻÷100，跟精準暗器無關 */
export function luckySevenBase(stats: Stats, attack: number): Range {
  return { min: (stats.LUK * 2.5 * attack) / 100, max: (stats.LUK * 5.0 * attack) / 100 };
}

/** 龍咆哮：不用武器係數，力量固定 ×4.0 */
export function dragonRoarBase(stats: Stats, attack: number, mastery: number): Range {
  return {
    min: ((stats.STR * 4.0 * mastery * 0.9 + stats.DEX) * attack) / 100,
    max: ((stats.STR * 4.0 + stats.DEX) * attack) / 100,
  };
}

/** 強弓／強弩：用弓敲的公式，除以 150、熟練度固定 10% */
export function arrowBombBase(stats: Stats, attack: number): Range {
  return {
    min: ((stats.DEX * 3.4 * 0.1 * 0.9 + stats.STR) * attack) / 150,
    max: ((stats.DEX * 3.4 + stats.STR) * attack) / 150,
  };
}

/** 魔法：((魔²÷1000＋魔)÷30＋智÷200)×法術基本攻擊；下限把第二個魔換成 魔×熟×0.9。魔＝智力＋裝備魔攻＋增益 */
export function magicBase(int: number, magic: number, spellAttack: number, mastery: number): Range {
  const square = (magic * magic) / 1000;
  return {
    min: ((square + magic * mastery * 0.9) / 30 + int / 200) * spellAttack,
    max: ((square + magic) / 30 + int / 200) * spellAttack,
  };
}

/** 等級差：怪物比你高才算，你比怪高是 0 */
export function levelGap(charLevel: number, mobLevel: number): number {
  return Math.max(0, mobLevel - charLevel);
}

/** 屬性倍率：弱點 1.5、抗性 0.5、免疫（每下 1）、沒寫或攻擊沒有屬性 1 */
export function elementFactor(element: Element | undefined, mobEl: Record<string, string> | undefined): number | "immune" {
  if (!element) return 1;
  const value = mobEl?.[element];
  if (value === "w") return 1.5;
  if (value === "r") return 0.5;
  if (value === "i") return "immune";
  return 1;
}

/** 白騎士充能：一般怪乘 damage%；弱點再 ×(105%＋1.5%×充能等級)；抗性 ×(95%−1.5%×充能等級)；免疫 */
export function chargeFactor(element: Element, level: number, percent: number, mobEl: Record<string, string> | undefined): number | "immune" {
  const base = percent / 100;
  const value = mobEl?.[element];
  if (value === "i") return "immune";
  if (value === "w") return base * (1.05 + 0.015 * level);
  if (value === "r") return base * (0.95 - 0.015 * level);
  return base;
}

/** 好幾個修正相乘；有一個是免疫就整個免疫 */
export function combineFactors(factors: Array<number | "immune">): number | "immune" {
  let product = 1;
  for (const factor of factors) {
    if (factor === "immune") return "immune";
    product *= factor;
  }
  return product;
}

export type HitTarget = { lv: number; pdd: number; mdd: number };

/**
 * 每一下的傷害範圍（取整後）。順序照舊版公式彙整第 1～10 步：基本傷害×修正 → 扣防禦（物理先乘等級差）
 * → ×傷害倍率（(技能%＋爆擊加成)÷100，只有物理才乘；魔法沒有這一步，給多少都忽略）→ 夾在 1～99,999 → 無條件捨去
 * （取整帶 1e-9 容差，見 EPS）。target 是 null＝打木樁。
 */
export type HitInput = {
  base: Range;
  magic: boolean;
  modifier: number | "immune";
  ignoreDefense: boolean;
  multiplier: number;
  charLevel: number;
  target: HitTarget | null;
};

const clampHit = (value: number) => Math.min(99999, Math.max(1, Math.floor(value + EPS)));

export function hitRange(input: HitInput): Range {
  if (input.modifier === "immune") return { min: 1, max: 1 };
  let min = input.base.min * input.modifier;
  let max = input.base.max * input.modifier;
  const target = input.target;
  if (target) {
    const gap = levelGap(input.charLevel, target.lv);
    if (input.magic) {
      if (!input.ignoreDefense) {
        min -= target.mdd * 0.6 * (1 + 0.01 * gap);
        max -= target.mdd * 0.5 * (1 + 0.01 * gap);
      }
    } else {
      min *= 1 - 0.01 * gap;
      max *= 1 - 0.01 * gap;
      if (!input.ignoreDefense) {
        min -= target.pdd * 0.6;
        max -= target.pdd * 0.5;
      }
    }
  }
  // 魔法沒有「乘技能%」這一步，multiplier 不管給多少都當 1
  const multiplier = input.magic ? 1 : input.multiplier;
  return { min: clampHit(min * multiplier), max: clampHit(max * multiplier) };
}

export function average(range: Range): number {
  return (range.min + range.max) / 2;
}

/** 每一下的期望：上下限平均；有爆擊時 (1−機率)×一般＋機率×爆擊 */
export function expectedHit(normal: Range, crit: Range | null, rate: number): number {
  return crit ? (1 - rate) * average(normal) + rate * average(crit) : average(normal);
}

/** 幾次打死：約＝HP÷一次期望，最快＝HP÷一次最高，最慢＝HP÷一次最低，都無條件進位 */
export function killCounts(hp: number, expectedUse: number, bestUse: number, worstUse: number): { avg: number; fastest: number; slowest: number } {
  return { avg: Math.ceil(hp / expectedUse), fastest: Math.ceil(hp / bestUse), slowest: Math.ceil(hp / worstUse) };
}

/** a 比 b 多幾 %（四捨五入到整數，b 比較大時是負的；差不到 0.5% 回 0，不回 -0） */
export function diffPercent(a: number, b: number): number {
  return Math.round((a / b - 1) * 100) || 0;
}

/** 物理必中的命中：迴避×(3.68＋0.14×等級差)（舊版公式彙整；波波命中門檻同一條） */
export function sureHitAccuracy(charLevel: number, monster: { lv: number | null; eva: number }): number {
  return Math.ceil(monster.eva * (3.68 + 0.14 * levelGap(charLevel, monster.lv ?? 0)) - EPS);
}
