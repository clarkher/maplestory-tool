/**
 * 我的路線「照傷害算的推薦」（src/lib/calc-pick.ts，v0.92）：真資料跑。
 * 規格 docs/superpowers/specs/2026-10-13-route-calc-pick-design.md（使用者拍板 1A 2A 3A 4A）。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AOE_TIERS, calcPick, goalText, CALC_PICK_PLUS } from "@/lib/calc-pick";
import { HEAL, isAoeSkill, MOB_COUNT } from "@/lib/damage-skills";
import { computeGroup, killLists, monsterChoices, type CalcData } from "@/lib/damage-view";
import { dangerPenalty } from "@/lib/planner";
import type { GearData } from "@/lib/gear";
import type { GuideCommon, GuideJob, MapRecord, Monster, PortalEdge, Skill, TrainingRow } from "@/lib/types";

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const read = <T>(file: string) => JSON.parse(fs.readFileSync(`${DATA}${file}`, "utf8")) as T;
const guides: Record<number, GuideJob | undefined> = {};
for (const file of fs.readdirSync(`${DATA}guides`)) {
  const code = Number(file.replace(".json", ""));
  if (Number.isFinite(code)) guides[code] = read<GuideJob>(`guides/${file}`);
}
const data: CalcData = {
  gear: read<GearData>("gear.json"),
  skills: new Map(read<Skill[]>("skills.json").map(skill => [skill.id, skill])),
  guides,
  monsters: read<Monster[]>("monsters.json"),
  maps: read<Record<string, MapRecord>>("maps.json"),
  training: read<TrainingRow[]>("training.json"),
  expToNext: read<GuideCommon>("guides/common.json").expTable.toNext,
  beforeOpen: false,
};
const graph = read<Record<string, PortalEdge[]>>("graph.json");
const nearestTown = read<Record<string, [number, number]>>("nearest-town.json");
const pickFor = (job: number, level: number, beforeOpen = false) => calcPick({ data: { ...data, beforeOpen }, job, level, buildTab: null, graph, nearestTown });
const byName = (name: string) => data.monsters.find(monster => monster.n === name)!;

describe("群體技能＝一次打 3 隻以上（台服說明／資料）", () => {
  it("劍氣縱橫、群體治癒、槍連擊（3 隻）、炸彈箭、電閃雷鳴是群體；雙飛斬、妙手術（2 隻）、落雷凝聚、魔天一擊不是", () => {
    for (const id of [1001005, HEAL, 1311001, 3101005, 2201005, 4111005, 2111002]) expect(isAoeSkill(id), String(id)).toBe(true);
    for (const id of [4001344, 4201004, 2211003, 1001004, 2101004, 4211002]) expect(isAoeSkill(id), String(id)).toBe(false);
    // 妙手術台服說明沒寫打幾隻，不記
    expect(MOB_COUNT[4201004]).toBeUndefined();
  });
  it("隻數照說明：虎咆哮 6、龍咆哮 15、槍連擊 3、群體治癒 5、迴旋肘擊 3", () => {
    expect(MOB_COUNT[1111008]).toBe(6);
    expect(MOB_COUNT[1311006]).toBe(15);
    expect(MOB_COUNT[1311001]).toBe(3);
    expect(MOB_COUNT[HEAL]).toBe(5);
    expect(MOB_COUNT[5101002]).toBe(3);
  });
});

describe("單體條件：差一點兩下找不到「圖」就改穩穩兩下（4A）", () => {
  it("盜賊 13：差一點兩下有怪但沒有當主力的圖 → 改穩穩兩下，而且有圖", () => {
    const pick = pickFor(400, 13);
    if (!pick) throw new Error("算不出來");
    expect(pick.rows.every(row => row.goal === "two")).toBe(true);
    expect(pick.options.length).toBeGreaterThan(0);
    const lists = killLists(data, pick.shared, pick.group, monsterChoices(data.monsters, data.maps))!;
    const two = new Set(lists.two.map(item => item.monster.id));
    for (const option of pick.options) expect(two.has(option.lead.id), option.lead.n).toBe(true);
  });
});

describe("calcPick：照傷害算的推薦", () => {
  it("單體放三隻（v0.94 使用者）：刺客 45 三行、三隻不同的怪，先放差一點兩下的", () => {
    const pick = pickFor(410, 45)!;
    expect(pick.rows.length).toBe(3);
    const leads = pick.rows.map(row => row.option?.lead.id);
    expect(leads.every(Boolean)).toBe(true);
    expect(new Set(leads).size).toBe(3);
    expect(pick.rows[0].goal).toBe("nearTwo");
    // 差一點兩下的排在穩穩兩下前面
    const order = pick.rows.map(row => (row.goal === "nearTwo" ? 0 : 1));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it("刺客 45：單體、雙飛斬、差一點兩下；武器 +7；圖上刷怪最多那隻真的差一點兩下打得死", () => {
    const pick = pickFor(410, 45);
    if (!pick) throw new Error("算不出來");
    expect(pick.mode).toBe("single");
    expect(pick.skillId).toBe(4001344);
    expect(pick.rows[0].goal).toBe("nearTwo");
    expect(pick.plus).toBe(CALC_PICK_PLUS);
    expect(pick.group.weaponAtk).toBe((pick.weapon.atk ?? 0) + 7);
    expect(pick.options.length).toBeGreaterThan(0);
    expect(pick.options.length).toBeLessThanOrEqual(3);
    const lists = killLists(data, pick.shared, pick.group, monsterChoices(data.monsters, data.maps))!;
    const near = new Set(lists.nearTwo.map(item => item.monster.id));
    const two = new Set(lists.two.map(item => item.monster.id));
    for (const row of pick.rows) {
      const option = row.option!;
      expect((row.goal === "nearTwo" ? near : two).has(option.lead.id), option.lead.n).toBe(true);
      expect(option.row.sp).toBeGreaterThan(3);
      expect(option.lead.lv ?? 0).toBeLessThanOrEqual(50);
      expect(option.hops).toBeDefined();
    }
  });
  it("同一種條件裡照刷怪效率排（走 8 張圖以上打七折）", () => {
    const pick = pickFor(410, 45)!;
    const near = pick.rows.filter(row => row.goal === "nearTwo").map(row => row.option!);
    const score = (option: (typeof near)[number]) => option.row.eff * ((option.hops ?? 0) >= 8 ? 0.7 : 1);
    for (let index = 1; index < near.length; index += 1) expect(score(near[index - 1])).toBeGreaterThanOrEqual(score(near[index]));
  });
  it("火毒 35：還沒學群體技能 → 單體；法師武器加的是魔攻（木製短杖攻擊、魔攻不同）", () => {
    const pick = pickFor(210, 35)!;
    expect(pick.mode).toBe("single");
    expect(isAoeSkill(pick.skillId)).toBe(false);
    expect(pick.weapon.atk).not.toBe(pick.weapon.mag);
    expect(pick.group.weaponAtk).toBe((pick.weapon.mag ?? 0) + 7);
  });
  it("冰雷 40：學了電閃雷鳴 → 群體、用電閃雷鳴", () => {
    const pick = pickFor(220, 40)!;
    expect(pick.mode).toBe("aoe");
    expect(pick.skillId).toBe(2201005);
  });
  it("法師 10：技能點法還沒點攻擊技能 → 不出這張卡（不拿最高等級硬算）", () => {
    expect(pickFor(200, 10)).toBeNull();
  });
  it("太危險的圖不列（跟主推卡一樣：圖上最高等的怪高你 12 級以上）", () => {
    for (const [job, level] of [[100, 10], [410, 45], [420, 30], [410, 30], [230, 45], [110, 45]]) {
      const pick = pickFor(job, level);
      for (const option of pick?.options ?? []) expect(dangerPenalty(level, option.row.lvMax), `${job} ${level} ${option.title}`).toBeGreaterThan(0.2);
    }
  });
  it("10/15 前：不推 V002 的圖、不挑只在 V002 的怪", () => {
    for (const [job, level] of [[210, 45], [410, 60], [230, 60], [211, 80]]) {
      const pick = pickFor(job, level, true);
      for (const option of pick?.options ?? []) {
        expect(data.maps[String(option.map)]?.o, `${job} ${level} ${option.title}`).toBeUndefined();
        const choice = monsterChoices(data.monsters, data.maps).find(item => item.monster.id === option.lead.id)!;
        expect(choice.v002, option.lead.n).toBe(false);
      }
    }
  });
  it("群體分三段（v0.94 使用者）：2～3、3～4、4～5 下各一隻、不重複；僧侶 45 群體治癒只有不死系", () => {
    expect(AOE_TIERS).toEqual([[2, 3], [3, 4], [4, 5]]);
    const pick = pickFor(230, 45);
    if (!pick) throw new Error("算不出來");
    expect(pick.mode).toBe("aoe");
    expect(pick.skillId).toBe(HEAL);
    expect(pick.rows.map(row => row.label)).toEqual(["2～3 下", "3～4 下", "4～5 下"]);
    const used = new Set<number>();
    pick.rows.forEach((row, index) => {
      if (!row.option) return;
      const [low, high] = AOE_TIERS[index];
      expect(row.option.kills >= low && row.option.kills <= high, `${row.label} ${row.option.lead.n} ${row.option.kills}`).toBe(true);
      expect(row.option.lead.und, row.option.lead.n).toBe(1);
      expect(used.has(row.option.lead.id), row.option.lead.n).toBe(false);
      used.add(row.option.lead.id);
    });
    expect(pick.options.length).toBeGreaterThan(0);
    const ghost = computeGroup(data, pick.shared, pick.group, byName("大幽靈"));
    expect(ghost.ok && ghost.vs?.kills.avg).toBe(6);
  });
  it("狂戰士 45 三段：至少兩段有圖、每段的下數在範圍裡", () => {
    const pick = pickFor(110, 45, true)!;
    expect(pick.rows.filter(row => row.option).length).toBeGreaterThanOrEqual(2);
    pick.rows.forEach((row, index) => {
      if (row.option) expect(row.option.kills >= AOE_TIERS[index][0] && row.option.kills <= AOE_TIERS[index][1], row.label).toBe(true);
    });
  });
  it("狂戰士 45：學了劍氣縱橫 → 群體、用劍氣縱橫", () => {
    const pick = pickFor(110, 45)!;
    expect(pick.mode).toBe("aoe");
    expect(pick.skillId).toBe(1001005);
  });
  it("獵人 45：群體，但不拿強弓（擊退用）當那一招", () => {
    const pick = pickFor(310, 45)!;
    expect(pick.mode).toBe("aoe");
    expect(pick.skillId).not.toBe(3101003);
  });
  it("不挑比角色高 5 級以上的怪", () => {
    for (const [job, level] of [[110, 45], [230, 45], [220, 40]]) {
      const pick = pickFor(job, level)!;
      for (const option of pick.options) expect(option.lead.lv ?? 0, `${job} ${option.lead.n}`).toBeLessThanOrEqual(level + 5);
    }
  });
  it("10 分鐘經驗照那隻主力怪算（出手時間查得到才有）", () => {
    const pick = pickFor(410, 45)!;
    const option = pick.options[0];
    const result = computeGroup(data, pick.shared, pick.group, option.lead);
    expect(result.ok && result.vs?.tenMinute).toEqual(option.tenMinute);
  });
  it("初心者、還沒轉職：不出這張卡（null）", () => {
    expect(pickFor(0, 8)).toBeNull();
  });
});

describe("卡上那句", () => {
  it("差一點兩下／穩穩兩下／約 N 下；炸彈箭寫明照被射中那隻算", () => {
    expect(goalText({ goal: "nearTwo", skillName: "雙飛斬", skillId: 4001344 }, 2)).toBe("雙飛斬差一點兩下打死（運氣好兩下）");
    expect(goalText({ goal: "two", skillName: "雙飛斬", skillId: 4001344 }, 2)).toBe("雙飛斬穩穩兩下打死");
    expect(goalText({ goal: "aoe", skillName: "群體治癒", skillId: HEAL }, 3)).toBe("群體治癒約 3 下打死");
    expect(goalText({ goal: "aoe", skillName: "炸彈箭", skillId: 3101005 }, 4)).toBe("炸彈箭約 4 下打死（照被射中那隻算）");
  });
});
