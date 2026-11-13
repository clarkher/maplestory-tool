/**
 * 楓葉武器適合哪些職業、用到幾等（攻略文 /guides/maple-leaf-weapon-jobs，v2.18）。
 * 用傷害計算機的預設角色（defaultState）打木樁：楓葉武器衝完（武器攻擊 +12，懶人包平均 +11.6 取整）
 * 跟同等級拿得到最好的乾淨武器（weaponChoices：商店、打怪掉、任務、製作）比每秒傷害；出手時間查不到的（海盜）比一下的傷害。
 * 文章裡的數字由 __tests__/leaf-weapons.test.ts 用這裡重算對答案，資料更新、公式改了測試會紅。
 */
import { computeGroup, defaultState, weaponChoices, type CalcData } from "./damage-view";
import { canWear, type GearWeapon } from "./gear";
import { tabsFor } from "./gear-view";

/** 楓葉商會的 19 把楓葉武器 */
export const LEAF_WEAPON_IDS = [1302020, 1302030, 1412011, 1422014, 1432012, 1442024, 1382009, 1382012, 1452016, 1452022, 1462014, 1462019, 1472030, 1472032, 1332025, 1482020, 1482021, 1492020, 1492021];

/** 懶人包走完的平均（+11.6）取整 */
export const LEAF_SCROLL_BONUS = 12;

/** 比到幾等（三轉以後技能、武器都換一輪，另外看） */
export const LEAF_LEVELS = { from: 35, to: 70 };

/** 二轉職業：文章一個職業一列 */
export const LEAF_JOBS = [110, 120, 130, 210, 220, 230, 310, 320, 410, 420, 510, 520];

type Item = { id: number; n: string; s: string; eq?: { reqLevel?: number; incPAD?: number; incMAD?: number; attackSpeed?: number; reqJob?: number; tuc?: number } };

/** 楓葉武器沒有任何取得管道，gear.json 裡沒有：從 items.json 補成 GearWeapon（來源寫楓葉商會，讓 weaponChoices 收得進來） */
export function leafGear(items: Item[]): GearWeapon[] {
  return LEAF_WEAPON_IDS.map(id => {
    const item = items.find(entry => entry.id === id);
    if (!item?.eq) throw new Error(`items.json 沒有楓葉武器 ${id}`);
    const eq = item.eq;
    return {
      id, n: item.n, s: item.s, lv: eq.reqLevel ?? 0, atk: eq.incPAD, mag: eq.incMAD, spd: eq.attackSpeed, job: eq.reqJob ?? 0, tuc: eq.tuc ?? 7,
      src: { shops: [{ p: "楓葉商會", n: "楓葉商會招牌", m: 100000000, pr: 0 }] },
    } as GearWeapon;
  });
}

export type LeafLevel = { lv: number; ratio: number; otherId: number; otherName: string };
export type LeafRow = { id: number; name: string; perLevel: LeafLevel[]; /** 衝完不輸同等級最好的乾淨武器到幾等；LEAF_LEVELS.to 代表比到最後都不輸 */ until: number | null };
/** tab＝計算機的點法（全幸、裝備法…）；只有一套點法的職業是 null */
export type LeafJob = { job: number; tab: string | null; weapons: LeafRow[] };

/** 差不到 0.5% 當打平 */
const TIE = 0.995;

/**
 * 每個職業的每一套點法各算一次（盜賊一般／全幸、法師全智／裝備法）：對手只算那套點法那一級的能力值（含要湊的裝備）穿得上的。
 * 楓葉武器沒有能力值需求，全幸、全智穿不上別的武器時差距就拉大。
 */
export function leafWeaponReport(base: CalcData, items: Item[]): LeafJob[] {
  const leaf = leafGear(items);
  const leafIds = new Set(LEAF_WEAPON_IDS);
  const data: CalcData = { ...base, gear: { ...base.gear, weapons: [...base.gear.weapons, ...leaf] } };
  return LEAF_JOBS.flatMap(job => {
    const tabs = tabsFor(data.gear.rules, job).map(entry => entry.tab);
    return (tabs.length ? tabs : [null]).map(tab => leafJob(data, leafIds, job, tab));
  });
}

function leafJob(data: CalcData, leafIds: Set<number>, job: number, tab: string | null): LeafJob {
  const choices = weaponChoices(data.gear, job);
  const magic = job >= 200 && job < 300;
  const mine = choices.filter(weapon => leafIds.has(weapon.id));
  const rows = mine.map(weapon => ({ id: weapon.id, name: weapon.n, perLevel: [] as LeafLevel[], until: null as number | null }));
  for (let lv = LEAF_LEVELS.from; lv <= LEAF_LEVELS.to; lv++) {
    const state = defaultState(data, job, lv, tab);
    const stats = state.groups[0].stats;
    const score = (weapon: GearWeapon, bonus: number) => {
      const atk = (magic ? weapon.mag : weapon.atk) ?? 0;
      const result = computeGroup(data, state.shared, { ...state.groups[0], weaponId: weapon.id, weaponAtk: atk + bonus }, null);
      if (!result.ok) return null;
      return result.speed ? (result.expectedUse * 1000) / result.speed.ms : result.expectedUse;
    };
    let best: { weapon: GearWeapon; value: number } | null = null;
    for (const weapon of choices) {
      // 這套點法這一級穿不上的不算（全智穿不上要幸運的杖、全幸穿不上要敏捷的拳套）
      if (leafIds.has(weapon.id) || weapon.lv > lv || !canWear(weapon, stats)) continue;
      const value = score(weapon, 0);
      if (value !== null && (!best || value > best.value)) best = { weapon, value };
    }
    if (!best) continue;
    mine.forEach((weapon, index) => {
      if (weapon.lv > lv) return;
      const value = score(weapon, LEAF_SCROLL_BONUS);
      if (value === null) return;
      rows[index].perLevel.push({ lv, ratio: value / best.value, otherId: best.weapon.id, otherName: best.weapon.n });
    });
  }
  for (const row of rows) {
    const lose = row.perLevel.find(level => level.ratio < TIE);
    row.until = lose ? (lose.lv > row.perLevel[0].lv ? lose.lv - 1 : null) : LEAF_LEVELS.to;
  }
  return { job, tab, weapons: rows };
}

/** 比例寫成文章用的字：強 38%／差 6%／打平（差不到 1%） */
export function ratioText(ratio: number): string {
  const percent = Math.round((ratio - 1) * 100);
  if (percent === 0) return "打平";
  return percent > 0 ? `強 ${percent}%` : `差 ${-percent}%`;
}

/** 用到幾等寫成字：比到最後都不輸寫「70 以上」 */
export function untilText(until: number | null): string {
  if (until === null) return "不建議";
  return until >= LEAF_LEVELS.to ? `${LEAF_LEVELS.to} 以上` : `${until} 等`;
}

/** 某一級的比例；那一級還拿不到（武器等級不夠）回 null */
export function ratioAt(row: LeafRow, lv: number): number | null {
  return row.perLevel.find(level => level.lv === lv)?.ratio ?? null;
}
