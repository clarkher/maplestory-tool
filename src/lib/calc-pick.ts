/**
 * 我的路線「照傷害算的推薦」（v0.92，使用者拍板 1A 2A 3A 4A）：用傷害計算機的預設角色、武器 +7（100% 卷 7 張），
 * 單體職業推三隻不同的怪：先放「差一點兩下」打得死的，不夠再用穩穩兩下的補（v0.94 使用者「單體的放三隻」）；
 * 群體技能分三段：約 2～3、3～4、4～5 下打死各推一隻、不重複（v0.94 使用者，取代 v0.93 的 4～8 下）。
 * 每隻怪挑牠當主力的練功圖裡刷怪效率最高那張。
 * 規格 docs/superpowers/specs/2026-10-13-route-calc-pick-design.md；測試 __tests__/calc-pick.test.ts。
 * 圖的篩選跟主推卡（now-plan.ts mainPick）同一套：楓之島照角色、有中文名、不是王圖、通過職業規則、城鎮走得到。
 */
import { attackSkillIds, BASIC_ATTACK, HEAL, isAoeSkill, SKILL_RULES } from "./damage-skills";
import {
  computeGroup,
  defaultState,
  killLists,
  monsterChoices,
  type CalcData,
  type GroupConfig,
  type SharedConfig,
  type TenMinute,
} from "./damage-view";
import { isMagicJob, type GearWeapon } from "./gear";
import { jobFit } from "./job-rules";
import { stageJob } from "./jobs";
import { BOSS_SPAWN_MAX, townRoute } from "./now-plan";
import { dangerPenalty, levelFit } from "./planner";
import { isIslandMap, onIsland, spawnIndex } from "./route-planner";
import type { Monster, PortalEdge, TrainingRow } from "./types";

/** 武器衝幾張 100% 卷（每張 +1；武器都是 7 次衝卷） */
export const CALC_PICK_PLUS = 7;
/** 怪的等級最多比角色高這麼多（跟主推卡「練得動」同一個門檻） */
const CAP_REACH = 5;
/** 從最近城鎮要走這麼多張圖以上，排序打七折（跟主推卡一樣） */
const FAR_HOPS = 8;
/** 單體推幾隻怪 */
const SINGLE_ROWS = 3;
/**
 * 群體分三段：約幾次打死在這個範圍各推一隻（v0.94 使用者「全體攻擊型列出 2～3、3～4、4～5 個別推薦的怪」；
 * 原本 v0.92 是 5～6 下、v0.93 放寬到 4～8 下）
 */
export const AOE_TIERS: Array<[number, number]> = [[2, 3], [3, 4], [4, 5]];

/** nearTwo＝差一點兩下、two＝穩穩兩下（單體）；aoe＝群體的一段（約 N 下） */
export type CalcGoal = "nearTwo" | "two" | "aoe";

export type CalcPickOption = {
  map: number;
  title: string;
  row: TrainingRow;
  /** [怪物 id, 刷怪點數]，多的在前 */
  mobs: Array<[number, number]>;
  /** 圖上刷怪最多、符合條件的那隻 */
  lead: Monster;
  /** 打這隻約幾次打死 */
  kills: number;
  /** 10 分鐘經驗跟占這一級的 %（出手時間查不到是 null） */
  tenMinute: TenMinute | null;
  hops?: number;
  town?: number;
  boat?: boolean;
};

/** 卡上的一行：label 是「差一點兩下」「穩穩兩下」「2～3 下」；這一段找不到圖 option 是 null（只有群體會有空的段） */
export type CalcPickRow = { label: string; goal: CalcGoal; option: CalcPickOption | null };

export type CalcPick = {
  mode: "single" | "aoe";
  skillId: number;
  skillName: string;
  weapon: GearWeapon;
  /** 武器加了幾點（衝了幾張 100% 卷） */
  plus: number;
  /** 算的時候用的設定（卡上「用傷害計算機看」、測試對答案用） */
  shared: SharedConfig;
  group: GroupConfig;
  rows: CalcPickRow[];
  /** rows 裡有圖的那幾張（照行的順序） */
  options: CalcPickOption[];
};

/**
 * 卡上那句：「雙飛斬差一點兩下打死（運氣好兩下）」「雙飛斬穩穩兩下打死」「群體治癒約 6 下打死」；
 * 炸彈箭的下數是照被射中那隻（普通弓 50%）算的，後面寫明（周圍那幾隻吃得比較多）
 */
export function goalText(pick: Pick<CalcPick, "skillName" | "skillId"> & { goal: CalcGoal }, kills: number): string {
  if (pick.goal === "nearTwo") return `${pick.skillName}差一點兩下打死（運氣好兩下）`;
  if (pick.goal === "two") return `${pick.skillName}穩穩兩下打死`;
  const bomb = SKILL_RULES[pick.skillId]?.kind === "bombArrow" ? "（照被射中那隻算）" : "";
  return `${pick.skillName}約 ${kills} 下打死${bomb}`;
}

/** 學到的攻擊技能裡、打木樁一次期望最高的那招（only 篩哪幾招）；都算不出來回 null */
function bestSkill(data: CalcData, shared: SharedConfig, group: GroupConfig, ids: number[]): { skillId: number; skillLevel: number } | null {
  let best: { skillId: number; skillLevel: number; value: number } | null = null;
  for (const id of ids) {
    const skillLevel = id === BASIC_ATTACK ? 1 : group.levels[id] ?? 0;
    if (skillLevel <= 0) continue;
    const result = computeGroup(data, { ...shared, skillId: id, skillLevel, monsterId: null }, group, null);
    if (result.ok && (!best || result.expectedUse > best.value)) best = { skillId: id, skillLevel, value: result.expectedUse };
  }
  return best && { skillId: best.skillId, skillLevel: best.skillLevel };
}

export function calcPick(args: {
  data: CalcData;
  job: number;
  level: number;
  /** 首頁選的點法（全幸、裝備法）；沒選 null */
  buildTab: string | null;
  graph: Record<string, PortalEdge[]>;
  nearestTown: Record<string, [number, number]>;
}): CalcPick | null {
  const { data, job, level, buildTab, graph, nearestTown } = args;
  if (job <= 0) return null;
  const state = defaultState(data, job, level, buildTab);
  const base = state.groups[0];
  const weapon = data.gear.weapons.find(entry => entry.id === base.weaponId);
  if (!weapon) return null;
  const plus = Math.min(CALC_PICK_PLUS, weapon.tuc ?? CALC_PICK_PLUS);
  const group: GroupConfig = { ...base, weaponAtk: ((isMagicJob(job) ? weapon.mag : weapon.atk) ?? 0) + plus };

  // 單體／群體（2A）：學到一次打 3 隻以上的技能就用群體（強弓、強弩是擊退用，不拿來當練功那一招）
  const ids = attackSkillIds(data.skills, job);
  const aoe = bestSkill(data, state.shared, group, ids.filter(id => isAoeSkill(id) && SKILL_RULES[id]?.kind !== "knockback"));
  const single = aoe ? null : bestSkill(data, state.shared, group, ids.filter(id => !isAoeSkill(id) && id !== HEAL));
  // 技能點法還沒點任何攻擊技能（法師 8～12 等）：不拿最高等級的技能硬算，這張卡不出
  const chosen = aoe ?? single;
  if (!chosen) return null;
  const shared: SharedConfig = { job, ...chosen, monsterId: null };
  const skillName = chosen.skillId === BASIC_ATTACK ? "普通攻擊" : data.skills.get(chosen.skillId)?.n ?? "技能";

  // 圖：刷怪最多那隻是 targets 裡的怪、跟主推卡同一套篩選（含 planTraining 的等級適配、太危險的圖不列），照刷怪效率排（3A）
  const stage = stageJob(job, level);
  const index = new Map(data.monsters.map(monster => [monster.id, monster]));
  const spawns = spawnIndex(data.monsters);
  const island = onIsland(job, level);
  // 每隻符合條件的怪 → 牠當主力、刷怪效率最高的那張圖；照分數高到低回傳（同一隻怪只留一張）
  const mapsFor = (targets: Set<number>): CalcPickOption[] => {
    const found: Array<{ option: Omit<CalcPickOption, "kills" | "tenMinute">; score: number }> = [];
    for (const row of data.training) {
      const record = data.maps[String(row.m)];
      if (isIslandMap(row.m) !== island || !record?.zh || row.sp <= BOSS_SPAWN_MAX || (data.beforeOpen && record.o)) continue;
      // 跟 planTraining 一樣：地圖等級差太多、圖上最高等的怪高你 12 級以上（石巨人插在弓箭手村迷宮那種）都不列
      if (levelFit(level, row.lv) <= 0.05 || dangerPenalty(level, row.lvMax) <= 0.2) continue;
      const mobs = spawns.get(row.m) ?? [];
      const lead = mobs[0] ? index.get(mobs[0][0]) : undefined;
      if (!lead || !targets.has(lead.id)) continue;
      if (!jobFit(stage, level, mobs, index).ok) continue;
      const route = townRoute(row.m, graph, data.maps, nearestTown, island);
      if (route.hops === undefined) continue;
      found.push({ option: { map: row.m, title: record.zh, row, mobs, lead, ...route }, score: row.eff * (route.hops >= FAR_HOPS ? 0.7 : 1) });
    }
    found.sort((a, b) => b.score - a.score);
    const seen = new Set<number>();
    const best: CalcPickOption[] = [];
    for (const { option } of found) {
      if (seen.has(option.lead.id)) continue;
      seen.add(option.lead.id);
      const result = computeGroup(data, shared, group, option.lead);
      const vs = result.ok ? result.vs : null;
      best.push({ ...option, kills: vs?.kills.avg ?? 0, tenMinute: vs?.tenMinute ?? null });
    }
    return best;
  };

  // 符合條件的怪：選單裡的怪、10/15 前跳過只在 V002 的、不比角色高 5 級以上
  const choices = monsterChoices(data.monsters, data.maps).filter(choice => !(data.beforeOpen && choice.v002) && (choice.monster.lv ?? 0) <= level + CAP_REACH);
  const rows: CalcPickRow[] = [];
  if (aoe) {
    // 群體：約 2～5 下打死的怪都先找圖，再一段一段挑（2～3 下先挑；3、4 下兩段都符合的怪不重複，被前一段挑走就換下一隻）
    const targets = new Set<number>();
    const [low, high] = [AOE_TIERS[0][0], AOE_TIERS[AOE_TIERS.length - 1][1]];
    for (const { monster } of choices) {
      if (chosen.skillId === HEAL && !monster.und) continue;
      const result = computeGroup(data, shared, group, monster);
      const kills = result.ok && result.vs ? result.vs.kills.avg : 0;
      if (kills >= low && kills <= high) targets.add(monster.id);
    }
    const candidates = mapsFor(targets);
    const used = new Set<number>();
    for (const [from, to] of AOE_TIERS) {
      const option = candidates.find(entry => entry.kills >= from && entry.kills <= to && !used.has(entry.lead.id)) ?? null;
      if (option) used.add(option.lead.id);
      rows.push({ label: `${from}～${to} 下`, goal: "aoe", option });
    }
  } else {
    // 單體：差一點兩下的怪先放，不夠三隻用穩穩兩下的補（同一隻怪不重複）
    const lists = killLists(data, shared, group, choices);
    const near = lists ? mapsFor(new Set(lists.nearTwo.map(entry => entry.monster.id))) : [];
    const steady = lists ? mapsFor(new Set(lists.two.map(entry => entry.monster.id))) : [];
    for (const option of near) {
      if (rows.length >= SINGLE_ROWS) break;
      rows.push({ label: "差一點兩下", goal: "nearTwo", option });
    }
    for (const option of steady) {
      if (rows.length >= SINGLE_ROWS) break;
      if (rows.some(row => row.option?.lead.id === option.lead.id)) continue;
      rows.push({ label: "穩穩兩下", goal: "two", option });
    }
  }
  const options = rows.flatMap(row => (row.option ? [row.option] : []));
  return { mode: aoe ? "aoe" : "single", skillId: chosen.skillId, skillName, weapon, plus, shared, group, rows, options };
}
