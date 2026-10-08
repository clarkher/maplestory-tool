/**
 * 傷害計算機（/plan/damage）的預設值與組裝：兩組的點法、武器、能力值、彈藥、技能等級怎麼來，
 * 一組設定怎麼算成畫面要的一包（computeGroup）、一下／兩下打死的怪（killLists）。
 * 公式在 damage.ts、技能表在 damage-skills.ts；點法、武器沿用 gear-view.ts 的 gearPlan（不改它）。
 * 測試在 __tests__/damage-view.test.ts（真資料）。
 */
import { isMagicJob, kitStats, obtainableBy, weaponTypesFor, type GearAmmo, type GearData, type GearWeapon, type StatKey } from "./gear";
import { gearPlan } from "./gear-view";
import { canJobUse } from "./item-view";
import { jobOption, jobTier, minLevelFor, previousJob, SECOND_JOB_LEVEL, stageJob, THIRD_JOB_LEVEL, tierStartLevel } from "./jobs";
import { BOSS_SPAWN_MAX } from "./now-plan";
import { jobLineage, planTraining } from "./planner";
import { LEVEL_CAP } from "./profile";
import { buildProgress, mainBuild, spAtLevel } from "./skill-plan";
import type { GuideJob, MapRecord, Monster, Skill, TrainingRow } from "./types";

/** 經典版等級上限：沿用 profile.ts 那一個（那裡是唯一要改的地方，v002-open 的排程也是改那一行），這裡只轉出去 */
export { LEVEL_CAP };

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

/**
 * 武器選單：物理職業照職業能用的種類，法師是有魔攻、職業用得到的；兩邊都要這個職業拿得到
 * （obtainableBy：只有別的職業接得到的任務才給的不列）——跟 gear.ts 的候選（candidatePool）同一套規則，需求等級低到高
 */
export function weaponChoices(gear: GearData, job: number): GearWeapon[] {
  const usable = (weapon: GearWeapon) => canJobUse(weapon.job, job) === true && obtainableBy(weapon.src, job);
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

/**
 * 預設怪：練功排行（planTraining，前 30 張）依序找，取第一張「主力怪在怪物選單裡」的圖的主力怪。
 * 跳過王圖（刷怪點 BOSS_SPAWN_MAX 個以下，跟 timeline.ts 同一條規則——巴洛古那種圖不是拿來練功的）；
 * 還沒開放（beforeOpen）時再跳過只在 V002 才有的怪（跟選單的 v002 同一條規則）。都沒有回 null。
 */
export function defaultMonster(data: CalcData, job: number, level: number): number | null {
  const byId = new Map(data.monsters.map(monster => [monster.id, monster]));
  for (const pick of planTraining({ job, level }, data.training, byId, 30)) {
    if (pick.row.sp <= BOSS_SPAWN_MAX || !pick.lead) continue;
    const choice = choiceFor(pick.lead, data.maps);
    if (!choice || (data.beforeOpen && choice.v002)) continue;
    return pick.lead.id;
  }
  return null;
}

export type MonsterChoice = { monster: Monster; v002: boolean };

/** 這隻怪在選單裡的樣子：出現在有中文名地圖的怪才有（不收錄、沒有等級的不收），v002＝出現的有名地圖全是 V002 的；不收的回 null */
function choiceFor(monster: Monster, maps: Record<string, MapRecord>): MonsterChoice | null {
  if (monster.un || monster.lv === null) return null;
  const named = monster.maps.filter(id => maps[String(id)]?.zh);
  if (!named.length) return null;
  return { monster, v002: named.every(id => Boolean(maps[String(id)]?.o)) };
}

/** 怪物選單：出現在有中文名地圖的怪（不收錄、沒有等級的不列），依等級低到高；v002＝出現的有名地圖全是 V002 的 */
export function monsterChoices(monsters: Monster[], maps: Record<string, MapRecord>): MonsterChoice[] {
  return monsters
    .flatMap(monster => choiceFor(monster, maps) ?? [])
    .sort((a, b) => (a.monster.lv ?? 0) - (b.monster.lv ?? 0) || a.monster.id - b.monster.id);
}

/** 兩組的名字：點法不同寫點法、等級不同寫等級、都一樣寫左組右組 */
export function groupLabels(groups: [GroupConfig, GroupConfig]): [string, string] {
  const [a, b] = groups;
  if (a.tab && b.tab && a.tab !== b.tab) return [a.tab, b.tab];
  if (a.level !== b.level) return [`Lv.${a.level}`, `Lv.${b.level}`];
  return ["左組", "右組"];
}

const STAT_KEY_LIST: StatKey[] = ["STR", "DEX", "INT", "LUK"];

function isNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNumOrNull(value: unknown): value is number | null {
  return value === null || isNum(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 一組設定每個欄位都要在、型別對（沒存、null 不該有 null 的地方、字串當數字都不收），等級在 1 到上限之間 */
function isGroup(value: unknown): value is GroupConfig {
  if (!isRecord(value)) return false;
  const { tab, level, weaponId, ammoId, extra, stats, buffs, charge, levels } = value;
  return (
    (tab === null || typeof tab === "string") &&
    isNum(level) && level >= 1 && level <= LEVEL_CAP &&
    isNumOrNull(weaponId) && isNumOrNull(ammoId) && isNumOrNull(charge) &&
    isNum(extra) &&
    isRecord(stats) && STAT_KEY_LIST.every(key => isNum(stats[key])) &&
    Array.isArray(buffs) && buffs.every(isNum) &&
    isRecord(levels) && Object.values(levels).every(isNum)
  );
}

/** 共用的設定：職業要是經典版有的、技能 id 跟等級是數字、怪是數字或沒選（null） */
function isShared(value: unknown): value is SharedConfig {
  if (!isRecord(value)) return false;
  const { job, skillId, skillLevel, monsterId } = value;
  return isNum(job) && jobOption(job) !== undefined && isNum(skillId) && isNum(skillLevel) && isNumOrNull(monsterId);
}

/** 記在瀏覽紀錄裡的設定：壞掉、少欄位、型別不對都當沒記（回 null，畫面改用預設） */
export function parseState(raw: string | null): CalcState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isShared(parsed.shared)) return null;
    if (!Array.isArray(parsed.groups) || parsed.groups.length !== 2 || !parsed.groups.every(isGroup)) return null;
    return parsed as CalcState;
  } catch {
    return null;
  }
}
