// src/lib/speed/__tests__/party-exp.test.ts
import { describe, expect, it } from "vitest";
import { backCalc, isEffective, killExp, mapPartyExp, membersOf, PARTY_BONUS } from "../party-exp";
import type { Monster, TrainingRow } from "@/lib/types";

function mob(id: number, lv: number | null, exp: number): Monster {
  return { id, n: `怪${id}`, lv, exp, hp: 100, pad: 0, pdd: 0, mad: 0, mdd: 0, acc: 0, eva: 0, spd: 0, maps: [1], drops: [] };
}

function row(mobs: [number, number, number][]): TrainingRow {
  return { m: 1, sp: mobs.reduce((sum, [, spawns]) => sum + spawns, 0), exp1: 0, hp: 0, eff: 0, resp: 7, lv: 30, lvMin: 30, lvMax: 30, mobs };
}

describe("PARTY_BONUS", () => {
  it("索引＝有效隊員人數：0、1 人沒有加成，2～6 人 +10～50%", () => {
    expect(PARTY_BONUS).toEqual([0, 0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  });
});

describe("isEffective", () => {
  it("跟打怪的人等級差 5 以內算有效，6 以上不算", () => {
    expect(isEffective(35, 40, 100)).toBe(true);
    expect(isEffective(45, 40, 100)).toBe(true);
    expect(isEffective(34, 40, 100)).toBe(false);
    expect(isEffective(46, 40, 100)).toBe(false);
  });

  it("自己等級 ≥ 怪物等級 − 5 也算有效（就算跟打的人差很多）", () => {
    expect(isEffective(35, 70, 40)).toBe(true);
    expect(isEffective(34, 70, 40)).toBe(false);
  });
});

describe("killExp", () => {
  it("單練：全拿、沒有組隊加成", () => {
    const [self] = killExp(100, 30, [{ level: 30, hitter: true }]);
    expect(self.total).toBeCloseTo(100);
    expect(self.white).toBeCloseTo(100);
    expect(self.bonus).toBe(0);
    expect(self.effective).toBe(true);
    expect(self.hitter).toBe(true);
    expect(self.level).toBe(30);
  });

  it("兩人同級（30、30）打 30 級怪、自己打：白字 60／40，加成 0.1 後 66／44", () => {
    const [self, mate] = killExp(100, 30, [{ level: 30, hitter: true }, { level: 30, hitter: false }]);
    expect(self.white).toBeCloseTo(60);
    expect(mate.white).toBeCloseTo(40);
    expect(self.bonus).toBe(0.1);
    expect(mate.bonus).toBe(0.1);
    expect(self.total).toBeCloseTo(66);
    expect(mate.total).toBeCloseTo(44);
    expect(mate.hitter).toBe(false);
  });

  it("隊友打：自己吸經驗只拿後半段", () => {
    const [self, mate] = killExp(100, 30, [{ level: 30, hitter: false }, { level: 30, hitter: true }]);
    expect(self.white).toBeCloseTo(40);
    expect(mate.white).toBeCloseTo(60);
    expect(self.total).toBeCloseTo(44);
    expect(mate.total).toBeCloseTo(66);
  });

  it("三人（40 打、38、20）打 40 級怪：20 級的不是有效隊員，拿 0，不算進加總跟人數", () => {
    const [hitter, near, far] = killExp(100, 40, [
      { level: 40, hitter: true },
      { level: 38, hitter: false },
      { level: 20, hitter: false },
    ]);
    expect(far.effective).toBe(false);
    expect(far.white).toBe(0);
    expect(far.total).toBe(0);
    expect(hitter.effective).toBe(true);
    expect(near.effective).toBe(true);
    // 有效 2 人 → 加成 0.1
    expect(hitter.bonus).toBe(0.1);
    expect(near.bonus).toBe(0.1);
    expect(hitter.white).toBeCloseTo(100 * (0.2 + (0.8 * 40) / 78));
    expect(near.white).toBeCloseTo(100 * ((0.8 * 38) / 78));
    expect(hitter.total).toBeCloseTo(100 * (0.2 + (0.8 * 40) / 78) * 1.1);
    expect(near.total).toBeCloseTo(100 * ((0.8 * 38) / 78) * 1.1);
  });

  it("吸經驗的人等級 ≥ 怪 − 5 但跟打的人差很多（打 70、吸 36、怪 40）→ 有效", () => {
    const [hitter, absorber] = killExp(100, 40, [{ level: 70, hitter: true }, { level: 36, hitter: false }]);
    expect(absorber.effective).toBe(true);
    expect(absorber.white).toBeCloseTo(100 * ((0.8 * 36) / 106));
    expect(hitter.white).toBeCloseTo(100 * (0.2 + (0.8 * 70) / 106));
    expect(hitter.bonus).toBe(0.1);
  });

  it("沒標誰打時，第一個人當打怪的人", () => {
    const [first, second] = killExp(100, 30, [{ level: 30, hitter: false }, { level: 30, hitter: false }]);
    expect(first.effective).toBe(true);
    expect(second.effective).toBe(true);
    expect(first.white).toBeCloseTo(40);
    expect(second.white).toBeCloseTo(40);
  });

  it("6 人以上加成最多 0.5，索引不會超出", () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ level: 30, hitter: i === 0 }));
    expect(killExp(100, 30, six)[0].bonus).toBe(0.5);
    const eight = Array.from({ length: 8 }, (_, i) => ({ level: 30, hitter: i === 0 }));
    const result = killExp(100, 30, eight);
    expect(result).toHaveLength(8);
    expect(result[0].bonus).toBe(0.5);
    expect(result[7].bonus).toBe(0.5);
  });

  it("輸出順序跟 members 一樣", () => {
    const result = killExp(100, 30, [
      { level: 31, hitter: false },
      { level: 30, hitter: true },
      { level: 32, hitter: false },
    ]);
    expect(result.map(entry => entry.level)).toEqual([31, 30, 32]);
    expect(result.map(entry => entry.hitter)).toEqual([false, true, false]);
  });
});

describe("mapPartyExp", () => {
  const solo = [{ level: 30, hitter: true }];

  it("兩種怪（刷怪點 3、1）：perKill 是照刷怪點加權的平均", () => {
    const monsters = new Map([[1, mob(1, 30, 100)], [2, mob(2, 30, 200)]]);
    const result = mapPartyExp(row([[1, 3, 0], [2, 1, 0]]), monsters, solo);
    expect(result.perKill).toHaveLength(1);
    expect(result.perKill[0]).toBeCloseTo((3 * 100 + 1 * 200) / 4);
    expect(result.mobs.map(entry => [entry.id, entry.spawns])).toEqual([[1, 3], [2, 1]]);
    expect(result.mobs[0].exp[0].total).toBeCloseTo(100);
  });

  it("組隊時每個隊員各自一個加權平均", () => {
    const monsters = new Map([[1, mob(1, 30, 100)], [2, mob(2, 30, 200)]]);
    const result = mapPartyExp(row([[1, 3, 0], [2, 1, 0]]), monsters, [
      { level: 30, hitter: true },
      { level: 30, hitter: false },
    ]);
    // 自己 0.6×1.1、隊友 0.4×1.1
    expect(result.perKill[0]).toBeCloseTo(((3 * 100 + 200) / 4) * 0.6 * 1.1);
    expect(result.perKill[1]).toBeCloseTo(((3 * 100 + 200) / 4) * 0.4 * 1.1);
  });

  it("沒經驗資料的怪略過（不在圖鑑、經驗 0）", () => {
    const monsters = new Map([[1, mob(1, 30, 100)], [3, mob(3, 30, 0)]]);
    const result = mapPartyExp(row([[1, 1, 0], [2, 5, 0], [3, 5, 0]]), monsters, solo);
    expect(result.mobs.map(entry => entry.id)).toEqual([1]);
    expect(result.perKill[0]).toBeCloseTo(100);
  });

  it("整張圖都沒有經驗資料 → perKill 全是 0", () => {
    const result = mapPartyExp(row([[9, 2, 0]]), new Map(), [{ level: 30, hitter: true }, { level: 30, hitter: false }]);
    expect(result.mobs).toEqual([]);
    expect(result.perKill).toEqual([0, 0]);
  });

  it("怪物等級不明（lv null）時等級當 0，仍然算得出來", () => {
    const monsters = new Map([[1, mob(1, null, 100)]]);
    const result = mapPartyExp(row([[1, 1, 0]]), monsters, solo);
    expect(result.perKill[0]).toBeCloseTo(100);
  });
});

describe("backCalc", () => {
  it("myPer10 600、perKill [60, 40] → 全隊 10 分鐘 10 隻，各拿 600、400", () => {
    const result = backCalc(600, [60, 40]);
    expect(result).not.toBeNull();
    expect(result!.kills).toBeCloseTo(10);
    expect(result!.per10[0]).toBeCloseTo(600);
    expect(result!.per10[1]).toBeCloseTo(400);
  });

  it("可以指定自己是第幾個隊員", () => {
    const result = backCalc(400, [60, 40], 1);
    expect(result!.kills).toBeCloseTo(10);
    expect(result!.per10[0]).toBeCloseTo(600);
  });

  it("自己每隻拿 0（吸不到）→ null", () => {
    expect(backCalc(600, [0, 40])).toBeNull();
    expect(backCalc(600, [])).toBeNull();
    expect(backCalc(600, [60, 40], 5)).toBeNull();
  });
});

describe("membersOf", () => {
  it("沒勾組隊 → 只有自己、自己打", () => {
    expect(membersOf(50, { on: false, others: [48, 52], hitter: 1 })).toEqual([{ level: 50, hitter: true }]);
  });

  it("勾了組隊但沒填隊友 → 只有自己、自己打", () => {
    expect(membersOf(50, { on: true, others: [], hitter: 0 })).toEqual([{ level: 50, hitter: true }]);
  });

  it("hitter 0 ＝ 自己打", () => {
    expect(membersOf(50, { on: true, others: [48, 52], hitter: 0 })).toEqual([
      { level: 50, hitter: true },
      { level: 48, hitter: false },
      { level: 52, hitter: false },
    ]);
  });

  it("hitter 2 → 第二個隊友打", () => {
    expect(membersOf(50, { on: true, others: [48, 52], hitter: 2 })).toEqual([
      { level: 50, hitter: false },
      { level: 48, hitter: false },
      { level: 52, hitter: true },
    ]);
  });

  it("hitter 超出範圍 → 自己打", () => {
    for (const hitter of [3, 99, -1]) {
      const members = membersOf(50, { on: true, others: [48, 52], hitter });
      expect(members.map(member => member.hitter)).toEqual([true, false, false]);
    }
  });
});
