/**
 * 出一招幾毫秒、每秒經驗（src/lib/damage-speed.ts）。期望值全部照研究筆記的逐技能表
 * （side-session-notes/local_bac19159…/2026-10-12-攻速研究.md，NiaMeowDB 玩家整理），每一階都要對得上。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BASIC_ATTACK, SKILL_RULES } from "@/lib/damage-skills";
import { actionMs, BOOSTERS, boosterSteps, dragonRoarStunMs, expPerSecond, fixedMs, skillBaseMs, SPEED_UNKNOWN } from "@/lib/damage-speed";
import type { Skill } from "@/lib/types";

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const skills = new Map((JSON.parse(fs.readFileSync(`${DATA}skills.json`, "utf8")) as Skill[]).map(skill => [skill.id, skill]));

/** 一張表：速度階 → 毫秒 */
const expectTable = (base: number, table: Record<number, number>) => {
  for (const [tier, ms] of Object.entries(table)) expect(actionMs(base, Number(tier)), `base ${base} 階 ${tier}`).toBe(ms);
};

describe("出一招幾毫秒：30×進位(基本×(10＋階)÷16÷30)", () => {
  it("一般揮砍（基本 800）：0～10 階整張表", () => {
    expectTable(800, { 0: 510, 1: 570, 2: 600, 3: 660, 4: 720, 5: 750, 6: 810, 7: 870, 8: 900, 9: 960, 10: 1020 });
  });
  it("弩（基本 818）：0～10 階整張表", () => {
    expectTable(818, { 0: 540, 1: 570, 2: 630, 3: 690, 4: 720, 5: 780, 6: 840, 7: 870, 8: 930, 9: 990, 10: 1050 });
  });
  it("10 階以上都當 10 階（最慢），0 以下當 0", () => {
    expect(actionMs(800, 12)).toBe(1020);
    expect(actionMs(800, -1)).toBe(510);
  });
  it("自己動作的技能：虎咆哮、龍咆哮 1500、迴旋斬 960、風魔手裏劍 900", () => {
    expectTable(1500, { 2: 1140, 3: 1230, 4: 1320, 5: 1410, 6: 1500, 7: 1620, 8: 1710 });
    expectTable(960, { 1: 660, 2: 720, 3: 780, 4: 840 });
    expectTable(900, { 1: 630, 2: 690, 3: 750, 4: 810, 5: 870, 6: 900, 7: 960, 8: 1020 });
    expectTable(1050, { 4: 930, 5: 990, 6: 1050, 7: 1140, 8: 1200 });
  });
  it("魔法（固定 6 階，加速 −1／−2）：魔靈彈 810／750／720、末日烈焰 1800／1590、落雷凝聚 1320／1140", () => {
    expectTable(800, { 6: 810, 5: 750, 4: 720 });
    expectTable(1800, { 6: 1800, 4: 1590 });
    expectTable(1300, { 6: 1320, 4: 1140 });
    expectTable(900, { 6: 900, 4: 810 });
  });
});

describe("每個技能的基本毫秒", () => {
  it("用武器動作的：弩 818、其他 800（槍矛用比較慢的揮）", () => {
    expect(skillBaseMs(BASIC_ATTACK, "弩", 1)).toBe(818);
    expect(skillBaseMs(BASIC_ATTACK, "拳套", 1)).toBe(800);
    expect(skillBaseMs(BASIC_ATTACK, "槍", 1)).toBe(800);
    expect(skillBaseMs(3001004, "弩", 20)).toBe(818); // 斷魂箭
    expect(skillBaseMs(3001004, "弓", 20)).toBe(800);
    expect(skillBaseMs(4001344, "拳套", 20)).toBe(800); // 雙飛斬
    expect(skillBaseMs(1001004, "單手劍", 20)).toBe(800); // 魔天一擊
  });
  it("槍連擊、矛連擊：1～14 級 900、15 級起 1050", () => {
    expect(skillBaseMs(1311001, "槍", 14)).toBe(900);
    expect(skillBaseMs(1311001, "槍", 15)).toBe(1050);
    expect(skillBaseMs(1311002, "矛", 30)).toBe(1050);
  });
  it("強弩 800、虎咆哮 1500、迴旋斬 960、落葉斬 900", () => {
    expect(skillBaseMs(3201003, "弩", 20)).toBe(800);
    expect(skillBaseMs(1111008, "單手劍", 30)).toBe(1500);
    expect(skillBaseMs(4201005, "短刀", 30)).toBe(960);
    expect(skillBaseMs(4211002, "短刀", 30)).toBe(900);
  });
  it("海盜、龍之獻祭查不到（null），原因一句", () => {
    expect(skillBaseMs(5001001, "指虎", 20)).toBeNull();
    expect(skillBaseMs(5201001, "火槍", 20)).toBeNull();
    expect(skillBaseMs(1311005, "槍", 30)).toBeNull();
    expect(skillBaseMs(BASIC_ATTACK, "指虎", 1)).toBeNull();
    expect(SPEED_UNKNOWN).toBe("這招出手時間查不到，不算");
  });
  it("每個技能綁研究表的基本毫秒（手滑打錯一個就紅）", () => {
    const table: Array<[number, string, number]> = [
      [1001005, "單手劍", 800], [1311003, "槍", 800], [1311004, "矛", 800], [1311006, "槍", 1500],
      [2001004, "長杖", 800], [2001005, "長杖", 800], [2101004, "長杖", 800], [2101005, "長杖", 800], [2201004, "長杖", 800],
      [2201005, "長杖", 800], [2301005, "長杖", 800], [2111002, "長杖", 1800], [2111006, "長杖", 900], [2211002, "長杖", 1050],
      [2211003, "長杖", 1300], [2211006, "長杖", 900], [2311004, "長杖", 1050],
      [3001005, "弓", 800], [3101003, "弓", 800], [3201005, "弩", 818], [3111003, "弓", 800], [3111004, "弓", 800], [3111006, "弓", 800],
      [3211003, "弩", 818], [3211004, "弩", 818], [3211006, "弩", 818],
      [4001334, "短刀", 800], [4101005, "拳套", 800], [4201004, "短刀", 800], [4111005, "拳套", 900],
    ];
    for (const [id, weapon, base] of table) expect(skillBaseMs(id, weapon, 20), `${id} ${skills.get(id)?.n}`).toBe(base);
  });
  it("群體治癒固定 600 毫秒（不吃攻速），其他技能沒有固定時間", () => {
    expect(fixedMs(2301002)).toBe(600);
    expect(fixedMs(2301005)).toBeUndefined();
    expect(fixedMs(BASIC_ATTACK)).toBeUndefined();
  });
  it("技能表裡每個技能都有答案：不是海盜、龍之獻祭就要有毫秒（固定時間的另外算）", () => {
    for (const id of Object.keys(SKILL_RULES).map(Number)) {
      if (fixedMs(id) !== undefined) continue;
      const pirate = Math.floor(id / 1000000) === 5;
      const weapon = SKILL_RULES[id].weapons?.[0] ?? (pirate ? "指虎" : id >= 3000000 && id < 4000000 ? "弓" : id >= 4000000 ? "拳套" : "單手劍");
      const ms = skillBaseMs(id, weapon, 30);
      if (pirate || id === 1311005) expect(ms, String(id)).toBeNull();
      else expect(ms, `${id} ${skills.get(id)?.n}`).toBeGreaterThan(0);
    }
  });
});

describe("龍咆哮的自暈、加速、每秒經驗", () => {
  it("龍咆哮自暈：1～9 級 4 秒、10～20 級 3 秒、21～30 級 2 秒", () => {
    expect(dragonRoarStunMs(1)).toBe(4000);
    expect(dragonRoarStunMs(9)).toBe(4000);
    expect(dragonRoarStunMs(10)).toBe(3000);
    expect(dragonRoarStunMs(20)).toBe(3000);
    expect(dragonRoarStunMs(21)).toBe(2000);
    expect(dragonRoarStunMs(30)).toBe(2000);
  });
  it("加速技能：物理每一級 −2 階；極速詠唱 1～10 級 −1、11 級起 −2；0 級 0", () => {
    const sword = BOOSTERS.find(entry => entry.id === 1101004)!;
    expect(sword.weapons).toEqual(["單手劍", "雙手劍"]);
    expect(boosterSteps(sword, 1)).toBe(2);
    expect(boosterSteps(sword, 0)).toBe(0);
    const chant = BOOSTERS.find(entry => entry.id === 2111005)!;
    expect(chant.weapons).toBe("magic");
    expect(boosterSteps(chant, 10)).toBe(1);
    expect(boosterSteps(chant, 11)).toBe(2);
  });
  it("加速技能的 id 都在遊戲資料裡", () => {
    for (const entry of BOOSTERS) expect(skills.has(entry.id), String(entry.id)).toBe(true);
  });
  it("每秒經驗＝經驗×隻數÷(次數×秒)", () => {
    expect(expPerSecond(135, 3, 720)).toBeCloseTo(62.5);
    expect(expPerSecond(105, 1, 600, 3)).toBeCloseTo(525);
  });
});
