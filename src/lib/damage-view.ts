/**
 * 傷害計算機（/plan/damage）的預設值與組裝：兩組的點法、武器、能力值、彈藥、技能等級怎麼來，
 * 一組設定怎麼算成畫面要的一包（computeGroup）、一下／兩下打死的怪（killLists）。
 * 公式在 damage.ts、技能表在 damage-skills.ts；點法、武器沿用 gear-view.ts 的 gearPlan（不改它）。
 * 測試在 __tests__/damage-view.test.ts（真資料）。
 */
import { isMagicJob, kitStats, weaponTypesFor, type GearAmmo, type GearData, type GearWeapon, type StatKey } from "./gear";
import { gearPlan } from "./gear-view";
import { canJobUse } from "./item-view";
import { jobOption, jobTier, minLevelFor, previousJob, SECOND_JOB_LEVEL, stageJob, THIRD_JOB_LEVEL, tierStartLevel } from "./jobs";
import { jobLineage, planTraining } from "./planner";
import { buildProgress, mainBuild, spAtLevel } from "./skill-plan";
import type { GuideJob, MapRecord, Monster, Skill, TrainingRow } from "./types";

/** 經典版等級上限（meta.json release.levelCap） */
export const LEVEL_CAP = 120;

export type CalcData = {
  gear: GearData;
  skills: Map<number, Skill>;
  /** 職業代碼 → 攻略（載不到的是 undefined） */
  guides: Record<number, GuideJob | undefined>;
  monsters: Monster[];
  maps: Record<string, MapRecord>;
  training: TrainingRow[];
  beforeOpen: boolean;
};

export type GroupConfig = {
  /** 點法標籤（「一般點法」「全幸」）；這個職業沒有第二套是 null */
  tab: string | null;
  level: number;
  weaponId: number | null;
  ammoId: number | null;
  /** 其他攻擊（法師是其他魔攻）：手套衝卷、其他裝備 */
  extra: number;
  stats: Record<StatKey, number>;
  /** 勾了的增益技能 id */
  buffs: number[];
  /** 白騎士充能技能 id */
  charge: number | null;
  /** 技能 id → 等級（精準、爆擊、魔力激發、增益、充能用；預設照技能點法） */
  levels: Record<number, number>;
};

export type SharedConfig = { job: number; skillId: number; skillLevel: number; monsterId: number | null };
export type CalcState = { shared: SharedConfig; groups: [GroupConfig, GroupConfig] };

/** 武器種類 → 彈藥種類 */
export const AMMO_KIND: Record<string, GearAmmo["kind"]> = { 拳套: "飛鏢", 弓: "箭矢", 弩: "弩箭", 火槍: "子彈" };

/** 一轉攻略有好幾條主流時（海盜分打手、槍手）用二轉職業名挑：二轉是自己、三轉是上一轉 */
export function branchName(job: number): string | undefined {
  const tier = jobTier(job);
  if (tier === 2) return jobOption(job)?.name;
  if (tier === 3) return jobOption(previousJob(job))?.name;
  return undefined;
}

/**
 * 照研究檔的主流技能點法，這個職業在這個等級每個技能點到幾級：一轉、二轉已經過了的用那一轉最後一級的點數，
 * 現在這一轉用現在的點數（skill-plan 的 buildProgress）。某一轉沒有攻略時那一轉的技能一律最高等級、guided＝false。
 */
export function skillLevelsAt(
  job: number,
  level: number,
  guides: CalcData["guides"],
  skills: Map<number, Skill>,
): { levels: Record<number, number>; guided: boolean } {
  const levels: Record<number, number> = {};
  let guided = true;
  const current = stageJob(job, level);
  for (const stage of [...jobLineage(job)].reverse()) {
    if (stage <= 0 || level < tierStartLevel(stage)) continue;
    const guide = guides[stage];
    const build = guide ? mainBuild(guide.builds, branchName(job)) : undefined;
    if (!build) {
      guided = false;
      for (const skill of skills.values()) if (skill.job === stage && skill.levels?.length) levels[skill.id] = skill.levels.length;
      continue;
    }
    const lastLevel = stage === current ? level : (jobTier(stage) === 1 ? SECOND_JOB_LEVEL : THIRD_JOB_LEVEL) - 1;
    const progress = buildProgress(build, spAtLevel(stage, lastLevel));
    for (const step of progress.steps) {
      if (step.id === null) continue;
      const reached = step.state === "done" ? step.to : step.state === "now" ? progress.current?.reached ?? 0 : 0;
      levels[step.id] = Math.max(levels[step.id] ?? 0, reached);
    }
  }
  return { levels, guided };
}

/** 這種武器用的彈藥，攻擊力低到高 */
export function ammoChoices(ammo: GearAmmo[], weaponType: string): GearAmmo[] {
  const kind = AMMO_KIND[weaponType];
  if (!kind) return [];
  return ammo.filter(entry => entry.kind === kind).sort((a, b) => a.atk - b.atk || a.lv - b.lv || a.id - b.id);
}

/** 預設彈藥：等級夠、現在拿得到的裡面，商店買得到的攻擊力最高那種；沒有商店賣的就挑拿得到的裡攻擊力最高的 */
export function defaultAmmo(ammo: GearAmmo[], weaponType: string, level: number, beforeOpen: boolean): GearAmmo | null {
  const usable = ammoChoices(ammo, weaponType).filter(entry => entry.lv <= level && !(beforeOpen && entry.o));
  const sold = usable.filter(entry => entry.src.shops?.some(shop => !(beforeOpen && shop.o)));
  const pool = sold.length ? sold : usable;
  return pool.length ? pool[pool.length - 1] : null;
}

/** 武器選單：物理職業照職業能用的種類，法師是有魔攻、職業用得到的（跟 gear.ts 的候選同一套規則），需求等級低到高 */
export function weaponChoices(gear: GearData, job: number): GearWeapon[] {
  const usable = (weapon: GearWeapon) => canJobUse(weapon.job, job) === true;
  const types = new Set(weaponTypesFor(job));
  const list = isMagicJob(job)
    ? gear.weapons.filter(weapon => (weapon.mag ?? 0) > 0 && usable(weapon))
    : gear.weapons.filter(weapon => types.has(weapon.s) && usable(weapon));
  return [...list].sort((a, b) => a.lv - b.lv || a.s.localeCompare(b.s) || a.id - b.id);
}

/** 等級夾在這個職業的轉職等級到 120 */
export function clampLevel(job: number, level: number): number {
  return Math.min(LEVEL_CAP, Math.max(minLevelFor(job), Math.round(level) || 1));
}

/** 一組的預設：gearPlan 的點法（含要湊的裝備）、主推武器、商店彈藥、技能點法的等級；其他攻擊 0、增益不勾 */
export function defaultGroup(data: CalcData, job: number, level: number, tab: string | null): GroupConfig {
  const lv = clampLevel(job, level);
  const plan = gearPlan(data.gear, job, lv, data.beforeOpen, tab);
  const naked = plan.targets ?? { STR: 4, DEX: 4, INT: 4, LUK: 4 };
  const stats = plan.rule?.kit?.length && plan.targets ? kitStats(plan.rule.kit, lv, plan.targets, data.beforeOpen).stats : naked;
  const weapon = plan.best;
  return {
    tab: plan.rule?.tab ?? null,
    level: lv,
    weaponId: weapon?.id ?? null,
    ammoId: weapon ? defaultAmmo(data.gear.ammo ?? [], weapon.s, lv, data.beforeOpen)?.id ?? null : null,
    extra: 0,
    stats: { ...stats },
    buffs: [],
    charge: null,
    levels: skillLevelsAt(job, lv, data.guides, data.skills).levels,
  };
}

/** 預設怪：練功排行（planTraining）以這個等級排出的第一名那張圖的主力怪 */
export function defaultMonster(data: CalcData, job: number, level: number): number | null {
  const byId = new Map(data.monsters.map(monster => [monster.id, monster]));
  return planTraining({ job, level }, data.training, byId, 1)[0]?.lead?.id ?? null;
}

export type MonsterChoice = { monster: Monster; v002: boolean };

/** 怪物選單：出現在有中文名地圖的怪（不收錄、沒有等級的不列），依等級低到高；v002＝出現的有名地圖全是 V002 的 */
export function monsterChoices(monsters: Monster[], maps: Record<string, MapRecord>): MonsterChoice[] {
  return monsters
    .filter(monster => !monster.un && monster.lv !== null)
    .map(monster => ({ monster, named: monster.maps.filter(id => maps[String(id)]?.zh) }))
    .filter(entry => entry.named.length > 0)
    .map(({ monster, named }) => ({ monster, v002: named.every(id => Boolean(maps[String(id)]?.o)) }))
    .sort((a, b) => (a.monster.lv ?? 0) - (b.monster.lv ?? 0) || a.monster.id - b.monster.id);
}

/** 兩組的名字：點法不同寫點法、等級不同寫等級、都一樣寫左組右組 */
export function groupLabels(groups: [GroupConfig, GroupConfig]): [string, string] {
  const [a, b] = groups;
  if (a.tab && b.tab && a.tab !== b.tab) return [a.tab, b.tab];
  if (a.level !== b.level) return [`Lv.${a.level}`, `Lv.${b.level}`];
  return ["左組", "右組"];
}

function isGroup(value: unknown): value is GroupConfig {
  const group = value as GroupConfig;
  return Boolean(group) && typeof group.level === "number" && typeof group.stats === "object" && Array.isArray(group.buffs) && typeof group.levels === "object";
}

/** 記在瀏覽紀錄裡的設定：壞掉或少欄位都當沒記（回 null，畫面改用預設） */
export function parseState(raw: string | null): CalcState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CalcState;
    const shared = parsed?.shared;
    if (!shared || typeof shared.job !== "number" || typeof shared.skillId !== "number" || typeof shared.skillLevel !== "number") return null;
    if (!Array.isArray(parsed.groups) || parsed.groups.length !== 2 || !parsed.groups.every(isGroup)) return null;
    return parsed;
  } catch {
    return null;
  }
}
