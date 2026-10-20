/**
 * 傷害計算機（/plan/damage）的預設值與組裝：兩組的點法、武器、能力值、彈藥、技能等級怎麼來，
 * 一組設定怎麼算成畫面要的一包（computeGroup）、一下／兩下打死的怪（killLists）。
 * 公式在 damage.ts、技能表在 damage-skills.ts；點法、武器沿用 gear-view.ts 的 gearPlan（不改它）。
 * 測試在 __tests__/damage-view.test.ts（真資料）。
 */
import {
  combineFactors,
  chargeFactor,
  diffPercent,
  dragonRoarBase,
  elementFactor,
  expectedHit,
  healBase,
  hitRange,
  killCounts,
  knockbackBase,
  luckySevenBase,
  magicBase,
  magicSureHitAccuracy,
  NO_MASTERY,
  panelRange,
  rawPanel,
  sureHitAccuracy,
  type Element,
  type Range,
} from "./damage";
import {
  AMP_SKILLS,
  attackSkillIds,
  BASIC_ATTACK,
  BASIC_RULE,
  BOMB_IMPACT_PERCENT,
  BUFFS,
  CHARGES,
  CRIT_SKILL,
  HEAL,
  HEAL_TARGETS_MAX,
  hitsAt,
  masterySkillFor,
  NOT_CALCULATED,
  SKILL_RULES,
  skillRow,
} from "./damage-skills";
import { actionMs, BOOSTERS, boosterSteps, DRAGON_ROAR, dragonRoarStunMs, expPerSecond, fixedMs, MAGIC_TIER, skillBaseMs, type Booster } from "./damage-speed";
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
  /** 升級經驗表（guides/common.json 的 expTable.toNext）：[n]＝Lv.n 升到 n+1 要的經驗，算 10 分鐘經驗占這一級幾 % */
  expToNext: number[];
};

export type GroupConfig = {
  /** 點法標籤（「一般點法」「全幸」）；這個職業沒有第二套是 null */
  tab: string | null;
  /** 角色等級：兩組共用（畫面上放在最上面跟職業一起選），存在每組裡是為了計算方便，兩組永遠一樣 */
  level: number;
  weaponId: number | null;
  /** 武器攻擊（法師是武器魔攻）改過的值：衝卷後數值會飄；null＝照武器原本的數值 */
  weaponAtk: number | null;
  ammoId: number | null;
  /** 其他攻擊（法師是其他魔攻）：手套衝卷、其他裝備 */
  extra: number;
  stats: Record<StatKey, number>;
  /** 勾了的增益技能 id */
  buffs: number[];
  /** 白騎士充能技能 id */
  charge: number | null;
  /** 技能 id → 等級（精準、爆擊、魔力激發、增益、充能、加速用；預設照技能點法） */
  levels: Record<number, number>;
  /** 開加速（v0.87 使用者選 2A，預設開）：手上武器對得上的加速技能有學才有效 */
  booster: boolean;
};

export type SharedConfig = {
  job: number;
  skillId: number;
  skillLevel: number;
  monsterId: number | null;
  /** 群體治癒範圍內幾隻怪（v0.88 使用者選 3A，1～5，沒寫當 1）；其他技能用不到 */
  targets?: number;
};
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
export function defaultAmmo(ammo: GearAmmo[], weaponType: string, level: number): GearAmmo | null {
  const usable = ammoChoices(ammo, weaponType).filter(entry => entry.lv <= level);
  const sold = usable.filter(entry => entry.src.shops?.length);
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

const TIER_WORD: Record<number, string> = { 1: "一轉", 2: "二轉", 3: "三轉" };

/**
 * 等級打字（或換職業）時被夾回範圍的說明：比這個職業最低等級低→「三轉最低 70 等，已調成 70」、超過上限→「等級上限 120，已調成 120」；
 * 合法的回 null（不寫）。換職業時拿「換之前畫面上的等級」來問。
 */
export function levelNoticeText(job: number, level: number): string | null {
  const lowest = minLevelFor(job);
  if (level < lowest) return `${TIER_WORD[jobTier(job)] ?? ""}最低 ${lowest} 等，已調成 ${lowest}`;
  if (level > LEVEL_CAP) return `等級上限 ${LEVEL_CAP}，已調成 ${LEVEL_CAP}`;
  return null;
}

/** 一組的預設：gearPlan 的點法（含要湊的裝備）、主推武器、商店彈藥、技能點法的等級；其他攻擊 0、增益不勾 */
export function defaultGroup(data: CalcData, job: number, level: number, tab: string | null): GroupConfig {
  const lv = clampLevel(job, level);
  const plan = gearPlan(data.gear, job, lv, tab);
  const naked = plan.targets ?? { STR: 4, DEX: 4, INT: 4, LUK: 4 };
  const stats = plan.rule?.kit?.length && plan.targets ? kitStats(plan.rule.kit, lv, plan.targets).stats : naked;
  const weapon = plan.best;
  return {
    tab: plan.rule?.tab ?? null,
    level: lv,
    weaponId: weapon?.id ?? null,
    weaponAtk: null,
    ammoId: weapon ? defaultAmmo(data.gear.ammo ?? [], weapon.s, lv)?.id ?? null : null,
    extra: 0,
    stats: { ...stats },
    buffs: [],
    charge: null,
    levels: skillLevelsAt(job, lv, data.guides, data.skills).levels,
    booster: true,
  };
}

/** 這個職業一路上來、手上武器用得到的加速技能（法師是極速詠唱，不看武器）；沒有回 undefined */
export function boosterFor(data: CalcData, job: number, weaponType: string): Booster | undefined {
  const lineage = new Set(jobLineage(job));
  const magic = isMagicJob(job);
  return BOOSTERS.find(entry => lineage.has(data.skills.get(entry.id)?.job ?? -1) && (entry.weapons === "magic" ? magic : !magic && entry.weapons.includes(weaponType)));
}

/**
 * 預設怪：練功排行（planTraining，前 30 張）依序找，取第一張「主力怪在怪物選單裡」的圖的主力怪。
 * 跳過王圖（刷怪點 BOSS_SPAWN_MAX 個以下，跟 timeline.ts 同一條規則——巴洛古那種圖不是拿來練功的）。都沒有回 null。
 */
export function defaultMonster(data: CalcData, job: number, level: number): number | null {
  const byId = new Map(data.monsters.map(monster => [monster.id, monster]));
  for (const pick of planTraining({ job, level }, data.training, byId, 30)) {
    if (pick.row.sp <= BOSS_SPAWN_MAX || !pick.lead) continue;
    if (!choiceFor(pick.lead, data.maps)) continue;
    return pick.lead.id;
  }
  return null;
}

export type MonsterChoice = { monster: Monster };

/** 「HP 3,200・經驗 135」：打哪隻怪那格、名單的滑鼠提示、怪物小卡同一種寫法（v0.86 使用者要看得到） */
export function monsterStats(monster: Pick<Monster, "hp" | "exp">): string {
  return `HP ${monster.hp.toLocaleString()}・經驗 ${monster.exp.toLocaleString()}`;
}

/** 這隻怪在選單裡的樣子：出現在有中文名地圖的怪才有（不收錄、沒有等級的不收）；不收的回 null */
function choiceFor(monster: Monster, maps: Record<string, MapRecord>): MonsterChoice | null {
  if (monster.un || monster.lv === null) return null;
  const named = monster.maps.filter(id => maps[String(id)]?.zh);
  if (!named.length) return null;
  return { monster };
}

/** 怪物選單：出現在有中文名地圖的怪（不收錄、沒有等級的不列），依等級低到高 */
export function monsterChoices(monsters: Monster[], maps: Record<string, MapRecord>): MonsterChoice[] {
  return monsters
    .flatMap(monster => choiceFor(monster, maps) ?? [])
    .sort((a, b) => (a.monster.lv ?? 0) - (b.monster.lv ?? 0) || a.monster.id - b.monster.id);
}

/**
 * 兩組在結果卡、名單、「多約幾 %」裡的名字：點法不同寫點法、武器不同寫武器名、都一樣寫左組右組。
 * 上方分頁固定寫「左組／右組」（2026-10-12 使用者選 A），這裡是說明兩組差在哪。
 */
export function groupLabels(groups: [GroupConfig, GroupConfig], weapons: GearWeapon[]): [string, string] {
  const [a, b] = groups;
  if (a.tab && b.tab && a.tab !== b.tab) return [a.tab, b.tab];
  if (a.weaponId !== b.weaponId) {
    const name = (id: number | null) => weapons.find(weapon => weapon.id === id)?.n;
    const [nameA, nameB] = [name(a.weaponId), name(b.weaponId)];
    if (nameA && nameB && nameA !== nameB) return [nameA, nameB];
  }
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
  const { tab, level, weaponId, weaponAtk, ammoId, extra, stats, buffs, charge, levels, booster } = value;
  return (
    (tab === null || typeof tab === "string") &&
    isNum(level) && level >= 1 && level <= LEVEL_CAP &&
    isNumOrNull(weaponId) && isNumOrNull(ammoId) && isNumOrNull(charge) &&
    // 武器攻擊是 v0.82 才加的：舊版記下的沒有這欄，當作沒改
    (weaponAtk === undefined || isNumOrNull(weaponAtk)) &&
    // 開加速是 v0.87 才加的：舊版記下的沒有這欄，當作開著
    (booster === undefined || typeof booster === "boolean") &&
    isNum(extra) &&
    isRecord(stats) && STAT_KEY_LIST.every(key => isNum(stats[key])) &&
    Array.isArray(buffs) && buffs.every(isNum) &&
    isRecord(levels) && Object.values(levels).every(isNum)
  );
}

/** 共用的設定：職業要是經典版有的、技能 id 跟等級是數字、怪是數字或沒選（null） */
function isShared(value: unknown): value is SharedConfig {
  if (!isRecord(value)) return false;
  const { job, skillId, skillLevel, monsterId, targets } = value;
  // 群體治癒範圍內幾隻是 v0.88 才加的：沒有這欄照收，有的話要是 1～5 的整數
  const targetsOk = targets === undefined || (isNum(targets) && Number.isInteger(targets) && targets >= 1 && targets <= HEAL_TARGETS_MAX);
  return isNum(job) && jobOption(job) !== undefined && isNum(skillId) && isNum(skillLevel) && isNumOrNull(monsterId) && targetsOk;
}

/** 記在瀏覽紀錄裡的設定：壞掉、少欄位、型別不對都當沒記（回 null，畫面改用預設） */
export function parseState(raw: string | null): CalcState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isShared(parsed.shared)) return null;
    if (!Array.isArray(parsed.groups) || parsed.groups.length !== 2 || !parsed.groups.every(isGroup)) return null;
    const groups = parsed.groups.map(group => ({ ...group, weaponAtk: group.weaponAtk ?? null, booster: group.booster ?? true })) as [GroupConfig, GroupConfig];
    return { shared: parsed.shared, groups };
  } catch {
    return null;
  }
}

/**
 * 記下的設定裡的等級夾回這個職業的範圍、兩組統一用左組的（parseState 只看型別、不看轉職等級；暗殺者記成 10 級會畫出不存在的等級；
 * v0.82 起等級兩組共用，v0.79 記下的兩組可能不同）
 */
export function clampState(state: CalcState): CalcState {
  const level = clampLevel(state.shared.job, state.groups[0].level);
  return { ...state, groups: state.groups.map(group => ({ ...group, level })) as [GroupConfig, GroupConfig] };
}

/* ------------------------------------------------------------------ 算一組 */

export type Unready = { ok: false; reason: string };
export type HitPair = { hit: Range; use: Range; crit: { hit: Range; use: Range } | null };
/** 10 分鐘經驗、占這一級升級經驗的 %（滿等沒有下一級是 null） */
export type TenMinute = { exp: number; percent: number | null };

/** 每秒經驗換成 10 分鐘（v0.89 使用者：改 10 分鐘預估，% 照當前等級升級要的經驗） */
export function tenMinute(expPerSec: number, level: number, expToNext: number[]): TenMinute {
  const exp = expPerSec * 600;
  const need = expToNext[level];
  return { exp, percent: need ? (exp / need) * 100 : null };
}

/**
 * 出一招幾毫秒、用的攻速階（夾在 0～10，法師是施法的階）、有沒有算到加速；stun＝龍咆哮這一輪被自暈拉長（秒數跟攻速無關）；
 * fixed＝出手時間固定、不吃攻速（群體治癒）
 */
export type Speed = { ms: number; tier: number; boosted: boolean; stun: boolean; fixed: boolean };
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
      /** 看細節裡才寫的備註（公式出處、穿透、彈藥沒驗證） */
      notes: string[];
      /** 影響數字範圍、要在結果卡上直接看到的提醒（沒點精準技能，熟練度只有 10%）；不重複放進 notes */
      warnings: string[];
      /** 這把武器要幾等才拿得到（比角色等級高才有，結果卡的提醒用 levelNeededText 寫）；拿得到是 null */
      levelNeeded: number | null;
      /** 選了怪、招式（或白騎士充能）有屬性、怪對那個屬性有弱點／抗性／免疫時的說明：「火屬性打弱點 ×1.5」；其他 null */
      elementNote: string | null;
      /** 出一招幾毫秒；海盜、龍之獻祭查不到是 null（畫面寫 SPEED_UNKNOWN） */
      speed: Speed | null;
      /** 群體治癒（v0.88）：只打得到不死系、targets＝範圍內幾隻（每秒經驗每一隻都算） */
      heal: boolean;
      targets: number;
      /** 炸彈箭周圍每隻（v0.91 使用者選 A：另寫一行，選了怪照那隻怪扣防禦）；別的技能 null */
      splash: { percent: number; hit: Range } | null;
      /** 打木樁 */
      raw: HitPair;
      /** 打選的怪；沒選怪 null */
      /**
       * accuracy：要不 miss 命中要多少（物理看命中、法師看魔法命中，accuracyKind 分）；expPerSec：每秒經驗（只算打一隻，出手時間查不到是 null）；
       * tenMinute：10 分鐘經驗跟占這一級升級經驗的 %（畫面寫這個，v0.89）
       */
      vs:
        | (HitPair & {
            kills: { avg: number; fastest: number; slowest: number };
            accuracy: number;
            accuracyKind: "physical" | "magic";
            expPerSec: number | null;
            tenMinute: TenMinute | null;
          })
        | null;
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
  warnings: string[];
  levelNeeded: number | null;
  speed: Speed | null;
  heal: boolean;
  targets: number;
  /** 炸彈箭周圍那段的攻擊力 %（別的技能 null） */
  splashPercent: number | null;
  /** 這一招打出去的屬性（白騎士充能看充能的）；沒有屬性、群體治癒（神聖不乘）是 null */
  element: Element | null;
  at(target: Monster | null): { hit: Range; crit: Range | null; splash: Range | null };
  elementNote(target: Monster): string | null;
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
  // 群體治癒也是魔法（魔攻、扣魔防、魔法命中），只是基本傷害用自己那條公式
  const heal = rule.kind === "heal";
  const magic = rule.kind === "magic" || heal;
  const targets = heal ? shared.targets ?? 1 : 1;
  const buffSum = (stat: "pad" | "mad") =>
    BUFFS.filter(buff => buff.stat === stat && group.buffs.includes(buff.id) && inLine(buff.id)).reduce((sum, buff) => sum + (chosenRow(buff.id)?.[stat] ?? 0), 0);

  const ammo = (data.gear.ammo ?? []).find(entry => entry.id === group.ammoId && entry.kind === AMMO_KIND[weapon.s]);
  // 武器攻擊／魔攻：使用者改過（衝卷）用改過的，沒改照武器原本的。魔法技能改的是魔攻（算 magicPower），
  // 物理總攻擊照武器原本的攻擊——但法師只有魔法技能（沒有普通攻擊），這裡的 attack 實際用不到；畫面上「武器魔攻」用 isMagicJob 判斷，
  // 跟這裡的 rule.kind === "magic" 目前一定一致（法師的技能表全是 magic），以後法師有物理技能時兩邊要一起改
  const weaponPower = group.weaponAtk ?? (magic ? weapon.mag : weapon.atk) ?? 0;
  const attack = (magic ? weapon.atk ?? 0 : weaponPower) + (ammo?.atk ?? 0) + group.extra + buffSum("pad");
  const masteryId = masterySkillFor(weapon.s, job);
  const masteryM = masteryId !== null ? rowAt(data.skills.get(masteryId), levelOf(masteryId))?.M : undefined;
  const mastery = masteryM ? masteryM / 100 : NO_MASTERY;
  // 這把武器有對應的精準技能、但那個技能 0 級：熟練度只有 10%，下限會被壓得很低、範圍很寬——寫在結果卡上（精準技能不存在的一轉、法師不寫）
  const masteryName = masteryId !== null ? data.skills.get(masteryId)?.n : undefined;
  const warnings: string[] = [];
  // 等級兩組共用後，右組「換下一把武器」常常是還拿不到的那把：照樣算，但寫在結果卡上
  const levelNeeded = weapon.lv > group.level ? weapon.lv : null;
  if (levelNeeded !== null) warnings.push(levelNeededText(levelNeeded));
  if (masteryId !== null && masteryName && levelOf(masteryId) <= 0) {
    warnings.push(`沒點${masteryName}，熟練度只有 10%（下限會很低，可在下面「技能等級」改）`);
  }
  const stats = group.stats;

  let base: Range | null;
  let magicPower: number | null = null;
  let amp = 1;
  if (magic) {
    magicPower = stats.INT + weaponPower + group.extra + buffSum("mad");
    if (heal) base = healBase(stats.INT, stats.LUK, magicPower, targets, row.hp ?? 0);
    else {
      base = magicBase(stats.INT, magicPower, row.mad ?? 0, (row.M ?? 0) / 100);
      const ampId = AMP_SKILLS.find(id => inLine(id) && levelOf(id) > 0);
      if (ampId !== undefined) amp = (rowAt(data.skills.get(ampId), levelOf(ampId))?.y ?? 100) / 100;
    }
  } else if (rule.kind === "lucky") base = luckySevenBase(stats, attack);
  else if (rule.kind === "dragonRoar") base = dragonRoarBase(stats, attack, mastery);
  else if (rule.kind === "knockback") base = knockbackBase(stats, attack);
  else base = rawPanel(weapon.s, stats, attack, mastery);
  if (!base) return { ok: false, reason: `${weapon.s}的攻擊力公式查不到` };

  // 炸彈箭：主數字是被射中那隻（普通弓×50%，不看技能等級）；周圍那段是 x%（splashPercent）
  const bomb = rule.kind === "bombArrow";
  const percent = isBasic ? 100 : bomb ? BOMB_IMPACT_PERCENT : row.damage ?? 100;
  const splashPercent = bomb ? row.x ?? 0 : null;
  const critKind = rule.crit ?? (isBasic ? (weapon.s === "拳套" ? "throw" : weapon.s === "弓" || weapon.s === "弩" ? "bow" : undefined) : undefined);
  const critFits = critKind === "throw" ? weapon.s === "拳套" : critKind === "bow" ? weapon.s === "弓" || weapon.s === "弩" : false;
  const critId = critKind && critFits ? CRIT_SKILL[critKind] : null;
  const critRow = critId !== null && inLine(critId) ? rowAt(data.skills.get(critId), levelOf(critId)) : null;
  const crit = critRow ? { rate: (critRow.prop ?? 0) / 100, bonus: (critRow.damage ?? 100) - 100 } : null;

  const charge = group.charge !== null ? CHARGES.find(entry => entry.id === group.charge && entry.weapons.includes(weapon.s) && inLine(entry.id)) : undefined;
  const chargeLevel = charge ? levelOf(charge.id) || (data.skills.get(charge.id)?.levels?.length ?? 0) : 0;
  const chargePercent = charge ? chosenRow(charge.id)?.damage ?? 100 : 100;

  // 出一招幾毫秒（v0.87）：法師固定 6 階、物理看武器攻速；開了加速、而且手上武器對得上的加速技能有學才快
  const booster = boosterFor(data, job, weapon.s);
  const steps = booster && group.booster ? boosterSteps(booster, levelOf(booster.id)) : 0;
  // 物理武器沒有攻速資料就當查不到（不自己假設 6 階）；法師不看武器
  const weaponTier = magic ? MAGIC_TIER : weapon.spd;
  const baseMs = weaponTier === undefined ? null : skillBaseMs(isBasic ? BASIC_ATTACK : shared.skillId, weapon.s, Math.max(1, shared.skillLevel));
  const tier = Math.min(10, Math.max(0, (weaponTier ?? MAGIC_TIER) - steps));
  const action = baseMs === null ? null : actionMs(baseMs, tier);
  // 龍咆哮放完會自暈，一輪是動作跟自暈取長的
  const stunMs = shared.skillId === DRAGON_ROAR ? dragonRoarStunMs(Math.max(1, shared.skillLevel)) : 0;
  const fixed = isBasic ? undefined : fixedMs(shared.skillId);
  const speed: Speed | null =
    fixed !== undefined
      ? { ms: fixed, tier: MAGIC_TIER, boosted: false, stun: false, fixed: true }
      : action === null
        ? null
        : { ms: Math.max(action, stunMs), tier, boosted: steps > 0, stun: stunMs > action, fixed: false };

  const notes: string[] = [];
  if (rule.note) notes.push(rule.note);
  if (rule.pierce) notes.push("穿透的第二隻起每隻少一成（這裡寫第一隻）");
  if (bomb) {
    notes.push(`被射中那隻照舊版算普通弓的 50%（2011 年的攻略寫改版後也是 ${splashPercent}%，台服用哪一版查不到）；周圍最多 5 隻各吃 ${splashPercent}%；爆擊整段乘霸王箭的倍率（滿級 ×2）；終極之弓追加沒算`);
  }
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
    warnings,
    levelNeeded,
    speed,
    heal,
    targets,
    splashPercent,
    element: heal ? null : charge?.element ?? rule.element ?? null,
    elementNote(target) {
      // 群體治癒算不算神聖屬性各說各話（v0.88 使用者選 4A：不乘），打怕神聖的怪寫一行
      if (heal) return target.el?.h === "w" ? HEAL_HOLY_NOTE : null;
      // 白騎士充能看充能的屬性（倍數只寫打弱點／抗性那一段，充能本身的殺傷力 % 另外算）；其他看招式自己的屬性
      const element = charge?.element ?? rule.element;
      if (!element) return null;
      const factor = charge
        ? ratioOf(chargeFactor(charge.element, chargeLevel, chargePercent, target.el), chargeFactor(charge.element, chargeLevel, chargePercent, undefined))
        : elementFactor(element, target.el);
      return elementNoteText(element, factor);
    },
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
        // 炸彈箭的爆擊整段乘爆擊倍率（滿級 ×2，三個來源一致），別的技能是攻擊力 % 加上爆擊加成
        crit: crit ? hitRange({ ...input, multiplier: bomb ? (percent / 100) * ((crit.bonus + 100) / 100) : (percent + crit.bonus) / 100 }) : null,
        splash: splashPercent !== null ? hitRange({ ...input, multiplier: splashPercent / 100 }) : null,
      };
    },
  };
}

/** 群體治癒打怕神聖的怪（不乘，寫出來讓人知道可能更高） */
export const HEAL_HOLY_NOTE = "牠怕神聖屬性：如果群體治癒算神聖，再 ×1.5";
/** 群體治癒結果卡的假設那一行（研究裡各說各話的部分照多數來源選） */
export const HEAL_ASSUMPTION = "群體治癒：舊版玩家整理的公式，台服沒驗證；恢復力先乘再扣魔防、只算自己（組隊時隊友也佔一格，每隻更低）";
/** 選了群體治癒、怪不是不死系 */
export const HEAL_UNDEAD_ONLY = "群體治癒只打得到不死系的怪";

/** 屬性的寫法照客戶端：火屬性、冰屬性、雷屬性、毒屬性、神聖屬性 */
const ELEMENT_WORD: Record<Element, string> = { f: "火屬性", i: "冰屬性", l: "雷屬性", p: "毒屬性", h: "神聖屬性" };

/** 充能打這隻怪的倍數 ÷ 打普通怪的倍數（只留弱點／抗性那一段）；免疫照樣是免疫 */
function ratioOf(factor: number | "immune", normal: number | "immune"): number | "immune" {
  if (factor === "immune" || normal === "immune") return "immune";
  return normal === 0 ? 1 : factor / normal;
}

/** 「火屬性打弱點 ×1.5」「火屬性打抗性 ×0.5」「火屬性對牠無效，每下只剩 1」；倍數是 1 不寫（回 null） */
export function elementNoteText(element: Element, factor: number | "immune"): string | null {
  const word = ELEMENT_WORD[element];
  if (factor === "immune") return `${word}對牠無效，每下只剩 1`;
  const shown = Number(factor.toFixed(2));
  if (shown > 1) return `${word}打弱點 ×${shown}`;
  if (shown < 1) return `${word}打抗性 ×${shown}`;
  return null;
}

/** 毫秒寫成秒：720 →「0.72」、2000 →「2」 */
export function secondsText(ms: number): string {
  return String(Number((ms / 1000).toFixed(2)));
}

/** 10 分鐘經驗：取整加千分位（經驗 0 的怪寫 0） */
export function tenMinuteExpText(value: number): string {
  return Math.round(Math.max(0, value)).toLocaleString();
}

/** 「10 分鐘約 26,250 經驗，Lv.50 升級經驗的 3.7%」；滿等沒有下一級就不寫 %（計算機結果卡、首頁照傷害算的推薦同一句） */
export function tenMinuteText(value: TenMinute, level: number): string {
  const head = `10 分鐘約 ${tenMinuteExpText(value.exp)} 經驗`;
  return value.percent === null ? head : `${head}，Lv.${level} 升級經驗的 ${levelPercentText(value.percent)}`;
}

/** 占這一級幾 %：10 以上取整、以下一位小數、太小寫「不到 0.1%」 */
export function levelPercentText(percent: number): string {
  if (percent >= 10) return `${Math.round(percent)}%`;
  if (percent >= 0.1) return `${Number(percent.toFixed(1))}%`;
  return "不到 0.1%";
}

/** 「要 Lv.60 才拿得到（照樣算）」：結果卡（warnings）跟分頁裡武器下面用同一句 */
export function levelNeededText(level: number): string {
  return `要 Lv.${level} 才拿得到（照樣算）`;
}

function pairOf(prepared: Prepared, target: Monster | null): HitPair {
  const { hit, crit } = prepared.at(target);
  return { hit, use: times(hit, prepared.hits), crit: crit ? { hit: crit, use: times(crit, prepared.hits) } : null };
}

/** 一組設定算成畫面要的一包：能力視窗、打木樁、打選的怪（扣防禦、幾次打死、必中命中）、一次期望 */
export function computeGroup(data: CalcData, shared: SharedConfig, group: GroupConfig, target: Monster | null): GroupResult {
  const prepared = prepare(data, shared, group);
  if (!prepared.ok) return prepared;
  if (prepared.heal && target && !target.und) return { ok: false, reason: HEAL_UNDEAD_ONLY };
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
      accuracy: prepared.magic ? magicSureHitAccuracy(group.level, target) : sureHitAccuracy(group.level, target),
      accuracyKind: prepared.magic ? "magic" : "physical",
      expPerSec: null,
      tenMinute: null,
    };
    // 每秒經驗（v0.87 使用者選 1A：範圍技能也只算打一隻）；群體治癒的隻數是使用者自己選的、傷害也照隻數攤，範圍內每一隻都算
    if (prepared.speed) {
      vs.expPerSec = expPerSecond(target.exp, vs.kills.avg, prepared.speed.ms, prepared.targets);
      vs.tenMinute = tenMinute(vs.expPerSec, group.level, data.expToNext);
    }
  }
  const { at: _at, elementNote: _note, element: _element, splashPercent, ...rest } = prepared;
  const splashHit = prepared.at(target).splash;
  const splash = splashPercent !== null && splashHit ? { percent: splashPercent, hit: splashHit } : null;
  return { ...rest, raw, vs, splash, elementNote: target ? prepared.elementNote(target) : null, expectedUse: vs ? expectedOf(vs) : expectedOf(raw) };
}

/* ------------------------------------------------------------------ 預設技能、兩組預設 */

/** 預設技能：技能點法在這個等級有點、武器用得了的攻擊技能裡，打木樁一次期望最高的；都沒有就普通攻擊（法師是第一個法術） */
export function defaultSkill(data: CalcData, job: number, group: GroupConfig): { skillId: number; skillLevel: number } {
  const ids = attackSkillIds(data.skills, job);
  let best: { skillId: number; skillLevel: number; value: number } | null = null;
  for (const id of ids) {
    // 群體治癒只打得到不死系，不當預設
    if (id === HEAL) continue;
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
 * 兩組預設：左＝首頁選的點法（沒選＝主推）；右＝第二套點法（有的話），沒有就同一套、同等級、武器換下一把
 * （v0.82 起等級兩組共用，下一把常常還拿不到，結果卡會寫「要 Lv.N 才拿得到」），連下一把都沒有就跟左邊一樣。
 * 技能、怪物用左組算；預設怪可能是 null（這個等級沒有練功圖，等於不選怪）。
 */
export function defaultState(data: CalcData, job: number, level: number, buildTab: string | null): CalcState {
  const tabs = tabsFor(data.gear.rules, job);
  const leftTab = buildTab && tabs.some(entry => entry.tab === buildTab) ? buildTab : tabs[0]?.tab ?? null;
  const left = defaultGroup(data, job, level, leftTab);
  const right = rightGroup(data, job, left, defaultGroup(data, job, left.level, otherTabOf(data, job, left.tab) ?? leftTab));
  return { shared: { job, ...defaultSkill(data, job, left), monsterId: defaultMonster(data, job, left.level) }, groups: [left, right] };
}

/** 這個職業另一套點法的標籤；沒有第二套回 undefined */
function otherTabOf(data: CalcData, job: number, tab: string | null): string | undefined {
  return tabsFor(data.gear.rules, job).find(entry => entry.tab !== tab)?.tab;
}

/** 右組：有第二套點法就是 candidate（那套的預設）；沒有就同一套換下一把武器，連下一把都沒有就跟左組一樣 */
function rightGroup(data: CalcData, job: number, left: GroupConfig, candidate: GroupConfig): GroupConfig {
  if (otherTabOf(data, job, left.tab)) return candidate;
  const next = gearPlan(data.gear, job, left.level, left.tab).next;
  return next ? withWeapon(data, candidate, next) : { ...candidate, weaponId: left.weaponId, ammoId: left.ammoId, weaponAtk: left.weaponAtk };
}

function withWeapon(data: CalcData, group: GroupConfig, weapon: GearWeapon): GroupConfig {
  const ammo = defaultAmmo(data.gear.ammo ?? [], weapon.s, Math.max(group.level, weapon.lv));
  return { ...group, weaponId: weapon.id, weaponAtk: null, ammoId: ammo?.id ?? null };
}

/** 換點法、換等級：能力值、武器、彈藥、技能等級重設成那套那級的預設；其他攻擊、增益、充能、開加速留著 */
export function regroup(data: CalcData, job: number, group: GroupConfig, change: { tab?: string | null; level?: number }): GroupConfig {
  const fresh = defaultGroup(data, job, change.level ?? group.level, change.tab !== undefined ? change.tab : group.tab);
  return { ...fresh, extra: group.extra, buffs: group.buffs, charge: group.charge, booster: group.booster };
}

/**
 * 換等級（等級在最上面、兩組共用）：兩組各自照自己的點法重設成那一級的預設（regroup），右組照預設的規則再挑一次武器；
 * 技能等級跟著技能點法在新等級點到的級數（沒點到留原本的）；怪是舊等級的預設怪才跟著換，自己選的留著。等級夾在職業範圍。
 */
export function relevel(data: CalcData, state: CalcState, level: number): CalcState {
  const { job } = state.shared;
  const lv = clampLevel(job, level);
  const left = regroup(data, job, state.groups[0], { level: lv });
  const right = rightGroup(data, job, left, regroup(data, job, state.groups[1], { level: lv }));
  const oldDefault = defaultMonster(data, job, state.groups[0].level);
  let monsterId = state.shared.monsterId === oldDefault ? defaultMonster(data, job, lv) : state.shared.monsterId;
  // 群體治癒跟著預設怪換到不是不死系的怪時，改挑這一級的不死系
  if (state.shared.skillId === HEAL && monsterId !== state.shared.monsterId && !data.monsters.find(monster => monster.id === monsterId)?.und) {
    monsterId = undeadDefault(monsterChoices(data.monsters, data.maps), lv);
  }
  const skillLevel = left.levels[state.shared.skillId] || state.shared.skillLevel;
  return { shared: { ...state.shared, skillLevel, monsterId }, groups: [left, right] };
}

/**
 * 群體治癒的預設怪：不死系裡等級不超過角色、最高的那隻（同等級取選單裡排後面的）；都比角色高就挑最低的。
 * 整張圖最多 BOSS_SPAWN_MAX 隻的（殭屍蘑菇王這種王、冥界幽靈這種迴避 999 的稀有怪）
 * 不自動挑——跟練功排行跳過王圖同一條規則；手動還是選得到。沒有不死系回 null。
 */
export function undeadDefault(choices: MonsterChoice[], level: number): number | null {
  const open = choices.filter(choice => choice.monster.und);
  const common = open.filter(choice => !choice.monster.sp?.length || Math.max(...choice.monster.sp.map(([, count]) => count)) > BOSS_SPAWN_MAX);
  const undead = common.length ? common : open;
  if (!undead.length) return null;
  const reachable = undead.filter(choice => (choice.monster.lv ?? 0) <= level);
  return (reachable.length ? reachable[reachable.length - 1] : undead[0]).monster.id;
}

/** 改共用設定：換成群體治癒、選的怪不是不死系（或沒選）時，順便換成 undeadDefault；其他照改 */
export function withSkill(state: CalcState, patch: Partial<SharedConfig>, choices: MonsterChoice[]): CalcState {
  const shared = { ...state.shared, ...patch };
  if (patch.skillId === HEAL && !choices.find(choice => choice.monster.id === shared.monsterId)?.monster.und) {
    shared.monsterId = undeadDefault(choices, state.groups[0].level);
  }
  return { ...state, shared };
}

/** 網址帶 ?mob=<id>（練功測速的怪物卡連過來）：選單裡有這隻就換成它，沒有就照原本的 */
export function withMonster(state: CalcState, data: CalcData, mobId: number): CalcState {
  const ok = monsterChoices(data.monsters, data.maps).some(choice => choice.monster.id === mobId);
  return ok ? { ...state, shared: { ...state.shared, monsterId: mobId } } : state;
}

export function sameGroups(groups: [GroupConfig, GroupConfig]): boolean {
  return JSON.stringify(groups[0]) === JSON.stringify(groups[1]);
}

/* ------------------------------------------------------------------ 一下／兩下打死 */

/** minUse：最低一次（不爆擊）；midUse：最高跟最低的中間值一次（不爆擊） */
export type KillEntry = { monster: Monster; minUse: number; midUse: number };
/** element：這一招的屬性（名單上「只看怕這個屬性的怪」按鈕用），沒有屬性是 null */
export type KillLists = { one: KillEntry[]; two: KillEntry[]; nearOne: KillEntry[]; nearTwo: KillEntry[]; element: Element | null };

/**
 * 一下打死＝這組用一次選的技能、扣完防禦的最低一次 ≥ HP；兩下＝最低一次×2 ≥ HP、不在一下那張。爆擊不算（要穩穩打死）。
 * 差一點（2026-10-12 使用者追加，選 B 分一下、兩下）＝用最高跟最低的中間值算一下（中間值 ≥ HP）或兩下（中間值×2 ≥ HP）打得死、
 * 但最低傷害在那個下數打不死的（運氣好才打得死）：差一點一下排除一下打死的、差一點兩下排除一下／兩下打死跟差一點一下的；
 * 所以同一隻可能同時在「兩下打死」跟「差一點一下」（穩穩兩下、運氣好一下）。
 * 每張都是等級高到低，同等級 HP 高的先。這組算不出來（武器用不了、沒算的技能）回 null。
 */
export function killLists(data: CalcData, shared: SharedConfig, group: GroupConfig, choices: MonsterChoice[]): KillLists | null {
  const prepared = prepare(data, shared, group);
  if (!prepared.ok) return null;
  const lists: KillLists = { one: [], two: [], nearOne: [], nearTwo: [], element: prepared.element };
  // 群體治癒只打得到不死系（v0.88 使用者：只顯示群體治癒打到的怪）
  for (const { monster } of prepared.heal ? choices.filter(choice => choice.monster.und) : choices) {
    const { hit } = prepared.at(monster);
    const entry = { monster, minUse: hit.min * prepared.hits, midUse: ((hit.min + hit.max) / 2) * prepared.hits };
    const { hp } = monster;
    if (entry.minUse >= hp) lists.one.push(entry);
    else if (entry.minUse * 2 >= hp) lists.two.push(entry);
    // 差一點照下數各自排除「那個下數已經穩穩打得死」的：中間值一下打得死、最低一下打不死的，就算最低兩下穩死也列進「差一點一下」
    // （穩穩兩下、運氣好一下）。不這樣排，雙飛斬這種上限是下限兩倍的技能，「差一點一下」永遠是空的（2026-10-12 實測）
    if (entry.minUse < hp && entry.midUse >= hp) lists.nearOne.push(entry);
    else if (entry.minUse * 2 < hp && entry.midUse * 2 >= hp) lists.nearTwo.push(entry);
  }
  const order = (a: KillEntry, b: KillEntry) => (b.monster.lv ?? 0) - (a.monster.lv ?? 0) || b.monster.hp - a.monster.hp || a.monster.id - b.monster.id;
  return { one: lists.one.sort(order), two: lists.two.sort(order), nearOne: lists.nearOne.sort(order), nearTwo: lists.nearTwo.sort(order), element: lists.element };
}

/** 「只看怕這個屬性的怪」（v0.90）：on 而且招式有屬性時，四張都只留弱那個屬性的怪（順序不變）；否則原樣回 */
export function weakFilter(lists: KillLists, on: boolean): KillLists {
  const element = lists.element;
  if (!on || !element) return lists;
  const weak = (list: KillEntry[]) => list.filter(entry => entry.monster.el?.[element] === "w");
  return { ...lists, one: weak(lists.one), two: weak(lists.two), nearOne: weak(lists.nearOne), nearTwo: weak(lists.nearTwo) };
}

/** 屬性的字：「火屬性」「神聖屬性」（名單按鈕跟結果卡同一套） */
export function elementWord(element: Element): string {
  return ELEMENT_WORD[element];
}

/** 「一般點法比全幸多約 3%」：大的比小的；差距四捨五入後是 0（不到 0.5%）寫「兩組差不多」；有一組算不出來不寫 */
export function diffText(labels: [string, string], a: GroupResult, b: GroupResult): string | null {
  if (!a.ok || !b.ok) return null;
  const [big, small, bigLabel, smallLabel] = a.expectedUse >= b.expectedUse ? [a, b, labels[0], labels[1]] : [b, a, labels[1], labels[0]];
  const percent = diffPercent(big.expectedUse, small.expectedUse);
  return percent < 1 ? "兩組差不多" : `${bigLabel}比${smallLabel}多約 ${percent}%`;
}
