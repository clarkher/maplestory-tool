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
  parseLevelText,
  skillRow,
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
  /**
   * 算「攻擊技能」的口徑：某一級有 damage、mad、attackCount 任何一個，或任何一級的說明原文寫了「攻擊力／殺傷力 N%」。
   * 只看 damage／mad 會漏掉數字只在說明裡的（槍連擊、矛連擊、分身術）、傷害放在 x／y／z 的（炸彈箭、楓幣攻擊）、
   * 只有 attackCount 的（楓幣炸彈）。
   */
  const ATTACK_TEXT = /(?:攻擊力|殺傷力)\s*\d+\s*%/;
  /**
   * 說明裡有攻擊力 %、但不是攻擊技能的 id（增益、被動）。目前沒有，真資料也沒浮出這種——
   * 之後若有，在這裡明列並寫理由，不要為了讓測試過去而塞進產品程式的技能表。
   */
  const NOT_ATTACKS: number[] = [];
  const attacking = skillList.filter(
    skill =>
      classicJobs.has(skill.job) &&
      !NOT_ATTACKS.includes(skill.id) &&
      (skill.levels?.some(row => row.damage || row.mad || row.attackCount) || Object.values(skill.levelText ?? {}).some(text => ATTACK_TEXT.test(text))),
  );
  it.each(attacking.map(skill => [skill.id, skill.n] as const))("%s %s", id => {
    expect(handled.has(id)).toBe(true);
  });
  // 楓幣攻擊（4111004）傷害放在 y／z、說明又沒寫攻擊力 %，這個口徑撈不到它，靠上面「沒算清單」直接列
  it("以前漏掉的五個攻擊技能現在都被檢查涵蓋到", () => {
    const covered = new Set(attacking.map(skill => skill.id));
    for (const id of [1311001, 1311002, 4211004, 3101005, 4211006]) expect(covered.has(id), String(id)).toBe(true);
  });
  it("技能表裡的 id 都存在、而且不會同時算又列為沒算", () => {
    for (const id of Object.keys(SKILL_RULES).map(Number)) {
      expect(skills.has(id), String(id)).toBe(true);
      expect(NOT_CALCULATED[id], String(id)).toBeUndefined();
    }
  });
  it("沒算清單的 id 都存在", () => {
    for (const id of Object.keys(NOT_CALCULATED).map(Number)) expect(skills.has(id), String(id)).toBe(true);
  });
  it("新列為沒算的四個技能，原因照裁定", () => {
    expect(NOT_CALCULATED[4211004]).toBe("分身怎麼算傷害、各打幾下查不到");
    expect(NOT_CALCULATED[3101005]).toBe("衝擊跟爆炸兩段怎麼算查不到");
    expect(NOT_CALCULATED[4111004]).toBe("傷害看丟出去的楓幣多少，這版沒算");
    expect(NOT_CALCULATED[4211006]).toBe("傷害看引爆的楓幣多少，這版沒算");
    expect(NOT_CALCULATED[2111003]).toBe("致命毒霧的持續傷害怎麼算查不到");
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

describe("每一級說明裡的攻擊力與下數", () => {
  it("parseLevelText：攻擊力 %、幾次攻擊（一二兩三…十、阿拉伯數字）", () => {
    expect(parseLevelText("消耗MP10, 攻擊力55%, 對一名怪物兩次攻擊")).toEqual({ damage: 55, attackCount: 2 });
    expect(parseLevelText("消耗MP24, 攻擊力170%, 對三名怪物三次攻擊")).toEqual({ damage: 170, attackCount: 3 });
    expect(parseLevelText("消耗MP 25，殺傷力210%，製造五個分身來攻擊敵人")).toEqual({ damage: 210 });
    expect(parseLevelText("攻擊力120%，對二名怪物十次攻擊")).toEqual({ damage: 120, attackCount: 10 });
    expect(parseLevelText("攻擊力 90 %，4 次攻擊")).toEqual({ damage: 90, attackCount: 4 });
    expect(parseLevelText(undefined)).toEqual({});
    expect(parseLevelText("")).toEqual({});
    expect(parseLevelText("消耗MP10")).toEqual({});
  });
  it("槍連擊、矛連擊：攻擊力與下數看每一級說明", () => {
    expect(SKILL_RULES[1311001]).toEqual({ kind: "normal", fromText: true, weapons: ["槍"] });
    expect(SKILL_RULES[1311002]).toEqual({ kind: "normal", fromText: true, weapons: ["矛"] });
    for (const id of [1311001, 1311002]) {
      const skill = skills.get(id)!;
      const rule = SKILL_RULES[id];
      expect(skillRow(skill, 1, rule)).toMatchObject({ damage: 55, attackCount: 2 });
      expect(hitsAt(rule, skillRow(skill, 1, rule))).toBe(2);
      const top = skillRow(skill, 30, rule);
      expect(top.damage).toBe(170);
      expect(top.attackCount).toBe(3);
      expect(hitsAt(rule, top)).toBe(3);
    }
  });
  it("槍連擊、矛連擊：30 級每一級說明都解析得出攻擊力與下數（2 或 3 次）", () => {
    for (const id of [1311001, 1311002]) {
      const skill = skills.get(id)!;
      let last = 0;
      for (let level = 1; level <= 30; level++) {
        const row = skillRow(skill, level, SKILL_RULES[id]);
        expect(row.damage, `${id} Lv${level} damage`).toBeGreaterThan(0);
        // 矛連擊 12 級台服說明寫 100%（前後是 104、112，看起來是上游筆誤），照資料算、不修，所以這一級不比大小
        if (!(id === 1311002 && level === 12)) expect(row.damage, `${id} Lv${level} 不降`).toBeGreaterThanOrEqual(last);
        expect([2, 3], `${id} Lv${level} 下數`).toContain(row.attackCount);
        last = row.damage;
      }
    }
  });
  it("矛連擊 12 級照台服說明原文 100%（跟前後比像是上游筆誤，不自己改數字）", () => {
    const spear = skills.get(1311002)!;
    expect(spear.levelText!["12"]).toContain("攻擊力100%");
    expect(skillRow(spear, 12, SKILL_RULES[1311002]).damage).toBe(100);
  });
  it("skillRow：一般技能就是該級那一列、沒有技能或 0 級是空列、超過最高級取最後一級", () => {
    const sharp = skills.get(4001344)!;
    expect(skillRow(sharp, 20, SKILL_RULES[4001344])).toEqual(sharp.levels![19]);
    expect(skillRow(sharp, 20)).toEqual(sharp.levels![19]);
    expect(skillRow(undefined, 5, SKILL_RULES[4001344])).toEqual({});
    expect(skillRow(sharp, 0, SKILL_RULES[4001344])).toEqual({});
    expect(skillRow(sharp, -3)).toEqual({});
    expect(skillRow(sharp, 999)).toEqual(sharp.levels![sharp.levels!.length - 1]);
    const spear = skills.get(1311001)!;
    expect(skillRow(spear, 999, SKILL_RULES[1311001])).toEqual(skillRow(spear, 30, SKILL_RULES[1311001]));
  });
  it("skillRow：沒標 fromText 的技能不去解析說明", () => {
    const spear = skills.get(1311001)!;
    expect(skillRow(spear, 30, { kind: "normal" })).toEqual({});
  });
});

describe("技能表欄位照研究定案", () => {
  it("強弓、強弩沒有爆擊；烈火箭沒套屬性", () => {
    expect(SKILL_RULES[3101003].crit).toBeUndefined();
    expect(SKILL_RULES[3201003].crit).toBeUndefined();
    expect(SKILL_RULES[3101003].kind).toBe("arrowBomb");
    expect(SKILL_RULES[3201003].kind).toBe("arrowBomb");
    expect(SKILL_RULES[3111003].element).toBeUndefined();
  });
  it("龍之獻祭無視防禦、落葉斬等級夠才無視", () => {
    expect(SKILL_RULES[1311005].ignoreDef).toBe("always");
    expect(SKILL_RULES[4211002].ignoreDef).toBe("notHigher");
  });
  it("雙飛斬是幸運公式加強力投擲爆擊；穿透之箭穿透；火焰箭火屬性", () => {
    expect(SKILL_RULES[4001344].kind).toBe("lucky");
    expect(SKILL_RULES[4001344].crit).toBe("throw");
    expect(SKILL_RULES[3201005].pierce).toBe(true);
    expect(SKILL_RULES[2101004].element).toBe("f");
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
