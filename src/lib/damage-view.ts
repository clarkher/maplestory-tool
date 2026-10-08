/**
 * 傷害計算機（/plan/damage）的預設值與組裝：兩組的點法、武器、能力值、彈藥、技能等級怎麼來，
 * 一組設定怎麼算成畫面要的一包（computeGroup）、一下／兩下打死的怪（killLists）。
 * 公式在 damage.ts、技能表在 damage-skills.ts；點法、武器沿用 gear-view.ts 的 gearPlan（不改它）。
 * 測試在 __tests__/damage-view.test.ts（真資料）。
 */
import {
  arrowBombBase,
  combineFactors,
  chargeFactor,
  diffPercent,
  dragonRoarBase,
  elementFactor,
  expectedHit,
  hitRange,
  killCounts,
  luckySevenBase,
  magicBase,
  NO_MASTERY,
  panelRange,
  rawPanel,
  sureHitAccuracy,
  type Range,
} from "./damage";
import {
  AMP_SKILLS,
  attackSkillIds,
  BASIC_ATTACK,
  BASIC_RULE,
  BUFFS,
  CHARGES,
  CRIT_SKILL,
  hitsAt,
  masterySkillFor,
  NOT_CALCULATED,
  SKILL_RULES,
  skillRow,
} from "./damage-skills";
import { isMagicJob, kitStats, obtainableBy, statShortfall, weaponTypesFor, type GearAmmo, type GearData, type GearWeapon, type StatKey } from "./gear";
import { gearPlan, tabsFor } from "./gear-view";
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

/* ------------------------------------------------------------------ 算一組 */

export type Unready = { ok: false; reason: string };
export type HitPair = { hit: Range; use: Range; crit: { hit: Range; use: Range } | null };
export type GroupResult =
  | Unready
  | {
      ok: true;
      name: string;
      magic: boolean;
      hits: number;
      /** 物理總攻擊（武器＋彈藥＋其他＋增益）；法師 0 */
      attack: number;
      /** 能力視窗攻擊力（取整）；法師、認不得的武器 null */
      panel: Range | null;
      /** 法師的魔攻（智力＋武器魔攻＋其他＋精神強化） */
      magicPower: number | null;
      critRate: number | null;
      short: Array<{ stat: StatKey; short: number }>;
      notes: string[];
      /** 打木樁 */
      raw: HitPair;
      /** 打選的怪；沒選怪 null */
      vs: (HitPair & { kills: { avg: number; fastest: number; slowest: number }; accuracy: number | null }) | null;
      /** 一次的期望（選了怪用扣完防禦的） */
      expectedUse: number;
    };

type Prepared = {
  ok: true;
  name: string;
  magic: boolean;
  hits: number;
  attack: number;
  panel: Range | null;
  magicPower: number | null;
  critRate: number | null;
  short: Array<{ stat: StatKey; short: number }>;
  notes: string[];
  at(target: Monster | null): { hit: Range; crit: Range | null };
};

const times = (range: Range, hits: number): Range => ({ min: range.min * hits, max: range.max * hits });

function rowAt(skill: Skill | undefined, level: number): Record<string, number> | null {
  if (!skill?.levels?.length || level <= 0) return null;
  return skill.levels[Math.min(level, skill.levels.length) - 1];
}

function prepare(data: CalcData, shared: SharedConfig, group: GroupConfig): Prepared | Unready {
  const job = shared.job;
  const weapon = data.gear.weapons.find(entry => entry.id === group.weaponId);
  if (!weapon) return { ok: false, reason: "先選一把武器" };
  const isBasic = shared.skillId === BASIC_ATTACK;
  const skill = isBasic ? undefined : data.skills.get(shared.skillId);
  const rule = isBasic ? BASIC_RULE : SKILL_RULES[shared.skillId];
  if (!rule || (!isBasic && !skill)) {
    const reason = NOT_CALCULATED[shared.skillId];
    return { ok: false, reason: reason ? `這個技能沒算：${reason}` : "先選一個技能" };
  }
  const name = skill?.n ?? "普通攻擊";
  if (rule.weapons && !rule.weapons.includes(weapon.s)) return { ok: false, reason: `${weapon.s}用不了${name}` };

  const lineage = new Set(jobLineage(job));
  const inLine = (id: number) => lineage.has(data.skills.get(id)?.job ?? -1);
  const levelOf = (id: number) => group.levels[id] ?? 0;
  // 勾了的增益、選的充能：技能點法沒點的照最高等級（使用者自己勾的）
  const chosenRow = (id: number) => rowAt(data.skills.get(id), levelOf(id) || (data.skills.get(id)?.levels?.length ?? 0));
  // 選的技能這一級的數值；槍連擊這種只寫在說明文字的（fromText）由 skillRow 解析進 damage／attackCount
  const row: Record<string, number> = isBasic ? {} : skillRow(skill, Math.max(1, shared.skillLevel), rule);
  const magic = rule.kind === "magic";
  const buffSum = (stat: "pad" | "mad") =>
    BUFFS.filter(buff => buff.stat === stat && group.buffs.includes(buff.id) && inLine(buff.id)).reduce((sum, buff) => sum + (chosenRow(buff.id)?.[stat] ?? 0), 0);

  const ammo = (data.gear.ammo ?? []).find(entry => entry.id === group.ammoId && entry.kind === AMMO_KIND[weapon.s]);
  const attack = (weapon.atk ?? 0) + (ammo?.atk ?? 0) + group.extra + buffSum("pad");
  const masteryId = masterySkillFor(weapon.s, job);
  const masteryM = masteryId !== null ? rowAt(data.skills.get(masteryId), levelOf(masteryId))?.M : undefined;
  const mastery = masteryM ? masteryM / 100 : NO_MASTERY;
  const stats = group.stats;

  let base: Range | null;
  let magicPower: number | null = null;
  let amp = 1;
  if (magic) {
    magicPower = stats.INT + (weapon.mag ?? 0) + group.extra + buffSum("mad");
    base = magicBase(stats.INT, magicPower, row.mad ?? 0, (row.M ?? 0) / 100);
    const ampId = AMP_SKILLS.find(id => inLine(id) && levelOf(id) > 0);
    if (ampId !== undefined) amp = (rowAt(data.skills.get(ampId), levelOf(ampId))?.y ?? 100) / 100;
  } else if (rule.kind === "lucky") base = luckySevenBase(stats, attack);
  else if (rule.kind === "dragonRoar") base = dragonRoarBase(stats, attack, mastery);
  else if (rule.kind === "arrowBomb") base = arrowBombBase(stats, attack);
  else base = rawPanel(weapon.s, stats, attack, mastery);
  if (!base) return { ok: false, reason: `${weapon.s}的攻擊力公式查不到` };

  const percent = isBasic ? 100 : row.damage ?? 100;
  const critKind = rule.crit ?? (isBasic ? (weapon.s === "拳套" ? "throw" : weapon.s === "弓" || weapon.s === "弩" ? "bow" : undefined) : undefined);
  const critFits = critKind === "throw" ? weapon.s === "拳套" : critKind === "bow" ? weapon.s === "弓" || weapon.s === "弩" : false;
  const critId = critKind && critFits ? CRIT_SKILL[critKind] : null;
  const critRow = critId !== null && inLine(critId) ? rowAt(data.skills.get(critId), levelOf(critId)) : null;
  const crit = critRow ? { rate: (critRow.prop ?? 0) / 100, bonus: (critRow.damage ?? 100) - 100 } : null;

  const charge = group.charge !== null ? CHARGES.find(entry => entry.id === group.charge && entry.weapons.includes(weapon.s) && inLine(entry.id)) : undefined;
  const chargeLevel = charge ? levelOf(charge.id) || (data.skills.get(charge.id)?.levels?.length ?? 0) : 0;
  const chargePercent = charge ? chosenRow(charge.id)?.damage ?? 100 : 100;

  const notes: string[] = [];
  if (rule.note) notes.push(rule.note);
  if (rule.pierce) notes.push("穿透的第二隻起每隻少一成（這裡寫第一隻）");
  if (ammo && ammo.kind !== "飛鏢") notes.push(`${ammo.kind}的攻擊力算進總攻擊只有私服資料，台服沒驗證`);

  const finalBase = { min: base.min, max: base.max };
  return {
    ok: true,
    name,
    magic,
    hits: hitsAt(rule, row),
    attack: magic ? 0 : attack,
    panel: magic ? null : panelRange(weapon.s, stats, attack, mastery),
    magicPower,
    critRate: crit?.rate ?? null,
    short: statShortfall(weapon, stats),
    notes,
    at(target) {
      const factors: Array<number | "immune"> = [amp];
      if (rule.element && target) factors.push(elementFactor(rule.element, target.el));
      if (charge) factors.push(chargeFactor(charge.element, chargeLevel, chargePercent, target?.el));
      const modifier = combineFactors(factors);
      const hitTarget = target ? { lv: target.lv ?? 0, pdd: target.pdd ?? 0, mdd: target.mdd ?? 0 } : null;
      const ignoreDefense = rule.ignoreDef === "always" || (rule.ignoreDef === "notHigher" && target !== null && group.level >= (target.lv ?? 0));
      const input = { base: finalBase, magic, modifier, ignoreDefense, charLevel: group.level, target: hitTarget };
      return {
        hit: hitRange({ ...input, multiplier: magic ? 1 : percent / 100 }),
        crit: crit ? hitRange({ ...input, multiplier: (percent + crit.bonus) / 100 }) : null,
      };
    },
  };
}

function pairOf(prepared: Prepared, target: Monster | null): HitPair {
  const { hit, crit } = prepared.at(target);
  return { hit, use: times(hit, prepared.hits), crit: crit ? { hit: crit, use: times(crit, prepared.hits) } : null };
}

/** 一組設定算成畫面要的一包：能力視窗、打木樁、打選的怪（扣防禦、幾次打死、必中命中）、一次期望 */
export function computeGroup(data: CalcData, shared: SharedConfig, group: GroupConfig, target: Monster | null): GroupResult {
  const prepared = prepare(data, shared, group);
  if (!prepared.ok) return prepared;
  const raw = pairOf(prepared, null);
  const rate = prepared.critRate ?? 0;
  const expectedOf = (pair: HitPair) => prepared.hits * expectedHit(pair.hit, pair.crit?.hit ?? null, rate);
  let vs: Extract<GroupResult, { ok: true }>["vs"] = null;
  if (target) {
    const pair = pairOf(prepared, target);
    const best = pair.crit ? pair.crit.use.max : pair.use.max;
    vs = {
      ...pair,
      kills: killCounts(target.hp, expectedOf(pair), best, pair.use.min),
      accuracy: prepared.magic ? null : sureHitAccuracy(group.level, target),
    };
  }
  const { at: _at, ...rest } = prepared;
  return { ...rest, raw, vs, expectedUse: vs ? expectedOf(vs) : expectedOf(raw) };
}

/* ------------------------------------------------------------------ 預設技能、兩組預設 */

/** 預設技能：技能點法在這個等級有點、武器用得了的攻擊技能裡，打木樁一次期望最高的；都沒有就普通攻擊（法師是第一個法術） */
export function defaultSkill(data: CalcData, job: number, group: GroupConfig): { skillId: number; skillLevel: number } {
  const ids = attackSkillIds(data.skills, job);
  let best: { skillId: number; skillLevel: number; value: number } | null = null;
  for (const id of ids) {
    const skillLevel = id === BASIC_ATTACK ? 1 : group.levels[id] ?? 0;
    if (skillLevel <= 0) continue;
    const result = computeGroup(data, { job, skillId: id, skillLevel, monsterId: null }, group, null);
    if (result.ok && (!best || result.expectedUse > best.value)) best = { skillId: id, skillLevel, value: result.expectedUse };
  }
  if (best) return { skillId: best.skillId, skillLevel: best.skillLevel };
  const first = ids[0] ?? BASIC_ATTACK;
  return { skillId: first, skillLevel: first === BASIC_ATTACK ? 1 : data.skills.get(first)?.levels?.length ?? 1 };
}

/**
 * 兩組預設：左＝首頁選的點法（沒選＝主推）；右＝第二套點法（有的話），沒有就同一套、等級拉到下一把武器、武器換那把，
 * 連下一把都沒有就跟左邊一樣。技能、怪物用左組算；預設怪可能是 null（這個等級沒有練功圖，等於不選怪）。
 */
export function defaultState(data: CalcData, job: number, level: number, buildTab: string | null): CalcState {
  const tabs = tabsFor(data.gear.rules, job);
  const leftTab = buildTab && tabs.some(entry => entry.tab === buildTab) ? buildTab : tabs[0]?.tab ?? null;
  const left = defaultGroup(data, job, level, leftTab);
  const otherTab = tabs.find(entry => entry.tab !== left.tab)?.tab;
  let right: GroupConfig;
  if (otherTab) right = defaultGroup(data, job, left.level, otherTab);
  else {
    const next = gearPlan(data.gear, job, left.level, data.beforeOpen, leftTab).next;
    right = next ? withWeapon(data, defaultGroup(data, job, Math.max(next.lv, left.level), leftTab), next) : structuredClone(left);
  }
  return { shared: { job, ...defaultSkill(data, job, left), monsterId: defaultMonster(data, job, left.level) }, groups: [left, right] };
}

function withWeapon(data: CalcData, group: GroupConfig, weapon: GearWeapon): GroupConfig {
  const ammo = defaultAmmo(data.gear.ammo ?? [], weapon.s, group.level, data.beforeOpen);
  return { ...group, weaponId: weapon.id, ammoId: ammo?.id ?? null };
}

/** 換點法、換等級：能力值、武器、彈藥、技能等級重設成那套那級的預設；其他攻擊、增益、充能留著 */
export function regroup(data: CalcData, job: number, group: GroupConfig, change: { tab?: string | null; level?: number }): GroupConfig {
  const fresh = defaultGroup(data, job, change.level ?? group.level, change.tab !== undefined ? change.tab : group.tab);
  return { ...fresh, extra: group.extra, buffs: group.buffs, charge: group.charge };
}

export function sameGroups(groups: [GroupConfig, GroupConfig]): boolean {
  return JSON.stringify(groups[0]) === JSON.stringify(groups[1]);
}

/* ------------------------------------------------------------------ 一下／兩下打死 */

export type KillEntry = { monster: Monster; v002: boolean; minUse: number };

/**
 * 一下打死＝這組用一次選的技能、扣完防禦的最低一次 ≥ HP；兩下＝最低一次×2 ≥ HP、不在一下那張。爆擊不算（要穩穩打死）。
 * 等級高到低，同等級 HP 高的先。這組算不出來（武器用不了、沒算的技能）回 null。
 */
export function killLists(data: CalcData, shared: SharedConfig, group: GroupConfig, choices: MonsterChoice[]): { one: KillEntry[]; two: KillEntry[] } | null {
  const prepared = prepare(data, shared, group);
  if (!prepared.ok) return null;
  const one: KillEntry[] = [];
  const two: KillEntry[] = [];
  for (const { monster, v002 } of choices) {
    const minUse = prepared.at(monster).hit.min * prepared.hits;
    if (minUse >= monster.hp) one.push({ monster, v002, minUse });
    else if (minUse * 2 >= monster.hp) two.push({ monster, v002, minUse });
  }
  const order = (a: KillEntry, b: KillEntry) => (b.monster.lv ?? 0) - (a.monster.lv ?? 0) || b.monster.hp - a.monster.hp || a.monster.id - b.monster.id;
  return { one: one.sort(order), two: two.sort(order) };
}

/** 「一般點法比全幸多約 3%」：大的比小的；差距四捨五入後是 0（不到 0.5%）寫「兩組差不多」；有一組算不出來不寫 */
export function diffText(labels: [string, string], a: GroupResult, b: GroupResult): string | null {
  if (!a.ok || !b.ok) return null;
  const [big, small, bigLabel, smallLabel] = a.expectedUse >= b.expectedUse ? [a, b, labels[0], labels[1]] : [b, a, labels[1], labels[0]];
  const percent = diffPercent(big.expectedUse, small.expectedUse);
  return percent < 1 ? "兩組差不多" : `${bigLabel}比${smallLabel}多約 ${percent}%`;
}
