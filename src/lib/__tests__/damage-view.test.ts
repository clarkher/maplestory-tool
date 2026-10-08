/**
 * 傷害計算機的預設值與組裝（src/lib/damage-view.ts），用真資料（public/data）跑：
 * 跟 gear-realdata.test.ts 一樣直接讀檔，不用假資料撐。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GearData } from "@/lib/gear";
import type { GuideJob, MapRecord, Monster, Skill, TrainingRow } from "@/lib/types";
import {
  ammoChoices,
  clampLevel,
  defaultAmmo,
  defaultGroup,
  defaultMonster,
  groupLabels,
  monsterChoices,
  parseState,
  skillLevelsAt,
  weaponChoices,
  type CalcData,
} from "@/lib/damage-view";

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const read = <T>(file: string) => JSON.parse(fs.readFileSync(`${DATA}${file}`, "utf8")) as T;
const gear = read<GearData>("gear.json");
const skillList = read<Skill[]>("skills.json");
const guides: Record<number, GuideJob | undefined> = {};
for (const file of fs.readdirSync(`${DATA}guides`)) {
  const code = Number(file.replace(".json", ""));
  if (Number.isFinite(code)) guides[code] = read<GuideJob>(`guides/${file}`);
}
const data: CalcData = {
  gear,
  skills: new Map(skillList.map(skill => [skill.id, skill])),
  guides,
  monsters: read<Monster[]>("monsters.json"),
  maps: read<Record<string, MapRecord>>("maps.json"),
  training: read<TrainingRow[]>("training.json"),
  // 測試固定當作已開放（10/15 之後），不跟著跑測試的日期變
  beforeOpen: false,
};

describe("技能等級照主流技能點法", () => {
  it("刺客 50：一轉的雙飛斬、二轉的精準暗器都有點", () => {
    const { levels, guided } = skillLevelsAt(410, 50, guides, data.skills);
    expect(guided).toBe(true);
    expect(levels[4001344]).toBeGreaterThan(0);
    expect(levels[4100000]).toBeGreaterThan(0);
  });
  it("刺客 25 還是一轉：二轉技能都是 0", () => {
    const { levels } = skillLevelsAt(410, 25, guides, data.skills);
    expect(levels[4100000] ?? 0).toBe(0);
  });
  it("沒有那一轉的攻略：那一轉的技能一律最高等級，guided 是 false", () => {
    const { levels, guided } = skillLevelsAt(410, 50, { ...guides, 410: undefined }, data.skills);
    expect(guided).toBe(false);
    expect(levels[4100000]).toBe(data.skills.get(4100000)!.levels!.length);
  });
});

describe("彈藥", () => {
  it("拳套只列飛鏢；預設是商店買得到的（海星鏢）", () => {
    const ammo = gear.ammo ?? [];
    expect(ammoChoices(ammo, "拳套").every(entry => entry.kind === "飛鏢")).toBe(true);
    expect(defaultAmmo(ammo, "拳套", 50, false)?.id).toBe(2070000);
  });
  it("不用彈藥的武器回空的", () => {
    expect(ammoChoices(gear.ammo ?? [], "單手劍")).toEqual([]);
    expect(defaultAmmo(gear.ammo ?? [], "單手劍", 50, false)).toBeNull();
  });
});

describe("武器選單", () => {
  it("刺客只有拳套；法師是有魔攻、職業用得到的", () => {
    expect(weaponChoices(gear, 410).every(weapon => weapon.s === "拳套")).toBe(true);
    const mage = weaponChoices(gear, 210);
    expect(mage.length).toBeGreaterThan(0);
    expect(mage.every(weapon => (weapon.mag ?? 0) > 0)).toBe(true);
  });
});

describe("一組的預設", () => {
  it("刺客 50 一般點法：赤紅手甲、幸 172、敏 90、海星鏢", () => {
    const group = defaultGroup(data, 410, 50, null);
    expect(group.tab).toBe("一般點法");
    expect(group.weaponId).toBe(1472019);
    expect(group.stats).toEqual({ STR: 4, DEX: 90, INT: 4, LUK: 172 });
    expect(group.ammoId).toBe(2070000);
  });
  it("刺客 50 全幸：敏捷含要湊的裝備（空身 25＋裝備）", () => {
    const group = defaultGroup(data, 410, 50, "全幸");
    expect(group.tab).toBe("全幸");
    expect(group.stats.LUK).toBe(237);
    expect(group.stats.DEX).toBeGreaterThan(25);
  });
  it("等級夾在職業的轉職等級到 120", () => {
    expect(clampLevel(411, 50)).toBe(70);
    expect(clampLevel(410, 200)).toBe(120);
  });
});

describe("怪物", () => {
  it("選單只收有中文名地圖的怪、依等級排、標出 V002", () => {
    const choices = monsterChoices(data.monsters, data.maps);
    expect(choices.length).toBeGreaterThan(50);
    expect(choices.every((choice, index) => index === 0 || (choices[index - 1].monster.lv ?? 0) <= (choice.monster.lv ?? 0))).toBe(true);
    expect(choices.some(choice => choice.v002)).toBe(true);
  });
  it("預設怪＝練功排行第一名那張圖的主力怪", () => {
    const id = defaultMonster(data, 410, 50);
    expect(id).not.toBeNull();
    expect(data.monsters.find(monster => monster.id === id)).toBeDefined();
  });
});

describe("組名", () => {
  const base = defaultGroup(data, 410, 50, null);
  it("點法不同寫點法名", () => {
    expect(groupLabels([base, { ...base, tab: "全幸" }])).toEqual(["一般點法", "全幸"]);
  });
  it("同點法不同等級寫等級", () => {
    expect(groupLabels([base, { ...base, level: 60 }])).toEqual(["Lv.50", "Lv.60"]);
  });
  it("都一樣寫左組、右組", () => {
    expect(groupLabels([base, base])).toEqual(["左組", "右組"]);
  });
});

describe("記下來的設定", () => {
  it("壞掉的字串、少欄位都當沒記", () => {
    expect(parseState(null)).toBeNull();
    expect(parseState("{")).toBeNull();
    expect(parseState(JSON.stringify({ shared: { job: 410 } }))).toBeNull();
  });
  it("正常的照原樣讀回來", () => {
    const group = defaultGroup(data, 410, 50, null);
    const state = { shared: { job: 410, skillId: 4001344, skillLevel: 20, monsterId: null }, groups: [group, group] };
    expect(parseState(JSON.stringify(state))).toEqual(state);
  });
});
