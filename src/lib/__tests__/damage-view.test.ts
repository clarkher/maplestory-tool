/**
 * 傷害計算機的預設值與組裝（src/lib/damage-view.ts），用真資料（public/data）跑：
 * 跟 gear-realdata.test.ts 一樣直接讀檔，不用假資料撐。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GearData, GearWeapon } from "@/lib/gear";
import { BASIC_ATTACK } from "@/lib/damage-skills";
import { gearPlan } from "@/lib/gear-view";
import { BOSS_SPAWN_MAX } from "@/lib/now-plan";
import { planTraining } from "@/lib/planner";
import { LEVEL_CAP as PROFILE_LEVEL_CAP } from "@/lib/profile";
import type { GuideJob, MapRecord, Monster, Skill, TrainingRow } from "@/lib/types";
import {
  ammoChoices,
  clampLevel,
  clampState,
  computeGroup,
  defaultAmmo,
  defaultGroup,
  defaultMonster,
  defaultSkill,
  defaultState,
  diffText,
  groupLabels,
  killLists,
  LEVEL_CAP,
  monsterChoices,
  parseState,
  regroup,
  sameGroups,
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
  it("等級夾回職業的範圍：暗殺者（三轉）記成 10 級→70；合法的等級原封不動", () => {
    const group = defaultGroup(data, 411, 80, null);
    const bad = { shared: { job: 411, skillId: BASIC_ATTACK, skillLevel: 1, monsterId: null }, groups: [{ ...group, level: 10 }, { ...group, level: 200 }] as [typeof group, typeof group] };
    const fixed = clampState(bad);
    expect(fixed.groups.map(entry => entry.level)).toEqual([70, LEVEL_CAP]);
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
  it("狂戰士 50（沒有第二套）：右邊同一套、等級拉到下一把武器、武器是那把", () => {
    const state = defaultState(data, 110, 50, null);
    const next = gearPlanNext(110, 50);
    expect(next).not.toBeNull();
    expect(state.groups[1].level).toBe(next!.lv);
    expect(state.groups[1].weaponId).toBe(next!.id);
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
