/**
 * 出一招幾毫秒、每秒經驗（傷害計算機 v0.87，使用者「估算平均每秒經驗值（不含走路）」）。
 * 出處：NiaMeowDB 攻速頁與逐技能表（國際服經典版玩家整理，台服沒驗證），研究筆記
 * side-session-notes/local_bac19159…/2026-10-12-攻速研究.md。基本毫秒是用研究的逐技能表反推、每一階都對得上的值
 * （例：弩寫 820，但每格捨去後實際要用 818 才整張對得上），測試在 __tests__/damage-speed.test.ts。
 */
import { BASIC_ATTACK } from "./damage-skills";

/** 浮點容差（800×14÷16 這種剛好整除的不能因為誤差多進一格） */
const EPS = 1e-9;

/** 出一招幾毫秒：30×進位(基本×(10＋階)÷16÷30)，階夾在 0～10（10 階以上一樣慢） */
export function actionMs(base: number, tier: number): number {
  const clamped = Math.min(10, Math.max(0, tier));
  return 30 * Math.ceil((base * (10 + clamped)) / 16 / 30 - EPS);
}

/** 用武器動作的技能：弩 818、海盜的指虎火槍查不到、其他（含槍矛，用比較慢的揮）800 */
function weaponBaseMs(weaponType: string): number | null {
  if (weaponType === "弩") return 818;
  if (weaponType === "指虎" || weaponType === "火槍") return null;
  return 800;
}

/** weapon＝用武器動作；數字＝自己的動作；陣列＝照技能等級分段（到幾級為止、基本毫秒） */
type SpeedRule = "weapon" | number | Array<[number, number]>;

const SPEED_RULES: Record<number, SpeedRule> = {
  // 劍士
  1001004: "weapon", // 魔天一擊
  1001005: "weapon", // 劍氣縱橫
  1111008: 1500, // 虎咆哮
  1311003: "weapon", // 無雙槍
  1311004: "weapon", // 無雙矛
  1311006: 1500, // 龍咆哮（另有自暈，見 dragonRoarStunMs）
  1311001: [[14, 900], [Infinity, 1050]], // 槍連擊
  1311002: [[14, 900], [Infinity, 1050]], // 矛連擊
  // 法師（固定 6 階，不看武器）
  2001004: 800, // 魔靈彈
  2001005: 800, // 魔力爪
  2101004: 800, // 火焰箭
  2101005: 800, // 毒霧
  2201004: 800, // 冰錐術
  2201005: 800, // 電閃雷鳴
  2301005: 800, // 神聖之箭
  2111002: 1800, // 末日烈焰
  2111006: 900, // 火毒合擊
  2211002: 1050, // 冰風暴
  2211003: 1300, // 落雷凝聚
  2211006: 900, // 冰雷合擊
  2311004: 1050, // 聖光
  // 弓箭手
  3001004: "weapon", // 斷魂箭
  3001005: "weapon", // 二連箭
  3101003: "weapon", // 強弓
  3201003: 800, // 強弩（研究寫 6 階 750～810，用慢的那個）
  3201005: "weapon", // 穿透之箭
  3111003: "weapon", // 烈火箭
  3111004: "weapon", // 箭雨
  3111006: "weapon", // 四連箭
  3211003: "weapon", // 寒冰箭
  3211004: "weapon", // 升龍弩
  3211006: "weapon", // 四連箭
  // 盜賊
  4001334: "weapon", // 劈空斬
  4001344: "weapon", // 雙飛斬
  4101005: "weapon", // 吸血術
  4201004: "weapon", // 妙手術
  4201005: 960, // 迴旋斬
  4111005: 900, // 風魔手裏劍
  4211002: 900, // 落葉斬
};

/** 出手時間固定、不吃攻速跟加速的技能：群體治癒 600 毫秒（Oddjobs） */
const FIXED_MS: Record<number, number> = { 2301002: 600 };

export function fixedMs(skillId: number): number | undefined {
  return FIXED_MS[skillId];
}

/** 查不到出手時間時，畫面上那一句 */
export const SPEED_UNKNOWN = "這招出手時間查不到，不算";

/** 這招在攻速 6 階時的基本毫秒；海盜全部、龍之獻祭（研究查不到）回 null */
export function skillBaseMs(skillId: number, weaponType: string, skillLevel: number): number | null {
  const rule = skillId === BASIC_ATTACK ? "weapon" : SPEED_RULES[skillId];
  if (rule === undefined) return null;
  if (rule === "weapon") return weaponBaseMs(weaponType);
  if (typeof rule === "number") return rule;
  return rule.find(([upTo]) => skillLevel <= upTo)?.[1] ?? null;
}

/** 龍咆哮放完自己會暈：1～9 級 4 秒、10～20 級 3 秒、21～30 級 2 秒（一輪＝max(動作, 自暈)） */
export function dragonRoarStunMs(level: number): number {
  return level <= 9 ? 4000 : level <= 20 ? 3000 : 2000;
}

export const DRAGON_ROAR = 1311006;

/** 加速技能：手上武器對得上才有效；magic＝法師的極速詠唱（不看武器） */
export type Booster = { id: number; weapons: string[] | "magic" };

export const BOOSTERS: Booster[] = [
  { id: 1101004, weapons: ["單手劍", "雙手劍"] }, // 快速之劍（狂戰士）
  { id: 1101005, weapons: ["單手斧", "雙手斧"] }, // 快速之斧
  { id: 1201004, weapons: ["單手劍", "雙手劍"] }, // 快速之劍（見習騎士）
  { id: 1201005, weapons: ["單手棍", "雙手棍"] }, // 快速之棍
  { id: 1301004, weapons: ["槍"] }, // 快速之槍
  { id: 1301005, weapons: ["矛"] }, // 快速之矛
  { id: 2111005, weapons: "magic" }, // 極速詠唱（火毒）
  { id: 2211005, weapons: "magic" }, // 極速詠唱（冰雷）
  { id: 3101002, weapons: ["弓"] }, // 快速之弓
  { id: 3201002, weapons: ["弩"] }, // 快速之弩
  { id: 4101003, weapons: ["拳套"] }, // 極速暗殺
  { id: 4201002, weapons: ["短刀"] }, // 快速之刀
];

/** 加速快幾階：物理每一級都是 2；極速詠唱台服資料沒寫，照國際服經典版 1～10 級 1、11 級起 2；沒學 0 */
export function boosterSteps(booster: Booster, level: number): number {
  if (level <= 0) return 0;
  if (booster.weapons === "magic") return level <= 10 ? 1 : 2;
  return 2;
}

/** 法師的施法固定用 6 階（不看武器攻速） */
export const MAGIC_TIER = 6;

/** 每秒經驗＝經驗×範圍內隻數÷(幾次打死×一招秒數) */
export function expPerSecond(exp: number, uses: number, ms: number, targets = 1): number {
  return (exp * targets) / ((uses * ms) / 1000);
}
