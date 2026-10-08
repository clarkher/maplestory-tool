/**
 * 技能表：真資料常駐檢查（跟 gear-realdata.test.ts 同一招直接讀 public/data）——
 * skills.json 裡經典版職業每個有 damage 或 mad 的技能，都要在技能表裡（算、或列為沒算／增益／充能／爆擊被動），
 * 遊戲資料進來新技能沒處理就紅。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AMP_SKILLS,
  BASIC_ATTACK,
  BUFFS,
  CHARGES,
  CRIT_SKILL,
  NOT_CALCULATED,
  SKILL_RULES,
  attackSkillIds,
  hitsAt,
  masterySkillFor,
  notCalculatedFor,
} from "@/lib/damage-skills";
import { JOB_OPTIONS } from "@/lib/jobs";
import type { Skill } from "@/lib/types";

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const skillList = JSON.parse(fs.readFileSync(`${DATA}skills.json`, "utf8")) as Skill[];
const skills = new Map(skillList.map(skill => [skill.id, skill]));
const classicJobs = new Set(JOB_OPTIONS.map(job => job.id));

describe("真資料：每個攻擊技能都有處理", () => {
  const handled = new Set<number>([
    ...Object.keys(SKILL_RULES).map(Number),
    ...Object.keys(NOT_CALCULATED).map(Number),
    ...BUFFS.map(buff => buff.id),
    ...CHARGES.map(charge => charge.id),
    CRIT_SKILL.throw,
    CRIT_SKILL.bow,
  ]);
  const attacking = skillList.filter(skill => classicJobs.has(skill.job) && skill.levels?.some(row => row.damage || row.mad));
  it.each(attacking.map(skill => [skill.id, skill.n] as const))("%s %s", id => {
    expect(handled.has(id)).toBe(true);
  });
  it("技能表裡的 id 都存在、而且不會同時算又列為沒算", () => {
    for (const id of Object.keys(SKILL_RULES).map(Number)) {
      expect(skills.has(id), String(id)).toBe(true);
      expect(NOT_CALCULATED[id], String(id)).toBeUndefined();
    }
  });
  it("增益、充能、魔力激發、爆擊被動的 id 都存在", () => {
    for (const id of [...BUFFS.map(b => b.id), ...CHARGES.map(c => c.id), ...AMP_SKILLS, CRIT_SKILL.throw, CRIT_SKILL.bow]) {
      expect(skills.has(id), String(id)).toBe(true);
    }
  });
});

describe("下數照台服技能說明", () => {
  it("雙飛斬 2、四連箭 4、3連發 3、魔力爪 2、昇龍拳 2，其餘 1", () => {
    expect(hitsAt(SKILL_RULES[4001344], undefined)).toBe(2);
    expect(hitsAt(SKILL_RULES[3111006], undefined)).toBe(4);
    expect(hitsAt(SKILL_RULES[5210000], undefined)).toBe(3);
    expect(hitsAt(SKILL_RULES[2001005], undefined)).toBe(2);
    expect(hitsAt(SKILL_RULES[5101003], undefined)).toBe(2);
    expect(hitsAt(SKILL_RULES[1001004], undefined)).toBe(1);
  });
  it("迴旋斬看該級 attackCount", () => {
    const savage = skills.get(4201005)!;
    expect(hitsAt(SKILL_RULES[4201005], savage.levels![0])).toBe(savage.levels![0].attackCount);
    expect(hitsAt(SKILL_RULES[4201005], savage.levels![29])).toBe(6);
  });
});

describe("職業能選的技能", () => {
  it("刺客：普通攻擊在最前，接一轉、二轉算得出來的攻擊技能", () => {
    const ids = attackSkillIds(skills, 410);
    expect(ids[0]).toBe(BASIC_ATTACK);
    expect(ids).toContain(4001344);
    expect(ids).toContain(4101005);
    expect(ids).not.toContain(4100001);
    expect(ids).not.toContain(4201005);
  });
  it("法師沒有普通攻擊", () => {
    expect(attackSkillIds(skills, 210)).not.toContain(BASIC_ATTACK);
    expect(attackSkillIds(skills, 210)).toContain(2101004);
  });
  it("十字軍的沒算清單有黑暗之劍、終極之劍", () => {
    const names = notCalculatedFor(skills, 111).map(entry => entry.name);
    expect(names).toContain("黑暗之劍");
    expect(names).toContain("終極之劍");
  });
});

describe("熟練度技能", () => {
  it("劍看職業線、拳套是精準暗器、指虎精通指虎、法杖沒有", () => {
    expect(masterySkillFor("單手劍", 111)).toBe(1100000);
    expect(masterySkillFor("雙手劍", 121)).toBe(1200000);
    expect(masterySkillFor("拳套", 411)).toBe(4100000);
    expect(masterySkillFor("指虎", 510)).toBe(5100001);
    expect(masterySkillFor("短杖", 210)).toBeNull();
    expect(masterySkillFor("拳套", 400)).toBeNull();
  });
});
