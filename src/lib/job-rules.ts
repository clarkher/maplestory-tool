/**
 * 職業規則：哪些職業打哪些怪特別快、哪些圖不該推。
 * 用戶 2026-10-05 拍板：僧侶 31～70 只推不死系（群體治癒補得到）；火毒照遊戲資料擋掉抗火的圖；冰雷怕冰／雷加分。
 * 怪的屬性來自 monsters.json：und＝不死系；el 的鍵 f 火、i 冰、l 雷、p 毒、h 聖，值 w 弱、r 抗、i 免疫。
 */
import type { Monster } from "./types";

export type JobFit = {
  /** false＝這張圖不推給這個職業 */
  ok: boolean;
  /** 排序係數，1 是不加不減 */
  factor: number;
  /** 卡片上寫的職業專屬理由 */
  note?: string;
  /** 額外提醒（例：僧侶治癒還沒點滿） */
  warn?: string;
};

const NEUTRAL: JobFit = { ok: true, factor: 1 };

/** 二轉、三轉同一條線用同一套規則：211 → 210 */
function branchOf(stage: number): number {
  return Math.floor(stage / 10) * 10;
}

/** 刷怪點裡符合條件的怪佔幾成（依刷怪點數加權） */
export function spawnShare(mobs: Array<[number, number]>, monsters: Map<number, Monster>, test: (monster: Monster) => boolean): number {
  const total = mobs.reduce((sum, [, count]) => sum + count, 0);
  if (!total) return 0;
  const hit = mobs.reduce((sum, [id, count]) => {
    const monster = monsters.get(id);
    return sum + (monster && test(monster) ? count : 0);
  }, 0);
  return hit / total;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

export function jobFit(stage: number, level: number, mobs: Array<[number, number]>, monsters: Map<number, Monster>): JobFit {
  const branch = branchOf(stage);

  if (branch === 230 && level >= 31 && level <= 70) {
    const undead = spawnShare(mobs, monsters, monster => Boolean(monster.und));
    if (undead < 0.3) return { ok: false, factor: 0, note: "沒有不死系，群體治癒打不到" };
    return {
      ok: true,
      factor: undead,
      note: `不死系佔 ${percent(undead)}，群體治癒補得到`,
      ...(level <= 39 ? { warn: "主流點法 40 等才把群體治癒點滿，這幾級組隊比較順" } : {}),
    };
  }

  if (branch === 210) {
    const weak = spawnShare(mobs, monsters, monster => monster.el?.f === "w" || monster.el?.p === "w");
    const resist = spawnShare(mobs, monsters, monster => monster.el?.f === "r" || monster.el?.f === "i");
    if (resist >= 0.5) return { ok: false, factor: 0, note: "怪抗火，火焰箭傷害打折" };
    return { ok: true, factor: 1 + 0.6 * weak - 0.8 * resist, ...(weak >= 0.3 ? { note: "怪怕火／毒" } : {}) };
  }

  if (branch === 220) {
    const weak = spawnShare(mobs, monsters, monster => monster.el?.i === "w" || monster.el?.l === "w");
    const resist = spawnShare(mobs, monsters, monster => monster.el?.i === "r" || monster.el?.i === "i");
    if (resist >= 0.5) return { ok: false, factor: 0, note: "怪抗冰，冰雷傷害打折" };
    return { ok: true, factor: 1 + 0.6 * weak - 0.8 * resist, ...(weak >= 0.3 ? { note: "怪怕冰／雷" } : {}) };
  }

  return NEUTRAL;
}
