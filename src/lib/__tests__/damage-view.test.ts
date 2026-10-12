/**
 * 傷害計算機的預設值與組裝（src/lib/damage-view.ts），用真資料（public/data）跑：
 * 跟 gear-realdata.test.ts 一樣直接讀檔，不用假資料撐。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GearData, GearWeapon } from "@/lib/gear";
import { attackSkillIds, BASIC_ATTACK, HEAL } from "@/lib/damage-skills";
import { actionMs, dragonRoarStunMs, SPEED_UNKNOWN } from "@/lib/damage-speed";
import { gearPlan } from "@/lib/gear-view";
import { BOSS_SPAWN_MAX } from "@/lib/now-plan";
import { planTraining } from "@/lib/planner";
import { LEVEL_CAP as PROFILE_LEVEL_CAP } from "@/lib/profile";
import type { GuideJob, MapRecord, Monster, Skill, TrainingRow } from "@/lib/types";
import {
  ammoChoices,
  boosterFor,
  clampLevel,
  clampState,
  computeGroup,
  defaultAmmo,
  defaultGroup,
  defaultMonster,
  defaultSkill,
  defaultState,
  diffText,
  expRateText,
  groupLabels,
  killLists,
  levelNoticeText,
  monsterStats,
  LEVEL_CAP,
  monsterChoices,
  parseState,
  regroup,
  relevel,
  sameGroups,
  secondsText,
  undeadDefault,
  withSkill,
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

describe("組名（結果卡、名單、差多少用；上方分頁固定寫左組／右組）", () => {
  const base = defaultGroup(data, 410, 50, null);
  it("點法不同寫點法名", () => {
    expect(groupLabels([base, { ...base, tab: "全幸" }], gear.weapons)).toEqual(["一般點法", "全幸"]);
  });
  it("同點法、武器不同寫武器名", () => {
    expect(groupLabels([base, { ...base, weaponId: 1472020 }], gear.weapons)).toEqual(["赤紅手甲", "藍寶手甲"]);
  });
  it("都一樣寫左組、右組", () => {
    expect(groupLabels([base, base], gear.weapons)).toEqual(["左組", "右組"]);
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
  it("等級夾回職業的範圍、兩組統一用左組的（等級兩組共用）：暗殺者（三轉）記成 10 級→70；合法的原封不動", () => {
    const group = defaultGroup(data, 411, 80, null);
    const bad = { shared: { job: 411, skillId: BASIC_ATTACK, skillLevel: 1, monsterId: null }, groups: [{ ...group, level: 10 }, { ...group, level: 200 }] as [typeof group, typeof group] };
    const fixed = clampState(bad);
    expect(fixed.groups.map(entry => entry.level)).toEqual([70, 70]);
    const split = { ...bad, groups: [{ ...group, level: 90 }, { ...group, level: 100 }] as [typeof group, typeof group] };
    expect(clampState(split).groups.map(entry => entry.level)).toEqual([90, 90]);
    expect(fixed.shared).toEqual(bad.shared);
    expect(fixed.groups[0].stats).toEqual(bad.groups[0].stats);
    const valid = defaultState(data, 410, 50, null);
    expect(clampState(valid)).toEqual(valid);
    const mage = defaultState(data, 210, 40, null);
    expect(clampState(mage)).toEqual(mage);
  });
  it("有選怪、沒有彈藥的法師也照原樣讀回來", () => {
    const group = { ...defaultGroup(data, 210, 40, null), ammoId: null, charge: null };
    const state = { shared: { job: 210, skillId: 2101004, skillLevel: 29, monsterId: 5130104 }, groups: [group, { ...group, level: 120 }] };
    expect(parseState(JSON.stringify(state))).toEqual(state);
  });

  it("舊版記下的設定沒有武器攻擊這欄：照樣讀回來、當作沒改（null）", () => {
    const group = defaultGroup(data, 410, 50, null) as Record<string, unknown>;
    const { weaponAtk: _drop, ...old } = group;
    const parsed = parseState(JSON.stringify({ shared: { job: 410, skillId: 4001344, skillLevel: 20, monsterId: null }, groups: [old, old] }));
    expect(parsed).not.toBeNull();
    expect(parsed!.groups.map(entry => entry.weaponAtk)).toEqual([null, null]);
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
    ["武器攻擊不是數字也不是 null", state => { state.groups[0].weaponAtk = "30"; }],
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

describe("怪物的 HP 跟經驗（v0.86 使用者：打哪隻怪、滑鼠移過去都要看得到）", () => {
  it("「HP 3,200・經驗 135」：數字加千分位", () => {
    const dragon = data.monsters.find(monster => monster.n === "青龍")!;
    expect(monsterStats(dragon)).toBe(`HP ${dragon.hp.toLocaleString()}・經驗 ${dragon.exp.toLocaleString()}`);
    expect(monsterStats({ hp: 25000, exp: 1210 })).toBe("HP 25,000・經驗 1,210");
  });
});

describe("要不 miss 命中要多少（v0.85 使用者選 A：物理一條、法師用魔法那條）", () => {
  const monster = { ...data.monsters[0], lv: 55, pdd: 0, mdd: 0, eva: 20, el: undefined };
  it("物理職業：必中門檻，標物理", () => {
    const group = defaultGroup(data, 410, 50, null);
    const result = computeGroup(data, { job: 410, skillId: 4001344, skillLevel: 20, monsterId: null }, group, monster);
    if (!result.ok) throw new Error(result.reason);
    expect(result.vs!.accuracy).toBe(Math.ceil(20 * (3.68 + 0.14 * 5)));
    expect(result.vs!.accuracyKind).toBe("physical");
  });
  it("法師：魔法必中門檻，標魔法", () => {
    const mage = defaultGroup(data, 210, 50, null);
    const result = computeGroup(data, { job: 210, skillId: 2101004, skillLevel: 30, monsterId: null }, mage, monster);
    if (!result.ok) throw new Error(result.reason);
    expect(result.vs!.accuracy).toBe(26);
    expect(result.vs!.accuracyKind).toBe("magic");
  });
});

describe("屬性加成寫在結果卡（v0.84 使用者選 A）", () => {
  const mage = defaultGroup(data, 210, 40, null);
  const fireArrow = { job: 210, skillId: 2101004, skillLevel: 30, monsterId: null };
  const target = (el?: Record<string, string>) => ({ ...data.monsters[0], lv: 1, pdd: 0, mdd: 0, el });
  const note = (shared: typeof fireArrow, group: typeof mage, el?: Record<string, string>) => {
    const result = computeGroup(data, shared, group, target(el));
    if (!result.ok) throw new Error(result.reason);
    return result.elementNote;
  };
  it("火焰箭打怕火的怪：火屬性打弱點 ×1.5", () => {
    expect(note(fireArrow, mage, { f: "w" })).toBe("火屬性打弱點 ×1.5");
  });
  it("打抗火的：×0.5；免疫：對牠無效、每下只剩 1", () => {
    expect(note(fireArrow, mage, { f: "r" })).toBe("火屬性打抗性 ×0.5");
    expect(note(fireArrow, mage, { f: "i" })).toBe("火屬性對牠無效，每下只剩 1");
  });
  it("聖屬性寫「神聖屬性」（客戶端用字）", () => {
    const priest = defaultGroup(data, 230, 40, null);
    expect(note({ job: 230, skillId: 2301005, skillLevel: 30, monsterId: null }, priest, { h: "w" })).toBe("神聖屬性打弱點 ×1.5");
  });
  it("怪沒有那個屬性的弱點抗性、沒選怪、招式沒有屬性：不寫", () => {
    expect(note(fireArrow, mage, { i: "w" })).toBeNull();
    expect(note(fireArrow, mage, undefined)).toBeNull();
    const raw = computeGroup(data, fireArrow, mage, null);
    if (!raw.ok) throw new Error(raw.reason);
    expect(raw.elementNote).toBeNull();
    const assassin = defaultGroup(data, 410, 50, null);
    expect(note({ job: 410, skillId: 4001344, skillLevel: 20, monsterId: null }, assassin, { f: "w" })).toBeNull();
  });
  it("白騎士充能：寫屬性跟弱點的倍數（滿等 ×1.5，充能本身的殺傷力另外算）", () => {
    const base = defaultGroup(data, 121, 80, null);
    // 烈焰之劍要拿劍：挑一把騎士用得到的劍（預設武器可能是棍）
    const sword = weaponChoices(gear, 121).find(w => w.s === "單手劍" || w.s === "雙手劍")!;
    const knight = { ...base, weaponId: sword.id, charge: 1211003, levels: { ...base.levels, 1211003: 30 } };
    expect(note({ job: 121, skillId: BASIC_ATTACK, skillLevel: 1, monsterId: null }, knight, { f: "w" })).toBe("火屬性打弱點 ×1.5");
  });
});

describe("算一組", () => {
  const shared = { job: 410, skillId: 4001344, skillLevel: 20, monsterId: null };
  const group = defaultGroup(data, 410, 50, null);
  it("刺客 50 一般點法雙飛斬：能力視窗 175～292、每鏢乘 150%、一次 2 鏢", () => {
    const result = computeGroup(data, shared, { ...group, levels: { ...group.levels, 4100000: 20, 4100001: 30 } }, null);
    if (!result.ok) throw new Error(result.reason);
    expect(result.panel).toEqual({ min: 175, max: 292 });
    expect(result.hits).toBe(2);
    // 幸 172、總攻 41：每鏢 172×2.5×41÷100×1.5＝264.45 → 264；172×5×41÷100×1.5＝528.9 → 528
    expect(result.raw.hit).toEqual({ min: 264, max: 528 });
    expect(result.raw.use).toEqual({ min: 528, max: 1056 });
    // 強力投擲 30 級：機率 50%、爆擊 150%＋100%
    expect(result.critRate).toBeCloseTo(0.5);
    expect(result.raw.crit!.hit).toEqual({ min: 440, max: 881 });
  });
  it("選了怪：扣防禦、算幾次打死、必中命中", () => {
    const dragon = data.monsters.find(monster => monster.n === "青龍")!;
    const result = computeGroup(data, shared, group, dragon);
    if (!result.ok) throw new Error(result.reason);
    expect(result.vs).not.toBeNull();
    expect(result.vs!.hit.max).toBeLessThan(result.raw.hit.max);
    expect(result.vs!.kills.avg).toBeGreaterThan(0);
    expect(result.vs!.accuracy).toBeGreaterThan(0);
  });
  it("武器用不了這個技能：寫原因不給數字", () => {
    const result = computeGroup(data, { ...shared, skillId: 4001334, skillLevel: 20 }, group, null);
    expect(result).toEqual({ ok: false, reason: "拳套用不了劈空斬" });
  });
  it("沒算的技能：寫原因", () => {
    const result = computeGroup(data, { ...shared, job: 111, skillId: 1111003, skillLevel: 30 }, defaultGroup(data, 111, 80, null), null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("鬥氣");
  });
  it("法師：魔攻＝智力＋武器魔攻＋其他；火焰箭打火弱的怪 ×1.5、法師沒有爆擊", () => {
    const mage = defaultGroup(data, 210, 40, null);
    const shared210 = { job: 210, skillId: 2101004, skillLevel: 30, monsterId: null };
    const raw = computeGroup(data, shared210, mage, null);
    if (!raw.ok) throw new Error(raw.reason);
    const weapon = gear.weapons.find(w => w.id === mage.weaponId)!;
    expect(raw.magicPower).toBe(mage.stats.INT + (weapon.mag ?? 0));
    expect(raw.critRate).toBeNull();
    // 沒有防禦、等級比角色低的假靶，只差在火弱不弱
    const plainTarget = { ...data.monsters[0], lv: 1, pdd: 0, mdd: 0, el: undefined };
    const weakTarget = { ...plainTarget, el: { f: "w" } };
    const plain = computeGroup(data, shared210, mage, plainTarget);
    const weak = computeGroup(data, shared210, mage, weakTarget);
    if (!plain.ok || !weak.ok) throw new Error("算不出來");
    expect(Math.abs(weak.vs!.hit.max - plain.vs!.hit.max * 1.5)).toBeLessThanOrEqual(1);
  });
  it("穿不上的武器照算，寫差幾點", () => {
    const weak = { ...group, stats: { ...group.stats, DEX: 25 } };
    const result = computeGroup(data, shared, weak, null);
    if (!result.ok) throw new Error(result.reason);
    expect(result.short).toEqual([{ stat: "DEX", short: 65 }]);
  });
});

describe("兩組預設", () => {
  it("刺客 50：左一般點法、右全幸，同等級；技能預設雙飛斬", () => {
    const state = defaultState(data, 410, 50, null);
    expect(state.groups[0].tab).toBe("一般點法");
    expect(state.groups[1].tab).toBe("全幸");
    expect(state.groups[1].level).toBe(50);
    expect(state.shared.skillId).toBe(4001344);
    expect(state.shared.monsterId).not.toBeNull();
  });
  it("首頁選了全幸：左全幸、右一般點法", () => {
    const state = defaultState(data, 410, 50, "全幸");
    expect(state.groups[0].tab).toBe("全幸");
    expect(state.groups[1].tab).toBe("一般點法");
  });
  it("狂戰士 50（沒有第二套）：右邊同一套、同等級（等級兩組共用）、武器換下一把，結果卡寫要幾等才拿得到", () => {
    const state = defaultState(data, 110, 50, null);
    const next = gearPlanNext(110, 50);
    expect(next).not.toBeNull();
    expect(state.groups[1].level).toBe(50);
    expect(state.groups[1].weaponId).toBe(next!.id);
    const result = computeGroup(data, state.shared, state.groups[1], null);
    if (!result.ok) throw new Error(result.reason);
    expect(result.warnings).toContain(`要 Lv.${next!.lv} 才拿得到（照樣算）`);
    expect(result.levelNeeded).toBe(next!.lv);
    const left = computeGroup(data, state.shared, state.groups[0], null);
    if (!left.ok) throw new Error(left.reason);
    expect(left.warnings.some(text => text.startsWith("要 Lv."))).toBe(false);
    expect(left.levelNeeded).toBeNull();
  });
  it("換點法、換等級：能力值、武器重設成那套那級的預設，其他攻擊、增益留著", () => {
    const group = { ...defaultGroup(data, 410, 50, null), extra: 7, buffs: [] };
    const changed = regroup(data, 410, group, { tab: "全幸" });
    expect(changed.tab).toBe("全幸");
    expect(changed.stats.LUK).toBe(237);
    expect(changed.extra).toBe(7);
    expect(regroup(data, 410, group, { level: 60 }).level).toBe(60);
  });
  it("已經最強那把（狂戰士 90）：沒有下一把可換，兩組預設一樣", () => {
    const state = defaultState(data, 110, 90, null);
    expect(sameGroups(state.groups)).toBe(true);
  });
  it("兩組一樣看得出來", () => {
    const group = defaultGroup(data, 410, 50, null);
    expect(sameGroups([group, { ...group }])).toBe(true);
    expect(sameGroups([group, { ...group, extra: 1 }])).toBe(false);
  });
});

describe("換等級（等級在最上面、兩組共用）", () => {
  it("兩組一起換成新等級，各自的點法留著，能力值重設成那一級的預設", () => {
    const state = defaultState(data, 410, 50, null);
    const next = relevel(data, state, 60);
    expect(next.groups.map(group => group.level)).toEqual([60, 60]);
    expect(next.groups.map(group => group.tab)).toEqual(["一般點法", "全幸"]);
    expect(next.groups[0].stats).toEqual(defaultGroup(data, 410, 60, "一般點法").stats);
  });
  it("沒有第二套的職業：右組照樣換成那一級的下一把武器", () => {
    const state = defaultState(data, 110, 50, null);
    const next = relevel(data, state, 55);
    const want = gearPlanNext(110, 55);
    expect(next.groups[1].weaponId).toBe(want ? want.id : next.groups[0].weaponId);
    expect(next.groups[0].weaponId).toBe(defaultGroup(data, 110, 55, null).weaponId);
  });
  it("其他攻擊、增益留著；武器攻擊改過的會重設", () => {
    const state = defaultState(data, 410, 50, null);
    const touched = { ...state, groups: [{ ...state.groups[0], extra: 5, weaponAtk: 33 }, state.groups[1]] as typeof state.groups };
    const next = relevel(data, touched, 60);
    expect(next.groups[0].extra).toBe(5);
    expect(next.groups[0].weaponAtk).toBeNull();
  });
  it("怪是預設那隻就跟著換成新等級的預設；自己選的留著", () => {
    const state = defaultState(data, 410, 50, null);
    expect(relevel(data, state, 70).shared.monsterId).toBe(defaultMonster(data, 410, 70));
    const picked = { ...state, shared: { ...state.shared, monsterId: 2110200 } };
    expect(relevel(data, picked, 70).shared.monsterId).toBe(2110200);
  });
  it("技能等級跟著技能點法在新等級點到的級數（沒點到就留原本的）", () => {
    const state = defaultState(data, 410, 30, null);
    const next = relevel(data, state, 50);
    expect(next.shared.skillLevel).toBe(next.groups[0].levels[next.shared.skillId] || state.shared.skillLevel);
  });
  it("等級夾在職業範圍（暗殺者不可能 10 級）", () => {
    const state = defaultState(data, 411, 80, null);
    expect(relevel(data, state, 10).groups.map(group => group.level)).toEqual([70, 70]);
  });
});

describe("等級打字防呆的說明（v0.83：等級改成輸入＋上下切）", () => {
  it("打的比這個職業的最低等級低：拉到最低並寫是幾轉", () => {
    expect(levelNoticeText(411, 50)).toBe("三轉最低 70 等，已調成 70");
    expect(levelNoticeText(410, 25)).toBe("二轉最低 30 等，已調成 30");
    expect(levelNoticeText(200, 5)).toBe("一轉最低 8 等，已調成 8");
  });
  it("打超過上限：調成 120", () => {
    expect(levelNoticeText(410, 200)).toBe(`等級上限 ${LEVEL_CAP}，已調成 ${LEVEL_CAP}`);
  });
  it("合法的等級不寫", () => {
    expect(levelNoticeText(410, 50)).toBeNull();
    expect(levelNoticeText(411, 70)).toBeNull();
    expect(levelNoticeText(410, LEVEL_CAP)).toBeNull();
  });
});

describe("武器攻擊可以改（衝卷）", () => {
  const shared = { job: 410, skillId: 4001344, skillLevel: 20, monsterId: null };
  const group = defaultGroup(data, 410, 50, null);
  it("預設沒改（null），照武器原本的攻擊", () => {
    expect(group.weaponAtk).toBeNull();
  });
  it("改成 30：總攻擊比原本（赤紅手甲 26）多 4", () => {
    const before = computeGroup(data, shared, group, null);
    const after = computeGroup(data, shared, { ...group, weaponAtk: 30 }, null);
    if (!before.ok || !after.ok) throw new Error("算不出來");
    expect(after.attack - before.attack).toBe(4);
  });
  it("法師改的是武器魔攻", () => {
    const mage = defaultGroup(data, 210, 40, null);
    const weapon = gear.weapons.find(w => w.id === mage.weaponId)!;
    const result = computeGroup(data, { job: 210, skillId: 2101004, skillLevel: 30, monsterId: null }, { ...mage, weaponAtk: (weapon.mag ?? 0) + 10 }, null);
    if (!result.ok) throw new Error(result.reason);
    expect(result.magicPower).toBe(mage.stats.INT + (weapon.mag ?? 0) + 10);
  });
  it("換點法、換武器（regroup）會把改過的武器攻擊清掉", () => {
    expect(regroup(data, 410, { ...group, weaponAtk: 40 }, { tab: "全幸" }).weaponAtk).toBeNull();
  });
});

describe("一下／兩下打死", () => {
  const state = defaultState(data, 410, 50, null);
  const choices = monsterChoices(data.monsters, data.maps);
  const lists = killLists(data, { ...state.shared, skillId: 4001344, skillLevel: 20 }, state.groups[0], choices)!;
  it("兩張不重複、等級高到低", () => {
    const one = new Set(lists.one.map(entry => entry.monster.id));
    expect(lists.two.every(entry => !one.has(entry.monster.id))).toBe(true);
    for (const list of [lists.one, lists.two]) {
      expect(list.every((entry, index) => index === 0 || (list[index - 1].monster.lv ?? 0) >= (entry.monster.lv ?? 0))).toBe(true);
    }
  });
  it("差一點：中間值一下（或兩下）打得死、最低在那個下數打不死；差一點一下不跟一下打死重複，差一點兩下不跟其他三張重複；等級高到低", () => {
    const ids = (list: typeof lists.one) => new Set(list.map(entry => entry.monster.id));
    const [one, two, nearOne] = [ids(lists.one), ids(lists.two), ids(lists.nearOne)];
    expect(lists.nearOne.length).toBeGreaterThan(0);
    expect(lists.nearTwo.length).toBeGreaterThan(0);
    expect(lists.nearOne.every(entry => !one.has(entry.monster.id))).toBe(true);
    expect(lists.nearTwo.every(entry => !one.has(entry.monster.id) && !two.has(entry.monster.id) && !nearOne.has(entry.monster.id))).toBe(true);
    expect(lists.nearOne.every(entry => entry.midUse >= entry.monster.hp && entry.minUse < entry.monster.hp)).toBe(true);
    expect(lists.nearTwo.every(entry => entry.midUse < entry.monster.hp && entry.midUse * 2 >= entry.monster.hp && entry.minUse * 2 < entry.monster.hp)).toBe(true);
    for (const list of [lists.nearOne, lists.nearTwo]) {
      expect(list.every((entry, index) => index === 0 || (list[index - 1].monster.lv ?? 0) >= (entry.monster.lv ?? 0))).toBe(true);
    }
  });
  it("一下＝最低一次 ≥ HP；兩下＝最低一次×2 ≥ HP", () => {
    expect(lists.one.length).toBeGreaterThan(0);
    expect(lists.one.every(entry => entry.minUse >= entry.monster.hp)).toBe(true);
    expect(lists.two.every(entry => entry.minUse < entry.monster.hp && entry.minUse * 2 >= entry.monster.hp)).toBe(true);
  });
});

describe("差多少的字", () => {
  const ok = (expectedUse: number) => ({ ok: true, expectedUse }) as unknown as Parameters<typeof diffText>[1];
  it("大的比小的多幾 %；有一組算不出來不寫", () => {
    expect(diffText(["一般點法", "全幸"], ok(611.8), ok(591.6))).toBe("一般點法比全幸多約 3%");
    expect(diffText(["一般點法", "全幸"], ok(591.6), ok(611.8))).toBe("全幸比一般點法多約 3%");
    expect(diffText(["A", "B"], { ok: false, reason: "x" }, ok(1))).toBeNull();
  });
  it("四捨五入後是 0 寫差不多；差 0.6% 四捨五入是 1，寫多約 1%", () => {
    expect(diffText(["A", "B"], ok(100), ok(100.3))).toBe("兩組差不多");
    expect(diffText(["A", "B"], ok(100.6), ok(100))).toBe("A比B多約 1%");
  });
});

function gearPlanNext(job: number, level: number) {
  return gearPlan(gear, job, level, false, null).next;
}

// 下面是照真資料多補的：預設技能怎麼挑、槍連擊／矛連擊吃每一級說明、沒練功圖的等級不選怪也算得出來
describe("預設技能", () => {
  it("沒有攻擊技能點的劍士 10：普通攻擊；刺客 50：雙飛斬 20；火毒巫師 50：火焰箭 30", () => {
    expect(defaultSkill(data, 100, defaultGroup(data, 100, 10, null))).toEqual({ skillId: BASIC_ATTACK, skillLevel: 1 });
    expect(defaultSkill(data, 410, defaultGroup(data, 410, 50, null))).toEqual({ skillId: 4001344, skillLevel: 20 });
    expect(defaultSkill(data, 210, defaultGroup(data, 210, 50, null))).toEqual({ skillId: 2101004, skillLevel: 30 });
  });
});

describe("槍連擊、矛連擊", () => {
  const dragon = defaultGroup(data, 131, 90, null);
  const spear = (skillId: number, skillLevel: number) => computeGroup(data, { job: 131, skillId, skillLevel, monsterId: null }, dragon, null);
  it("用槍打槍連擊：1 級 55% 兩下、30 級 170% 三下（來自每一級的說明）", () => {
    const low = spear(1311001, 1);
    const high = spear(1311001, 30);
    if (!low.ok || !high.ok) throw new Error("算不出來");
    expect([low.hits, high.hits]).toEqual([2, 3]);
    expect(Math.abs(high.raw.hit.max - (low.raw.hit.max * 170) / 55)).toBeLessThanOrEqual(170 / 55);
  });
  it("拿槍不能用矛連擊", () => {
    expect(spear(1311002, 30)).toEqual({ ok: false, reason: "槍用不了矛連擊" });
  });
});

describe("沒點精準技能的提醒（熟練度只有 10%）", () => {
  const warningsOf = (job: number, level: number, patch?: (group: ReturnType<typeof defaultGroup>) => void) => {
    const state = defaultState(data, job, level, null);
    const group = structuredClone(state.groups[0]);
    patch?.(group);
    const result = computeGroup(data, state.shared, group, null);
    if (!result.ok) throw new Error(result.reason);
    return result.warnings;
  };
  it("狂戰士 50：預設武器的精準之斧攻略是 0 級，寫沒點精準之斧、熟練度只有 10%、可以在技能等級改", () => {
    const state = defaultState(data, 110, 50, null);
    const weapon = gear.weapons.find(entry => entry.id === state.groups[0].weaponId)!;
    expect(weapon.s).toMatch(/斧/);
    expect(state.groups[0].levels[1100001] ?? 0).toBe(0);
    const warnings = warningsOf(110, 50);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("沒點精準之斧");
    expect(warnings[0]).toContain("熟練度只有 10%");
    expect(warnings[0]).toContain("技能等級");
  });
  it("把精準之斧設 20 級就沒有", () => {
    expect(warningsOf(110, 50, group => { group.levels = { ...group.levels, 1100001: 20 }; })).toEqual([]);
  });
  it("刺客 50：精準暗器有點，沒有", () => {
    expect(warningsOf(410, 50)).toEqual([]);
  });
  it("一轉、法師沒有精準技能，不寫", () => {
    expect(warningsOf(100, 20)).toEqual([]);
    expect(warningsOf(210, 40)).toEqual([]);
  });
  it("這句是提醒不是備註：不重複放進看細節的 notes", () => {
    const state = defaultState(data, 110, 50, null);
    const result = computeGroup(data, state.shared, state.groups[0], null);
    if (!result.ok) throw new Error(result.reason);
    expect(result.notes.join("")).not.toContain("熟練度只有 10%");
  });
});

describe("沒有練功圖的等級", () => {
  it("刺客 120：預設不選怪，照樣算得出打木樁", () => {
    const state = defaultState(data, 410, 120, null);
    expect(state.shared.monsterId).toBeNull();
    const result = computeGroup(data, state.shared, state.groups[0], null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.vs).toBeNull();
  });
});

describe("出一招幾秒、每秒經驗（v0.87 使用者 1A 只算打一隻、2A 開加速）", () => {
  const dragon = data.monsters.find(monster => monster.n === "青龍")!;
  const weaponOf = (id: number) => gear.weapons.find(weapon => weapon.id === id)!;
  /** 刺客 50 拿鋼鐵鬥拳（攻速 4），極速暗殺點到 level、開加速 on */
  const assassin = (level: number, on: boolean) => {
    const state = defaultState(data, 410, 50, null);
    const group = { ...state.groups[0], weaponId: 1472008, weaponAtk: null, levels: { ...state.groups[0].levels, 4101003: level }, booster: on };
    return { shared: { ...state.shared, skillId: 4001344, skillLevel: 20 }, group };
  };
  it("有學極速暗殺、開加速：拳套攻速 4 −2 階＝2 階，雙飛斬 600 毫秒", () => {
    const { shared, group } = assassin(1, true);
    const result = computeGroup(data, shared, group, dragon);
    if (!result.ok) throw new Error(result.reason);
    expect(weaponOf(1472008).spd).toBe(4);
    expect(result.speed).toEqual({ ms: actionMs(800, 2), tier: 2, boosted: true, stun: false, fixed: false });
    expect(result.speed?.ms).toBe(600);
  });
  it("關掉加速：照武器 4 階 720 毫秒；沒學（0 級）勾著也不算", () => {
    const off = assassin(1, false);
    const offResult = computeGroup(data, off.shared, off.group, dragon);
    expect(offResult.ok && offResult.speed).toEqual({ ms: 720, tier: 4, boosted: false, stun: false, fixed: false });
    const unlearned = assassin(0, true);
    const unlearnedResult = computeGroup(data, unlearned.shared, unlearned.group, dragon);
    expect(unlearnedResult.ok && unlearnedResult.speed).toEqual({ ms: 720, tier: 4, boosted: false, stun: false, fixed: false });
  });
  it("每秒經驗＝經驗÷(約幾次打死×秒)，只算打一隻", () => {
    const { shared, group } = assassin(1, true);
    const result = computeGroup(data, shared, group, dragon);
    if (!result.ok || !result.vs) throw new Error("算不出來");
    expect(result.vs.expPerSec).toBeCloseTo(dragon.exp / (result.vs.kills.avg * 0.6));
  });
  it("沒選怪沒有每秒經驗（vs 是 null），出一招幾秒照樣有", () => {
    const { shared, group } = assassin(1, true);
    const result = computeGroup(data, shared, group, null);
    expect(result.ok && result.vs).toBeNull();
    expect(result.ok && result.speed?.ms).toBe(600);
  });
  it("加速要對得上武器：狂戰士拿斧頭只有快速之劍有學 → 不算加速", () => {
    const state = defaultState(data, 110, 50, null);
    const axe = gear.weapons.find(weapon => weapon.s === "雙手斧" && weapon.lv <= 50)!;
    const group = { ...state.groups[0], weaponId: axe.id, weaponAtk: null, levels: { ...state.groups[0].levels, 1101004: 20, 1101005: 0 }, booster: true };
    const result = computeGroup(data, { ...state.shared, skillId: BASIC_ATTACK, skillLevel: 1 }, group, null);
    expect(result.ok && result.speed).toEqual({ ms: actionMs(800, axe.spd!), tier: axe.spd, boosted: false, stun: false, fixed: false });
    expect(boosterFor(data, 110, "雙手斧")?.id).toBe(1101005);
    expect(boosterFor(data, 110, "單手劍")?.id).toBe(1101004);
    expect(boosterFor(data, 100, "單手劍")).toBeUndefined();
  });
  it("法師固定 6 階、不看法杖攻速：極速詠唱 20 級 −2 → 魔靈彈 720、5 級 −1 → 750、關掉 810", () => {
    const state = defaultState(data, 211, 80, null);
    const speedOf = (level: number, on: boolean) => {
      const group = { ...state.groups[0], levels: { ...state.groups[0].levels, 2111005: level }, booster: on };
      const result = computeGroup(data, { ...state.shared, skillId: 2001004, skillLevel: 20 }, group, null);
      return result.ok ? result.speed?.ms : null;
    };
    expect(speedOf(20, true)).toBe(720);
    expect(speedOf(5, true)).toBe(750);
    expect(speedOf(20, false)).toBe(810);
    expect(boosterFor(data, 211, "長杖")?.id).toBe(2111005);
    expect(boosterFor(data, 210, "長杖")).toBeUndefined();
  });
  it("龍咆哮一輪＝max(動作, 自暈)：30 級自暈 2 秒 → 2000 毫秒", () => {
    const state = defaultState(data, 131, 80, null);
    const result = computeGroup(data, { ...state.shared, skillId: 1311006, skillLevel: 30 }, state.groups[0], null);
    expect(result.ok && result.speed?.ms).toBe(Math.max(2000, dragonRoarStunMs(30)));
    expect(result.ok && result.speed?.stun).toBe(true);
    const low = computeGroup(data, { ...state.shared, skillId: 1311006, skillLevel: 5 }, state.groups[0], null);
    expect(low.ok && low.speed?.ms).toBe(4000);
  });
  it("海盜查不到：speed 是 null、每秒經驗 null，原因一句", () => {
    const state = defaultState(data, 510, 50, null);
    const result = computeGroup(data, { ...state.shared, skillId: 5001001, skillLevel: 20 }, state.groups[0], dragon);
    if (!result.ok) throw new Error(result.reason);
    expect(result.speed).toBeNull();
    expect(result.vs?.expPerSec).toBeNull();
    expect(SPEED_UNKNOWN).toContain("查不到");
  });
  it("物理武器沒有攻速資料：當查不到（不自己假設 6 階）", () => {
    const { shared, group } = assassin(1, true);
    const noSpeed = { ...data, gear: { ...gear, weapons: gear.weapons.map(weapon => (weapon.id === 1472008 ? { ...weapon, spd: undefined } : weapon)) } };
    const result = computeGroup(noSpeed, shared, group, dragon);
    expect(result.ok && result.speed).toBeNull();
    expect(result.ok && result.vs?.expPerSec).toBeNull();
  });
  it("預設開加速；換點法、換等級留著使用者關掉的；舊紀錄沒有這欄當開著", () => {
    const state = defaultState(data, 410, 50, null);
    expect(state.groups[0].booster).toBe(true);
    const off = { ...state.groups[0], booster: false };
    expect(regroup(data, 410, off, { level: 60 }).booster).toBe(false);
    const legacy = JSON.parse(JSON.stringify(state));
    delete legacy.groups[0].booster;
    delete legacy.groups[1].booster;
    expect(parseState(JSON.stringify(legacy))?.groups[0].booster).toBe(true);
    const broken = JSON.parse(JSON.stringify(state));
    broken.groups[0].booster = "yes";
    expect(parseState(JSON.stringify(broken))).toBeNull();
  });
});

describe("秒數、每秒經驗的寫法", () => {
  it("毫秒寫成秒：720 → 0.72、2000 → 2、1590 → 1.59", () => {
    expect(secondsText(720)).toBe("0.72");
    expect(secondsText(2000)).toBe("2");
    expect(secondsText(1590)).toBe("1.59");
  });
  it("每秒經驗：10 以上取整加千分位、以下一位小數、太小寫不到 0.1", () => {
    expect(expRateText(1234.6)).toBe("1,235");
    expect(expRateText(52.4)).toBe("52");
    expect(expRateText(8.26)).toBe("8.3");
    expect(expRateText(0.04)).toBe("不到 0.1");
    expect(expRateText(0)).toBe("0");
  });
});

describe("群體治癒（v0.88 使用者 3A 範圍內幾隻、4A 神聖不乘）", () => {
  const byName = (name: string) => data.monsters.find(monster => monster.n === name)!;
  const choices = monsterChoices(data.monsters, data.maps);
  /** 僧侶 50：智力 200、幸運 30、武器魔攻改成 60（魔攻＝260，跟研究算例同一組），群體治癒 30 級 */
  const cleric = (targets?: number) => {
    const state = defaultState(data, 230, 50, null);
    const group = { ...state.groups[0], stats: { STR: 4, DEX: 4, INT: 200, LUK: 30 }, weaponAtk: 60, extra: 0, buffs: [] };
    return { shared: { ...state.shared, skillId: HEAL, skillLevel: 30, ...(targets === undefined ? {} : { targets }) }, group };
  };
  it("僧侶、祭司的技能選單有群體治癒；預設技能不會挑它（只打得到不死系）", () => {
    expect(attackSkillIds(data.skills, 230)).toContain(HEAL);
    expect(attackSkillIds(data.skills, 231)).toContain(HEAL);
    expect(attackSkillIds(data.skills, 210)).not.toContain(HEAL);
    for (const level of [30, 50, 70]) expect(defaultState(data, 230, level, null).shared.skillId).not.toBe(HEAL);
  });
  it("打骷髏犬（魔防 190）：每一下 166～747，跟研究算例一樣；一次 1 下、魔攻 260", () => {
    const { shared, group } = cleric();
    const result = computeGroup(data, shared, group, byName("骷髏犬"));
    if (!result.ok || !result.vs) throw new Error(result.ok ? "沒有 vs" : result.reason);
    expect(result.vs.hit).toEqual({ min: 166, max: 747 });
    expect(result.hits).toBe(1);
    expect(result.magicPower).toBe(260);
    expect(result.vs.crit).toBeNull();
    expect(result.vs.accuracyKind).toBe("magic");
  });
  it("範圍內 3 隻：每隻 79～484（怪越多每隻越少）；沒寫隻數當 1 隻", () => {
    const three = cleric(3);
    const result = computeGroup(data, three.shared, three.group, byName("骷髏犬"));
    expect(result.ok && result.vs?.hit).toEqual({ min: 79, max: 484 });
  });
  it("選了不是不死系的怪：寫「群體治癒只打得到不死系的怪」", () => {
    const { shared, group } = cleric();
    const result = computeGroup(data, shared, group, byName("青龍"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("群體治癒只打得到不死系的怪");
  });
  it("神聖不乘（4A）：打怕神聖的怪寫一行「如果算神聖再 ×1.5」，不怕神聖的不寫", () => {
    const { shared, group } = cleric();
    const weak = computeGroup(data, shared, group, byName("骷髏犬"));
    expect(weak.ok && weak.elementNote).toBe("牠怕神聖屬性：如果群體治癒算神聖，再 ×1.5");
    const plain = computeGroup(data, shared, group, byName("冥界幽靈"));
    expect(plain.ok && plain.elementNote).toBeNull();
  });
  it("出一招固定 600 毫秒（不吃攻速）；每秒經驗算範圍內每一隻", () => {
    const three = cleric(3);
    const dog = byName("骷髏犬");
    const result = computeGroup(data, three.shared, three.group, dog);
    if (!result.ok || !result.vs) throw new Error("算不出來");
    expect(result.speed).toEqual({ ms: 600, tier: 6, boosted: false, stun: false, fixed: true });
    expect(result.vs.expPerSec).toBeCloseTo((dog.exp * 3) / (result.vs.kills.avg * 0.6));
  });
  it("一下兩下名單只有不死系", () => {
    const { shared, group } = cleric();
    const lists = killLists(data, shared, group, choices);
    if (!lists) throw new Error("沒有名單");
    const all = [...lists.one, ...lists.two, ...lists.nearOne, ...lists.nearTwo];
    expect(all.length).toBeGreaterThan(0);
    for (const entry of all) expect(entry.monster.und, entry.monster.n).toBe(1);
  });
  it("換成群體治癒時選的怪不是不死系：換成等級不超過角色、最高的不死系；都太高挑最低的；10/15 前跳過 V002", () => {
    expect(undeadDefault(choices, 50, false)).toBe(byName("大幽靈").id);
    expect(undeadDefault(choices, 10, false)).toBe(byName("殭屍菇菇").id);
    const before = undeadDefault(choices, 60, true);
    const pick = choices.find(choice => choice.monster.id === before)!;
    expect(pick.monster.und).toBe(1);
    expect(pick.v002).toBe(false);
    expect(pick.monster.lv).toBe(57);
  });
  it("withSkill：換成群體治癒、怪不是不死系 → 換怪；本來就是不死系 → 留著；換回別的技能不動怪", () => {
    const state = defaultState(data, 230, 50, null);
    const dragon = { ...state, shared: { ...state.shared, monsterId: byName("青龍").id } };
    expect(withSkill(dragon, { skillId: HEAL, skillLevel: 30 }, choices, false).shared.monsterId).toBe(byName("大幽靈").id);
    const dog = { ...state, shared: { ...state.shared, monsterId: byName("骷髏犬").id } };
    expect(withSkill(dog, { skillId: HEAL, skillLevel: 30 }, choices, false).shared.monsterId).toBe(byName("骷髏犬").id);
    expect(withSkill(dragon, { skillId: 2301005, skillLevel: 20 }, choices, false).shared.monsterId).toBe(byName("青龍").id);
  });
  it("記下的範圍內隻數要是 1～5 的整數；沒有這欄照收", () => {
    const state = defaultState(data, 230, 50, null);
    const save = (targets: unknown) => parseState(JSON.stringify({ ...state, shared: { ...state.shared, targets } }));
    expect(save(3)?.shared.targets).toBe(3);
    expect(save(0)).toBeNull();
    expect(save(6)).toBeNull();
    expect(save(2.5)).toBeNull();
    expect(save("3")).toBeNull();
    expect(parseState(JSON.stringify(state))).not.toBeNull();
  });
});
