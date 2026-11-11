/**
 * 傷害計算機每個職業各記一份（src/lib/damage-store.ts）：2026-11-11 使用者要「每個職業設定過的數值都分開存本地」
 */
import { describe, expect, it } from "vitest";
import { parseDamageStore, recallJob, rememberJob } from "@/lib/damage-store";
import type { CalcState } from "@/lib/damage-view";

const group = (level: number) => ({
  tab: null,
  level,
  weaponId: 1472000,
  weaponAtk: 30,
  ammoId: null,
  extra: 0,
  stats: { STR: 4, DEX: 25, INT: 4, LUK: 80 },
  buffs: [],
  charge: null,
  levels: { 4001344: 20 },
  booster: true,
});
const state = (job: number, level: number): CalcState => ({
  shared: { job, skillId: 4001344, skillLevel: 20, monsterId: null },
  groups: [group(level), group(level)],
});

function memory(initial: Record<string, string> = {}) {
  const items = { ...initial };
  return { getItem: (key: string) => items[key] ?? null, setItem: (key: string, value: string) => void (items[key] = value), items };
}

describe("每個職業各記一份", () => {
  it("刺客、法師各存各的，存了法師不會蓋掉刺客", () => {
    const storage = memory();
    rememberJob(storage, state(410, 50));
    rememberJob(storage, state(210, 40));
    expect(recallJob(storage, 410)?.groups[0].level).toBe(50);
    expect(recallJob(storage, 210)?.groups[0].level).toBe(40);
  });
  it("同一個職業再存一次就換成新的", () => {
    const storage = memory();
    rememberJob(storage, state(410, 50));
    rememberJob(storage, state(410, 51));
    expect(recallJob(storage, 410)?.groups[0].level).toBe(51);
  });
  it("沒記過、存壞了、型別不對都當沒記", () => {
    expect(recallJob(memory(), 410)).toBeNull();
    expect(recallJob(memory({ "ms-damage": "{壞掉" }), 410)).toBeNull();
    expect(recallJob(memory({ "ms-damage": JSON.stringify({ 410: { shared: 1 } }) }), 410)).toBeNull();
  });
  it("存在 410 底下的卻是別的職業：不拿來用", () => {
    expect(recallJob(memory({ "ms-damage": JSON.stringify({ 410: state(210, 40) }) }), 410)).toBeNull();
  });
  it("等級夾回職業範圍（三轉記成 50 讀出來是 70）", () => {
    const storage = memory({ "ms-damage": JSON.stringify({ 411: state(411, 50) }) });
    expect(recallJob(storage, 411)?.groups[0].level).toBe(70);
  });
  it("沒有 localStorage、瀏覽器不讓讀寫：不壞，當沒記", () => {
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(() => rememberJob(broken, state(410, 50))).not.toThrow();
    expect(recallJob(broken, 410)).toBeNull();
    expect(recallJob(null, 410)).toBeNull();
  });
  it("parseDamageStore 只留看得懂的那幾個職業", () => {
    const raw = JSON.stringify({ 410: state(410, 50), 210: "亂寫", abc: state(410, 50) });
    expect(Object.keys(parseDamageStore(raw))).toEqual(["410"]);
  });
});
