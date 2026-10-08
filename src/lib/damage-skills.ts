/**
 * 傷害計算機的技能表：每個攻擊技能一次打幾下、用哪條公式、什麼屬性、會不會爆擊、要什麼武器。
 * 下數依台服技能說明（skills.json 的 desc／levelText），特殊公式與爆擊、屬性依研究補查
 * （side-session-notes/local_bac19159…/2026-10-08-傷害公式補查.md）。查不到的放 NOT_CALCULATED，畫面列出原因。
 * 真資料測試 __tests__/damage-skills.test.ts 擋「遊戲資料有新的攻擊技能沒處理」。
 */
import type { Element } from "./damage";
import { isMagicJob } from "./gear";
import { jobTier } from "./jobs";
import { jobLineage } from "./planner";
import type { Skill } from "./types";

export type DamageKind = "normal" | "lucky" | "dragonRoar" | "arrowBomb" | "magic";

export type SkillRule = {
  /** 一次打幾下（台服說明），沒寫 1；該級有 attackCount 時以它為準（迴旋斬） */
  hits?: number;
  kind: DamageKind;
  element?: Element;
  /** throw＝強力投擲（拳套丟飛鏢）、bow＝霸王箭（弓、弩） */
  crit?: "throw" | "bow";
  /** always＝無視防禦（龍之獻祭）、notHigher＝角色等級 ≥ 怪物等級時無視（落葉斬） */
  ignoreDef?: "always" | "notHigher";
  /** 穿透之箭：後面每隻少一成 */
  pierce?: true;
  /** 台服說明寫明要的武器（「發射 2 個飛鏢」→ 拳套、「用短劍」→ 短刀） */
  weapons?: string[];
  /** 細節裡多寫的一句 */
  note?: string;
};

/** 「普通攻擊」用的假 id（不是遊戲技能） */
export const BASIC_ATTACK = 0;
export const BASIC_RULE: SkillRule = { kind: "normal" };

export const SKILL_RULES: Record<number, SkillRule> = {
  // 劍士
  1001004: { kind: "normal" }, // 魔天一擊
  1001005: { kind: "normal" }, // 劍氣縱橫
  1111008: { kind: "normal", note: "台服資料滿等只有攻擊力 30%，照資料算" }, // 虎咆哮
  1311003: { kind: "normal", weapons: ["槍"] }, // 無雙槍「揮舞長槍」
  1311004: { kind: "normal", weapons: ["矛"] }, // 無雙矛「揮舞矛」
  1311005: { kind: "normal", ignoreDef: "always" }, // 龍之獻祭「無視防禦的攻擊」
  1311006: { kind: "dragonRoar" }, // 龍咆哮
  // 法師
  2001004: { kind: "magic" }, // 魔靈彈
  2001005: { kind: "magic", hits: 2 }, // 魔力爪「攻擊一個敵人兩次」
  2101004: { kind: "magic", element: "f" }, // 火焰箭
  2101005: { kind: "magic", element: "p", note: "只算命中那一下，中毒的持續傷害沒算" }, // 毒霧
  2201004: { kind: "magic", element: "i" }, // 冰錐術
  2201005: { kind: "magic", element: "l" }, // 電閃雷鳴
  2301005: { kind: "magic", element: "h" }, // 神聖之箭
  2111002: { kind: "magic", element: "f" }, // 末日烈焰
  2111006: { kind: "magic", note: "火、毒混合屬性怎麼算查不到，沒套屬性" }, // 火毒合擊
  2211002: { kind: "magic", element: "i" }, // 冰風暴
  2211003: { kind: "magic", element: "l" }, // 落雷凝聚
  2211006: { kind: "magic", note: "冰、雷混合屬性怎麼算查不到，沒套屬性" }, // 冰雷合擊
  2311004: { kind: "magic", element: "h" }, // 聖光
  // 弓箭手
  3001004: { kind: "normal", crit: "bow" }, // 斷魂箭
  3001005: { kind: "normal", hits: 2, crit: "bow" }, // 二連箭「兩次攻擊」
  3101003: { kind: "arrowBomb", weapons: ["弓"] }, // 強弓
  3201003: { kind: "arrowBomb", weapons: ["弩"] }, // 強弩
  3201005: { kind: "normal", crit: "bow", pierce: true }, // 穿透之箭
  3111003: { kind: "normal", crit: "bow", weapons: ["弓"], note: "火屬性加成兩個來源寫法不同，沒套屬性" }, // 烈火箭
  3111004: { kind: "normal", crit: "bow", weapons: ["弓"] }, // 箭雨
  3111006: { kind: "normal", hits: 4, crit: "bow" }, // 四連箭「4 次攻擊」
  3211003: { kind: "normal", crit: "bow", weapons: ["弩"], note: "冰屬性加成兩個來源寫法不同，沒套屬性" }, // 寒冰箭
  3211004: { kind: "normal", crit: "bow", weapons: ["弩"] }, // 升龍弩
  3211006: { kind: "normal", hits: 4, crit: "bow" }, // 四連箭
  // 盜賊
  4001334: { kind: "normal", hits: 2, weapons: ["短刀"] }, // 劈空斬「用短劍刺殺敵人兩次」
  4001344: { kind: "lucky", hits: 2, crit: "throw", weapons: ["拳套"] }, // 雙飛斬「發射 2 個飛鏢」
  4101005: { kind: "normal", crit: "throw", weapons: ["拳套"] }, // 吸血術
  4201004: { kind: "normal" }, // 妙手術
  4201005: { kind: "normal", weapons: ["短刀"] }, // 迴旋斬（下數看 attackCount）
  4111005: { kind: "normal", crit: "throw", weapons: ["拳套"] }, // 風魔手裏劍（三個飛鏢是消耗量，不是下數）
  4211002: { kind: "normal", ignoreDef: "notHigher" }, // 落葉斬
  // 海盜
  5001001: { kind: "normal" }, // 衝擊拳
  5001002: { kind: "normal" }, // 旋風斬
  5001003: { kind: "normal", hits: 2, weapons: ["火槍"] }, // 雙子星攻擊「兩顆子彈」
  5101002: { kind: "normal" }, // 迴旋肘擊
  5101003: { kind: "normal", hits: 2 }, // 昇龍拳「連續兩次攻擊」
  5101004: { kind: "normal" }, // 狂暴衝擊
  5201001: { kind: "normal", weapons: ["火槍"] }, // 散射「發射子彈」
  5201002: { kind: "normal" }, // 炸彈投擲
  5201004: { kind: "normal", note: "子彈攻擊力算不算進去沒人確定，照算" }, // 偽裝射擊
  5201006: { kind: "normal", weapons: ["火槍"] }, // 脫離戰場「利用火槍的後座力」
  5111002: { kind: "normal" }, // 能量暴擊
  5111004: { kind: "normal" }, // 損人利己
  5111006: { kind: "normal" }, // 衝擊波
  5210000: { kind: "normal", hits: 3, weapons: ["火槍"] }, // 3連發
  5211004: { kind: "normal", element: "f", note: "持續燒傷沒算" }, // 火焰噴射
  5211005: { kind: "normal", element: "i" }, // 寒霜噴射
  5211006: { kind: "normal" }, // 指定攻擊
};

export const NOT_CALCULATED: Record<number, string> = {
  1100002: "被動、機率觸發，打幾隻查不到",
  1100003: "被動、機率觸發，打幾隻查不到",
  1200002: "被動、機率觸發，打幾隻查不到",
  1200003: "被動、機率觸發，打幾隻查不到",
  1300002: "被動、機率觸發，打幾隻查不到",
  1300003: "被動、機率觸發，打幾隻查不到",
  3100001: "被動、機率觸發，打幾隻查不到",
  3200001: "被動、機率觸發，打幾隻查不到",
  1111003: "要看鬥氣珠數，鬥氣倍率各家寫法不同",
  1111004: "要看鬥氣珠數，鬥氣倍率各家寫法不同",
  1111005: "要看鬥氣珠數，鬥氣倍率各家寫法不同",
  1111006: "要看鬥氣珠數，鬥氣倍率各家寫法不同",
  1211002: "跟充能怎麼疊查不到",
  2111003: "毒霧的持續傷害怎麼算查不到",
  2311006: "召喚獸的傷害另有算法，沒查到",
  3111005: "召喚獸的傷害另有算法，沒查到",
  3211005: "召喚獸的傷害另有算法，沒查到",
  5211001: "召喚獸的傷害另有算法，沒查到",
  5211002: "召喚獸的傷害另有算法，沒查到",
  3110001: "不是爆擊，是貼臉時改成射箭＋秒殺機率，查不到專門公式",
  3210001: "不是爆擊，是貼臉時改成射箭＋秒殺機率，查不到專門公式",
  4111002: "分身追加的傷害沒算",
  1111002: "鬥氣集中的加成各家寫法不同",
};

export const CRIT_SKILL = { throw: 4100001, bow: 3000001 };
/** 魔力激發（三轉火毒、冰雷）：魔法基本傷害 × 該級 y% */
export const AMP_SKILLS = [2110001, 2210001];
/** 加攻擊／魔攻的增益（激勵、龍之魂、精神強化×2） */
export const BUFFS: Array<{ id: number; stat: "pad" | "mad" }> = [
  { id: 1101006, stat: "pad" },
  { id: 1311008, stat: "pad" },
  { id: 2101001, stat: "mad" },
  { id: 2201001, stat: "mad" },
];
const SWORDS = ["單手劍", "雙手劍"];
const BLUNTS = ["單手棍", "雙手棍"];
/** 白騎士充能：劍的烈焰／寒冰／雷鳴之劍，棍的之棍 */
export const CHARGES: Array<{ id: number; element: Element; weapons: string[] }> = [
  { id: 1211003, element: "f", weapons: SWORDS },
  { id: 1211004, element: "f", weapons: BLUNTS },
  { id: 1211005, element: "i", weapons: SWORDS },
  { id: 1211006, element: "i", weapons: BLUNTS },
  { id: 1211007, element: "l", weapons: SWORDS },
  { id: 1211008, element: "l", weapons: BLUNTS },
];

/** 武器種類 → 精準技能（劍看職業線：狂戰士線 1100000、騎士線 1200000）；這一線沒有就 null */
export function masterySkillFor(weaponType: string, job: number): number | null {
  const lineage = jobLineage(job);
  const has = (code: number) => lineage.includes(code);
  if (SWORDS.includes(weaponType)) return has(110) ? 1100000 : has(120) ? 1200000 : null;
  const table: Record<string, [number, number]> = {
    單手斧: [110, 1100001],
    雙手斧: [110, 1100001],
    單手棍: [120, 1200001],
    雙手棍: [120, 1200001],
    槍: [130, 1300000],
    矛: [130, 1300001],
    弓: [310, 3100000],
    弩: [320, 3200000],
    拳套: [410, 4100000],
    短刀: [420, 4200000],
    指虎: [510, 5100001],
    火槍: [520, 5200000],
  };
  const entry = table[weaponType];
  return entry && has(entry[0]) ? entry[1] : null;
}

/** 一次打幾下：該級有 attackCount 用它，否則用技能表的 hits，都沒有 1 */
export function hitsAt(rule: SkillRule, row: Record<string, number> | undefined): number {
  return row?.attackCount ?? rule.hits ?? 1;
}

/** 這個職業一路上來（一轉→三轉）算得出來的攻擊技能；物理職業最前面是普通攻擊 */
export function attackSkillIds(skills: Map<number, Skill>, job: number): number[] {
  const lineage = new Set(jobLineage(job));
  const ids = [...skills.values()]
    .filter(skill => lineage.has(skill.job) && SKILL_RULES[skill.id])
    .sort((a, b) => jobTier(a.job) - jobTier(b.job) || a.id - b.id)
    .map(skill => skill.id);
  return isMagicJob(job) ? ids : [BASIC_ATTACK, ...ids];
}

/** 這個職業一路上來沒算的技能（畫面列名字跟原因） */
export function notCalculatedFor(skills: Map<number, Skill>, job: number): Array<{ id: number; name: string; reason: string }> {
  const lineage = new Set(jobLineage(job));
  return [...skills.values()]
    .filter(skill => lineage.has(skill.job) && NOT_CALCULATED[skill.id])
    .sort((a, b) => jobTier(a.job) - jobTier(b.job) || a.id - b.id)
    .map(skill => ({ id: skill.id, name: skill.n, reason: NOT_CALCULATED[skill.id] }));
}
