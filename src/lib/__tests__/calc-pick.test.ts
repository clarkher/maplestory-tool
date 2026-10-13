/**
 * 我的路線「照傷害算的推薦」（src/lib/calc-pick.ts，v0.92）：真資料跑。
 * 規格 docs/superpowers/specs/2026-10-13-route-calc-pick-design.md（使用者拍板 1A 2A 3A 4A）。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { calcPick, goalText, pickTargets, CALC_PICK_PLUS } from "@/lib/calc-pick";
import { HEAL, isAoeSkill, MOB_COUNT } from "@/lib/damage-skills";
import { computeGroup, killLists, monsterChoices, type CalcData, type KillEntry, type KillLists } from "@/lib/damage-view";
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
const pickFor = (job: number, level: number) => calcPick({ data, job, level, buildTab: null, graph, nearestTown });
const byName = (name: string) => data.monsters.find(monster => monster.n === name)!;

describe("群體技能＝一次打 3 隻以上（台服說明／資料）", () => {
  it("劍氣縱橫、群體治癒、槍連擊（3 隻）、炸彈箭、電閃雷鳴是群體；雙飛斬、妙手術（2 隻）、落雷凝聚、魔天一擊不是", () => {
    for (const id of [1001005, HEAL, 1311001, 3101005, 2201005, 4111005, 2111002]) expect(isAoeSkill(id), String(id)).toBe(true);
    for (const id of [4001344, 4201004, 2211003, 1001004, 2101004, 4211002]) expect(isAoeSkill(id), String(id)).toBe(false);
  });
  it("隻數照說明：虎咆哮 6、龍咆哮 15、槍連擊 3、群體治癒 5、迴旋肘擊 3", () => {
    expect(MOB_COUNT[1111008]).toBe(6);
    expect(MOB_COUNT[1311006]).toBe(15);
    expect(MOB_COUNT[1311001]).toBe(3);
    expect(MOB_COUNT[HEAL]).toBe(5);
    expect(MOB_COUNT[5101002]).toBe(3);
  });
});

describe("單體條件：差一點兩下，沒有就穩穩兩下（4A）", () => {
  const entry = (id: number) => ({ monster: { ...byName("青龍"), id }, v002: false, minUse: 1, midUse: 2 }) as KillEntry;
  const lists = (nearTwo: KillEntry[], two: KillEntry[]): KillLists => ({ one: [], two, nearOne: [], nearTwo, element: null });
  it("差一點兩下有怪就用它", () => {
    const result = pickTargets(lists([entry(1)], [entry(2)]));
    expect(result.goal).toBe("nearTwo");
    expect(result.ids).toEqual(new Set([1]));
  });
  it("差一點兩下沒有：改用兩下打死", () => {
    const result = pickTargets(lists([], [entry(2), entry(3)]));
    expect(result.goal).toBe("two");
    expect(result.ids).toEqual(new Set([2, 3]));
  });
});

describe("calcPick：照傷害算的推薦", () => {
  it("刺客 45：單體、雙飛斬、差一點兩下；武器 +7；圖上刷怪最多那隻真的差一點兩下打得死", () => {
    const pick = pickFor(410, 45);
    if (!pick) throw new Error("算不出來");
    expect(pick.mode).toBe("single");
    expect(pick.skillId).toBe(4001344);
    expect(pick.goal).toBe("nearTwo");
    expect(pick.plus).toBe(CALC_PICK_PLUS);
    expect(pick.group.weaponAtk).toBe((pick.weapon.atk ?? 0) + 7);
    expect(pick.options.length).toBeGreaterThan(0);
    expect(pick.options.length).toBeLessThanOrEqual(3);
    const lists = killLists(data, pick.shared, pick.group, monsterChoices(data.monsters, data.maps))!;
    const near = new Set(lists.nearTwo.map(item => item.monster.id));
    for (const option of pick.options) {
      expect(near.has(option.lead.id), option.lead.n).toBe(true);
      expect(option.row.sp).toBeGreaterThan(3);
      expect(option.lead.lv ?? 0).toBeLessThanOrEqual(50);
      expect(option.hops).toBeDefined();
    }
  });
  it("排序照刷怪效率（走 8 張圖以上打七折）", () => {
    const pick = pickFor(410, 45)!;
    const score = (option: (typeof pick.options)[number]) => option.row.eff * ((option.hops ?? 0) >= 8 ? 0.7 : 1);
    for (let index = 1; index < pick.options.length; index += 1) expect(score(pick.options[index - 1])).toBeGreaterThanOrEqual(score(pick.options[index]));
  });
  it("火毒 35：還沒學群體技能 → 單體", () => {
    const pick = pickFor(210, 35)!;
    expect(pick.mode).toBe("single");
    expect(isAoeSkill(pick.skillId)).toBe(false);
  });
  it("僧侶 45：群體治癒、約 5～6 下、只有不死系；基準大幽靈約 6 下", () => {
    const pick = pickFor(230, 45);
    if (!pick) throw new Error("算不出來");
    expect(pick.mode).toBe("aoe");
    expect(pick.skillId).toBe(HEAL);
    expect(pick.goal).toBe("fiveSix");
    expect(pick.options.length).toBeGreaterThan(0);
    for (const option of pick.options) {
      expect(option.lead.und, option.lead.n).toBe(1);
      expect(option.kills).toBeGreaterThanOrEqual(5);
      expect(option.kills).toBeLessThanOrEqual(6);
    }
    const ghost = computeGroup(data, pick.shared, pick.group, byName("大幽靈"));
    expect(ghost.ok && ghost.vs?.kills.avg).toBe(6);
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
  it("群體條件不挑比角色高 5 級以上的怪", () => {
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
  it("差一點兩下／穩穩兩下／約 N 下", () => {
    expect(goalText({ goal: "nearTwo", skillName: "雙飛斬" }, 2)).toBe("雙飛斬差一點兩下打死（運氣好兩下）");
    expect(goalText({ goal: "two", skillName: "雙飛斬" }, 2)).toBe("雙飛斬穩穩兩下打死");
    expect(goalText({ goal: "fiveSix", skillName: "群體治癒" }, 6)).toBe("群體治癒約 6 下打死");
  });
});
