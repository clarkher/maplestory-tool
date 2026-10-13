// src/lib/speed/party-exp.ts
import type { Monster, TrainingRow } from "@/lib/types";

/**
 * 組隊經驗（spec「10/13 改」）。出處：Artale 組隊經驗計算機 https://artale-tools.archie-design.app/tools/party-exp-calculator
 * （頁面寫 2026-08-08 實機驗證；台服沒驗證，畫面要標）。
 * - 白字：打到的人＝怪經驗×20%＋怪經驗×80%×自己等級÷有效隊員等級加總；吸經驗的人只有後半段
 * - 黃字＝白字×組隊加成（有效隊員 2～6 人 +10／20／30／40／50%，使用者 10/13 選 A）
 * - 有效隊員：跟打怪的人等級差 ≤ 5，或自己等級 ≥ 怪物等級 − 5（原文「符合任一條件」，「目標隊員」解讀成打怪的人）
 * - 沒算：祈禱、經驗卷、活動、多人一起打的輸出比例、怪物等級差懲罰（假設一隻怪只有一個人打）
 */
export const PARTY_BONUS = [0, 0, 0.1, 0.2, 0.3, 0.4, 0.5];

export type Member = { level: number; hitter: boolean };
export type MemberExp = { level: number; hitter: boolean; effective: boolean; white: number; bonus: number; total: number };

export function isEffective(level: number, hitterLevel: number, mobLevel: number): boolean {
  return Math.abs(level - hitterLevel) <= 5 || level >= mobLevel - 5;
}

export function killExp(mobExp: number, mobLevel: number, members: Member[]): MemberExp[] {
  const hitter = members.find(member => member.hitter) ?? members[0];
  const effective = members.map(member => member.hitter || isEffective(member.level, hitter.level, mobLevel));
  const count = effective.filter(Boolean).length;
  const levelSum = members.reduce((sum, member, i) => sum + (effective[i] ? member.level : 0), 0);
  const bonus = PARTY_BONUS[Math.min(count, PARTY_BONUS.length - 1)] ?? 0;
  return members.map((member, i) => {
    const share = effective[i] && levelSum ? 0.8 * (member.level / levelSum) : 0;
    const white = mobExp * ((member.hitter ? 0.2 : 0) + share);
    return { level: member.level, hitter: member.hitter, effective: effective[i], white, bonus, total: white * (1 + bonus) };
  });
}

export type MapPartyExp = { perKill: number[]; mobs: Array<{ id: number; spawns: number; exp: MemberExp[] }> };

/** 這張圖每隻怪每個隊員拿多少，跟平均每隻（照刷怪點數加權）；沒有經驗資料的怪不算 */
export function mapPartyExp(row: TrainingRow, monsters: Map<number, Monster>, members: Member[]): MapPartyExp {
  const mobs: MapPartyExp["mobs"] = [];
  for (const [id, spawns] of row.mobs) {
    const monster = monsters.get(id);
    if (!monster || !monster.exp) continue;
    mobs.push({ id, spawns, exp: killExp(monster.exp, monster.lv ?? 0, members) });
  }
  const totalSpawns = mobs.reduce((sum, mob) => sum + mob.spawns, 0);
  const perKill = members.map((_, i) => (totalSpawns ? mobs.reduce((sum, mob) => sum + mob.spawns * mob.exp[i].total, 0) / totalSpawns : 0));
  return { perKill, mobs };
}

/** 用自己量到的 10 分鐘經驗回推：全隊 10 分鐘打幾隻、每個隊員 10 分鐘各拿多少。自己每隻拿 0（吸不到）時回 null */
export function backCalc(myPer10: number, perKill: number[], self = 0): { kills: number; per10: number[] } | null {
  const mine = perKill[self];
  if (!mine) return null;
  const kills = myPer10 / mine;
  return { kills, per10: perKill.map(value => kills * value) };
}

export function membersOf(selfLevel: number, party: { on: boolean; others: number[]; hitter: number }): Member[] {
  if (!party.on || !party.others.length) return [{ level: selfLevel, hitter: true }];
  const hitter = party.hitter >= 0 && party.hitter <= party.others.length ? party.hitter : 0;
  return [selfLevel, ...party.others].map((level, i) => ({ level, hitter: i === hitter }));
}
