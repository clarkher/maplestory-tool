/**
 * 傷害計算機的預設值與組裝（src/lib/damage-view.ts），用真資料（public/data）跑：
 * 跟 gear-realdata.test.ts 一樣直接讀檔，不用假資料撐。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GearData, GearWeapon } from "@/lib/gear";
import { BOSS_SPAWN_MAX } from "@/lib/now-plan";
import { planTraining } from "@/lib/planner";
import { LEVEL_CAP as PROFILE_LEVEL_CAP } from "@/lib/profile";
import type { GuideJob, MapRecord, Monster, Skill, TrainingRow } from "@/lib/types";
import {
  ammoChoices,
  clampLevel,
  defaultAmmo,
  defaultGroup,
  defaultMonster,
  groupLabels,
  LEVEL_CAP,
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

describe("等級上限", () => {
  it("沿用 profile.ts 那一個（那裡是唯一要改的地方），不另外寫一份", () => {
    expect(LEVEL_CAP).toBe(PROFILE_LEVEL_CAP);
    const source = fs.readFileSync(fileURLToPath(new URL("../damage-view.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/const\s+LEVEL_CAP\s*=/);
  });
});

// 下面的數字是 2026-10-08 用 public/data 的攻略跑出來的：研究檔改了點法，這裡跟著改（先印出來核對再改）。
describe("技能等級照主流技能點法", () => {
  it("刺客 50：雙飛斬點滿 20，二轉精準暗器剛點到 5，還沒點的吸血術是 0", () => {
    const { levels, guided } = skillLevelsAt(410, 50, guides, data.skills);
    expect(guided).toBe(true);
    expect(levels[4001344]).toBe(20);
    expect(levels[4100000]).toBe(5);
    expect(levels[4101005]).toBe(0);
  });
  it("刺客 30（剛二轉）：精準暗器 1 級", () => {
    expect(skillLevelsAt(410, 30, guides, data.skills).levels[4100000]).toBe(1);
  });
  it("刺客 25 還是一轉：二轉技能都是 0", () => {
    const { levels } = skillLevelsAt(410, 25, guides, data.skills);
    expect(levels[4100000] ?? 0).toBe(0);
  });
  it("暗殺者 80：二轉技能停在二轉最後一級的點法，三轉技能照三轉現在的點數", () => {
    const { levels, guided } = skillLevelsAt(411, 80, guides, data.skills);
    expect(guided).toBe(true);
    expect(levels[4100000]).toBe(20);
    expect(levels[4100001]).toBe(30);
    // 二轉的每個技能都跟「刺客 69 級（二轉的最後一級）」一樣
    const secondJob = skillLevelsAt(410, 69, guides, data.skills).levels;
    for (const [id, level] of Object.entries(secondJob)) if (Number(id) >= 4100000 && Number(id) < 4110000) expect(levels[Number(id)]).toBe(level);
    expect(levels[4101005]).toBe(5);
    expect(levels[4111005]).toBe(5);
  });
  it("海盜分線：格鬥家（打手線）跟神槍手（槍手線）挑到不同的一轉點法", () => {
    const fighter = skillLevelsAt(511, 20, guides, data.skills).levels;
    const gunslinger = skillLevelsAt(521, 20, guides, data.skills).levels;
    expect(fighter[5001003]).toBe(1);
    expect(fighter[5001001]).toBe(20);
    expect(fighter[5001005] ?? 0).toBe(0);
    expect(gunslinger[5001003]).toBe(20);
    expect(gunslinger[5001005]).toBe(10);
    expect(gunslinger[5001001] ?? 0).toBe(0);
  });
  it("火毒巫師 40：火焰箭 29 級", () => {
    expect(skillLevelsAt(210, 40, guides, data.skills).levels[2101004]).toBe(29);
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
  it("這個職業拿不到的武器不列（只有別的職業接得到的任務才給）", () => {
    const glove = gear.weapons.find(weapon => weapon.s === "拳套" && weapon.id === 1472019)!;
    const quest = (jobs: number[]) => ({ id: "q", n: "測試任務", jobs });
    const hidden: GearWeapon = { ...glove, id: 1479999, src: { quests: [quest([310])] } };
    const shown: GearWeapon = { ...glove, id: 1479998, src: { quests: [quest([410])] } };
    const picked = weaponChoices({ ...gear, weapons: [...gear.weapons, hidden, shown] }, 410).map(weapon => weapon.id);
    expect(picked).toContain(1479998);
    expect(picked).not.toContain(1479999);
  });
  it("真資料：刺客的主推武器赤紅手甲在選單裡", () => {
    expect(weaponChoices(gear, 410).map(weapon => weapon.id)).toContain(1472019);
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

  const byId = new Map(data.monsters.map(monster => [monster.id, monster]));
  const choiceById = new Map(monsterChoices(data.monsters, data.maps).map(choice => [choice.monster.id, choice]));
  const choiceOf = (id: number | null) => (id === null ? undefined : choiceById.get(id));
  const beforeOpen = { ...data, beforeOpen: true };

  it("還沒開（10/15 前）：預設怪不是只在 V002 才有的怪（刺客 56 原本排第一的野狼只在 V002）", () => {
    // 開放後照排行第一名，不擋
    expect(defaultMonster(data, 410, 56)).toBe(5130104);
    expect(choiceOf(5130104)?.v002).toBe(true);
    const id = defaultMonster(beforeOpen, 410, 56);
    expect(id).not.toBeNull();
    expect(id).not.toBe(5130104);
    expect(choiceOf(id)?.v002).toBe(false);
  });
  it("跳過王圖（刷怪點 3 個以下）：刺客 92 原本排第一的是巴洛古那張王圖", () => {
    const id = defaultMonster(data, 410, 92);
    expect(id).not.toBe(8130100);
    if (id !== null) {
      const leadsOnRealMaps = planTraining({ job: 410, level: 92 }, data.training, byId, 30)
        .filter(pick => pick.row.sp > BOSS_SPAWN_MAX)
        .map(pick => pick.lead?.id);
      expect(leadsOnRealMaps).toContain(id);
    }
  });
  it("每個等級的預設怪（有的話）都在怪物選單裡；還沒開時不是 V002 限定", () => {
    for (const job of [410, 210]) {
      for (let level = clampLevel(job, 1); level <= LEVEL_CAP; level += 1) {
        for (const source of [data, beforeOpen]) {
          const id = defaultMonster(source, job, level);
          if (id === null) continue;
          const choice = choiceOf(id);
          expect(choice, `${job} Lv${level} 預設怪 ${id} 不在選單`).toBeDefined();
          if (source.beforeOpen) expect(choice?.v002, `${job} Lv${level} 預設怪 ${id} 是 V002 限定`).toBe(false);
        }
      }
    }
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
  it("有選怪、沒有彈藥的法師也照原樣讀回來", () => {
    const group = { ...defaultGroup(data, 210, 40, null), ammoId: null, charge: null };
    const state = { shared: { job: 210, skillId: 2101004, skillLevel: 29, monsterId: 5130104 }, groups: [group, { ...group, level: 120 }] };
    expect(parseState(JSON.stringify(state))).toEqual(state);
  });

  type Loose = { shared: Record<string, unknown>; groups: Array<Record<string, unknown>> };
  const valid = (): Loose => {
    const group = defaultGroup(data, 410, 50, null);
    return JSON.parse(JSON.stringify({ shared: { job: 410, skillId: 4001344, skillLevel: 20, monsterId: null }, groups: [group, group] }));
  };
  const cases: Array<[string, (state: Loose) => void]> = [
    ["能力值是 null", state => { state.groups[0].stats = null; }],
    ["能力值少一項", state => { delete (state.groups[1].stats as Record<string, unknown>).LUK; }],
    ["能力值不是數字", state => { (state.groups[0].stats as Record<string, unknown>).DEX = "90"; }],
    ["技能等級表是 null", state => { state.groups[0].levels = null; }],
    ["技能等級表不是物件", state => { state.groups[1].levels = "x"; }],
    ["技能等級表是陣列", state => { state.groups[1].levels = [1, 2]; }],
    ["技能等級不是數字", state => { state.groups[0].levels = { 4001344: "20" }; }],
    ["等級是 null（NaN 存成 null）", state => { state.groups[0].level = null; }],
    ["等級 0", state => { state.groups[0].level = 0; }],
    ["等級超過上限", state => { state.groups[1].level = LEVEL_CAP + 1; }],
    ["武器 id 不是數字也不是 null", state => { state.groups[0].weaponId = "1472019"; }],
    ["武器 id 沒存", state => { delete state.groups[0].weaponId; }],
    ["彈藥 id 不是數字也不是 null", state => { state.groups[1].ammoId = false; }],
    ["充能不是數字也不是 null", state => { state.groups[0].charge = "1"; }],
    ["其他攻擊是 null", state => { state.groups[0].extra = null; }],
    ["其他攻擊不是數字", state => { state.groups[0].extra = "3"; }],
    ["增益不是陣列", state => { state.groups[0].buffs = null; }],
    ["增益裡有不是數字的", state => { state.groups[1].buffs = [1, "x"]; }],
    ["點法標籤不是字串也不是 null", state => { state.groups[0].tab = 5; }],
    ["怪物 id 沒存", state => { delete state.shared.monsterId; }],
    ["怪物 id 不是數字也不是 null", state => { state.shared.monsterId = "5130104"; }],
    ["職業不是經典版的", state => { state.shared.job = 999999; }],
    ["職業是初心者", state => { state.shared.job = 0; }],
    ["職業不是數字", state => { state.shared.job = "410"; }],
    ["技能 id 是 null", state => { state.shared.skillId = null; }],
    ["技能等級是 null", state => { state.shared.skillLevel = null; }],
    ["只有一組", state => { state.groups.pop(); }],
    ["其中一組是 null", state => { state.groups[1] = null as unknown as Record<string, unknown>; }],
  ];
  it.each(cases)("缺欄位或型別不對就當沒記：%s", (_name, edit) => {
    const ok = valid();
    expect(parseState(JSON.stringify(ok))).not.toBeNull();
    const broken = valid();
    edit(broken);
    expect(parseState(JSON.stringify(broken))).toBeNull();
  });
});
