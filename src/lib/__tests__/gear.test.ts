import { describe, expect, it } from "vitest";
import {
  canWear,
  closestSource,
  equipRequirement,
  isMagicJob,
  kitStats,
  nearestUpgrade,
  obtainableBy,
  questFits,
  rulesFor,
  scrollFamily,
  scrollPicks,
  statShortfall,
  statTargets,
  totalStats,
  weaponPicks,
  weaponTypesFor,
} from "@/lib/gear";
import type { GearKit, GearScroll, GearSource, GearWeapon, StatRule } from "@/lib/gear";

const source = (over: Partial<GearSource> = {}): GearSource => ({ ...over });

const weapon = (
  over: Partial<GearWeapon> & Pick<GearWeapon, "id" | "n" | "s" | "lv" | "job">,
): GearWeapon => ({ src: source(), ...over });

const scroll = (
  over: Partial<GearScroll> & Pick<GearScroll, "id" | "n" | "slot" | "stat" | "rate" | "effect">,
): GearScroll => ({ src: source(), ...over });

const rule = (
  over: Partial<StatRule> & Pick<StatRule, "jobs" | "label" | "main" | "secondary">,
): StatRule => ({ t: "", s: [], v: "tw", mainstream: true, ...over });

describe("totalStats", () => {
  it("5 倍等級加 20", () => {
    expect(totalStats(10)).toBe(70);
    expect(totalStats(35)).toBe(195);
  });
});

describe("weaponTypesFor", () => {
  it("劍士系：一轉六種，二三轉依熟練技能分流", () => {
    expect(weaponTypesFor(100)).toEqual(["單手劍", "雙手劍", "單手斧", "雙手斧", "單手棍", "雙手棍"]);
    expect(weaponTypesFor(110)).toEqual(["單手劍", "雙手劍", "單手斧", "雙手斧"]);
    expect(weaponTypesFor(111)).toEqual(weaponTypesFor(110));
    expect(weaponTypesFor(120)).toEqual(["單手劍", "雙手劍", "單手棍", "雙手棍"]);
    expect(weaponTypesFor(121)).toEqual(weaponTypesFor(120));
    expect(weaponTypesFor(130)).toEqual(["槍", "矛"]);
    expect(weaponTypesFor(131)).toEqual(["槍", "矛"]);
  });

  it("法師系都是短杖長杖", () => {
    for (const job of [200, 210, 211, 220, 221, 230, 231]) expect(weaponTypesFor(job)).toEqual(["短杖", "長杖"]);
  });

  it("弓箭手、盜賊、海盜二轉分流", () => {
    expect(weaponTypesFor(300)).toEqual(["弓", "弩"]);
    expect(weaponTypesFor(310)).toEqual(["弓"]);
    expect(weaponTypesFor(311)).toEqual(["弓"]);
    expect(weaponTypesFor(320)).toEqual(["弩"]);
    expect(weaponTypesFor(321)).toEqual(["弩"]);
    expect(weaponTypesFor(400)).toEqual(["拳套", "短刀"]);
    expect(weaponTypesFor(410)).toEqual(["拳套"]);
    expect(weaponTypesFor(420)).toEqual(["短刀"]);
    expect(weaponTypesFor(421)).toEqual(["短刀"]);
    expect(weaponTypesFor(500)).toEqual(["指虎", "火槍"]);
    expect(weaponTypesFor(510)).toEqual(["指虎"]);
    expect(weaponTypesFor(511)).toEqual(["指虎"]);
    expect(weaponTypesFor(520)).toEqual(["火槍"]);
    expect(weaponTypesFor(521)).toEqual(["火槍"]);
  });

  it("初心者與認不得的代碼是空陣列", () => {
    expect(weaponTypesFor(0)).toEqual([]);
    expect(weaponTypesFor(9999)).toEqual([]);
  });
});

describe("isMagicJob", () => {
  it("200 系（一二三轉）都是法師", () => {
    for (const job of [200, 210, 211, 220, 221, 230, 231]) expect(isMagicJob(job)).toBe(true);
  });

  it("其他系不是", () => {
    expect(isMagicJob(100)).toBe(false);
    expect(isMagicJob(110)).toBe(false);
    expect(isMagicJob(0)).toBe(false);
  });
});

describe("rulesFor", () => {
  const mainstream110 = rule({
    jobs: [110],
    label: "狂戰士主流",
    main: "STR",
    secondary: { stat: "DEX", type: "double-level", cap: 60 },
  });
  const alt110 = rule({ jobs: [110], label: "狂戰士其他點法", main: "STR", secondary: null, mainstream: false });
  const own111 = rule({
    jobs: [111],
    label: "十字軍主流",
    main: "STR",
    secondary: { stat: "DEX", type: "fixed", value: 60 },
  });

  it("三轉沒有自己的規則，沿用二轉的主流，inherited true", () => {
    const result = rulesFor([mainstream110, alt110], 111);
    expect(result.main).toBe(mainstream110);
    expect(result.others).toEqual([alt110]);
    expect(result.inherited).toBe(true);
  });

  it("三轉有自己的規則，inherited false", () => {
    const result = rulesFor([mainstream110, alt110, own111], 111);
    expect(result.main).toBe(own111);
    expect(result.others).toEqual([]);
    expect(result.inherited).toBe(false);
  });

  it("完全沒有規則（研究檔還沒進來）回 main null", () => {
    expect(rulesFor([], 111)).toEqual({ main: null, others: [], inherited: false });
  });
});

describe("statTargets", () => {
  it("level：主 DEX、副 STR 等級加 5", () => {
    const r = rule({ jobs: [300], label: "獵人", main: "DEX", secondary: { stat: "STR", type: "level", offset: 5 } });
    expect(statTargets(r, 10)).toEqual({ STR: 15, DEX: 47, INT: 4, LUK: 4 });
    expect(statTargets(r, 50)).toMatchObject({ STR: 55, DEX: 207 });
  });

  it("double-level：主 STR、副 DEX 等級兩倍封頂 60", () => {
    const r = rule({ jobs: [100], label: "劍士系", main: "STR", secondary: { stat: "DEX", type: "double-level", cap: 60 } });
    expect(statTargets(r, 20)).toMatchObject({ DEX: 40, STR: 72 });
    expect(statTargets(r, 45)).toMatchObject({ DEX: 60, STR: 177 });
  });

  it("fixed：主 LUK、副 DEX 固定 25", () => {
    const r = rule({ jobs: [420], label: "俠盜全幸", main: "LUK", secondary: { stat: "DEX", type: "fixed", value: 25 } });
    expect(statTargets(r, 35)).toMatchObject({ DEX: 25, LUK: 162 });
  });

  it("secondary null：主屬性全點，其餘三項固定 4", () => {
    const r = rule({ jobs: [230], label: "法師系", main: "INT", secondary: null });
    expect(statTargets(r, 40)).toEqual({ STR: 4, DEX: 4, INT: 208, LUK: 4 });
  });

  it("equip：副屬＝floor 跟目前裝備需求（equipRequirement）的較大值；沒給就只拿 floor", () => {
    const r = rule({
      jobs: [420],
      label: "俠盜全幸（敏點到裝備需求）",
      main: "LUK",
      secondary: { stat: "DEX", type: "equip", floor: 25 },
    });
    expect(statTargets(r, 35, { DEX: 35 })).toMatchObject({ DEX: 35, LUK: 152 });
    expect(statTargets(r, 35)).toMatchObject({ DEX: 25 });
  });

  it("ratio：主 DEX、副 STR 比例 4:1，無條件捨去（floor，不是四捨五入）", () => {
    const r = rule({ jobs: [500], label: "槍手", main: "DEX", secondary: { stat: "STR", type: "ratio", ratio: [4, 1] } });
    expect(statTargets(r, 50)).toMatchObject({ STR: 54, DEX: 208 });
    expect(statTargets(r, 30)).toMatchObject({ STR: 34, DEX: 128 });
  });

  it("副屬算出來超過「總點數－12」要夾住，主屬性不會變負的", () => {
    const r = rule({ jobs: [999], label: "極端測試", main: "DEX", secondary: { stat: "STR", type: "fixed", value: 9999 } });
    const total = totalStats(10);
    const result = statTargets(r, 10);
    expect(result.STR).toBe(total - 12);
    expect(result.DEX).toBe(4);
  });
});

describe("equipRequirement", () => {
  const dexEquipRule = rule({
    jobs: [410],
    label: "敏捷點到裝備需求",
    main: "LUK",
    secondary: { stat: "DEX", type: "equip", floor: 25 },
  });

  it("取每個等級最強武器需求的最大值，不會因為更強武器沒寫需求而往回掉", () => {
    const clawA = weapon({ id: 1, n: "楓葉拳套A", s: "拳套", lv: 25, atk: 16, job: 8, req: { DEX: 50 } });
    const clawB = weapon({ id: 2, n: "楓葉拳套B（更強但沒寫需求）", s: "拳套", lv: 30, atk: 20, job: 8, req: {} });
    const weapons: GearWeapon[] = [clawA, clawB];
    expect(equipRequirement(weapons, 410, 25, dexEquipRule)).toEqual({ DEX: 50 });
    expect(equipRequirement(weapons, 410, 30, dexEquipRule)).toEqual({ DEX: 50 });
    expect(equipRequirement(weapons, 410, 20, dexEquipRule)).toEqual({});
  });

  it("忽略需要力量（非 main／非 secondary）的武器，不會讓敏捷目標被不相干的需求拉高", () => {
    const r = rule({ jobs: [420], label: "幸運為主", main: "LUK", secondary: { stat: "DEX", type: "equip", floor: 25 } });
    const strDagger = weapon({ id: 1, n: "華氏短劍（需要力量 40）", s: "短刀", lv: 50, atk: 65, job: 8, req: { STR: 40, DEX: 90 } });
    const okDagger = weapon({ id: 2, n: "一般短刀", s: "短刀", lv: 30, atk: 30, job: 8, req: { DEX: 40 } });
    const weapons: GearWeapon[] = [strDagger, okDagger];
    expect(equipRequirement(weapons, 420, 55, r)).toEqual({ DEX: 40 });
  });

  it("beforeOpen：10/15 前只算現在拿得到的武器，不讓只有 V002 掉的武器把敏捷目標拉高", () => {
    const v002Claw = weapon({ id: 1, n: "只有 V002 掉的拳套", s: "拳套", lv: 40, atk: 24, job: 8, req: { DEX: 90 }, o: "2026-10-15" });
    const openClaw = weapon({ id: 2, n: "現在拿得到的拳套", s: "拳套", lv: 40, atk: 22, job: 8, req: { DEX: 80 } });
    const weapons: GearWeapon[] = [v002Claw, openClaw];
    expect(equipRequirement(weapons, 410, 40, dexEquipRule, true)).toEqual({ DEX: 80 });
    expect(equipRequirement(weapons, 410, 40, dexEquipRule)).toEqual({ DEX: 90 });
  });
});

describe("canWear", () => {
  it("每項需求都要 ≤ 目標才算穿得上", () => {
    const w = weapon({ id: 1, n: "測試短刀", s: "短刀", lv: 10, job: 8, req: { DEX: 35, STR: 10 } });
    expect(canWear(w, { STR: 10, DEX: 35, INT: 4, LUK: 4 })).toBe(true);
    expect(canWear(w, { STR: 10, DEX: 34, INT: 4, LUK: 4 })).toBe(false);
  });

  it("沒寫需求的武器一定穿得上", () => {
    const w = weapon({ id: 2, n: "沒有需求的武器", s: "短刀", lv: 10, job: 8 });
    expect(canWear(w, { STR: 4, DEX: 4, INT: 4, LUK: 4 })).toBe(true);
  });
});

describe("weaponPicks", () => {
  it("物理職業：比攻擊、同分攻速小的先、再比等級高的；備選最多兩把不同種類；下一把依等級排序", () => {
    const weapons: GearWeapon[] = [
      weapon({ id: 1, n: "單手劍A", s: "單手劍", lv: 20, atk: 50, spd: 5, job: 1 }),
      weapon({ id: 2, n: "單手劍B（更快）", s: "單手劍", lv: 20, atk: 50, spd: 4, job: 1 }),
      weapon({ id: 3, n: "雙手斧", s: "雙手斧", lv: 15, atk: 45, spd: 7, job: 0 }),
      weapon({ id: 4, n: "單手斧", s: "單手斧", lv: 10, atk: 40, spd: 6, job: 1 }),
      weapon({ id: 5, n: "高等單手斧", s: "單手斧", lv: 40, atk: 60, spd: 5, job: 1 }),
      weapon({ id: 6, n: "超高等單手劍", s: "單手劍", lv: 99, atk: 999, spd: 1, job: 1 }),
      weapon({ id: 7, n: "太高等級拿不到", s: "單手劍", lv: 999, atk: 1, spd: 1, job: 1 }),
      weapon({ id: 8, n: "長弓（種類不符）", s: "弓", lv: 1, atk: 9999, job: 4 }),
      weapon({ id: 9, n: "長杖（職業不符）", s: "長杖", lv: 1, mag: 9999, job: 2 }),
    ];
    const result = weaponPicks(weapons, 110, 25);
    expect(result.best?.id).toBe(2);
    expect(result.alternatives.map(w => w.id)).toEqual([3, 4]);
    expect(result.next?.id).toBe(5);
  });

  it("法師比魔力不比攻擊", () => {
    const weapons: GearWeapon[] = [
      weapon({ id: 1, n: "短杖", s: "短杖", lv: 10, mag: 30, atk: 20, spd: 8, job: 2 }),
      weapon({ id: 2, n: "長杖", s: "長杖", lv: 10, mag: 35, atk: 18, spd: 8, job: 2 }),
    ];
    const result = weaponPicks(weapons, 210, 10);
    expect(result.best?.id).toBe(2);
    expect(result.alternatives.map(w => w.id)).toEqual([1]);
    expect(result.next).toBeNull();
  });

  it("沒有能用的武器時三項都是空／null", () => {
    expect(weaponPicks([], 110, 10)).toEqual({ best: null, alternatives: [], next: null, stronger: null });
  });

  it("備選排除同種類：非 best 的兩把種類相同時只算一次", () => {
    const weapons: GearWeapon[] = [
      weapon({ id: 1, n: "單手劍（best）", s: "單手劍", lv: 10, atk: 50, spd: 5, job: 1 }),
      weapon({ id: 2, n: "雙手斧甲", s: "雙手斧", lv: 10, atk: 45, spd: 5, job: 1 }),
      weapon({ id: 3, n: "雙手斧乙（較弱、同種類）", s: "雙手斧", lv: 10, atk: 40, spd: 5, job: 1 }),
      weapon({ id: 4, n: "單手斧", s: "單手斧", lv: 10, atk: 41, spd: 5, job: 1 }),
    ];
    const result = weaponPicks(weapons, 110, 20);
    expect(result.best?.id).toBe(1);
    expect(result.alternatives.map(w => w.id)).toEqual([2, 4]);
  });

  it("法師候選不卡種類：任意型態只要有魔攻就算（雨傘）；stronger 是穿不上的那把", () => {
    const umbrella = weapon({ id: 1, n: "測試雨傘", s: "單手劍", lv: 10, mag: 50, atk: 50, job: 0 });
    const staff = weapon({ id: 2, n: "測試高幸杖", s: "長杖", lv: 10, mag: 60, job: 2, req: { LUK: 40 } });
    const weapons: GearWeapon[] = [umbrella, staff];
    const targetsAt = () => ({ STR: 4, DEX: 4, INT: 4, LUK: 4 });
    const result = weaponPicks(weapons, 210, 10, { targetsAt });
    expect(result.best?.id).toBe(1);
    expect(result.stronger?.id).toBe(2);
  });

  it("物理職業：力量需求穿不上時退回可穿的那把，stronger 是需求較高那把", () => {
    const strDagger = weapon({ id: 1, n: "需要力量的短刀", s: "短刀", lv: 40, atk: 65, job: 8, req: { STR: 40 } });
    const wearableDagger = weapon({ id: 2, n: "穿得上的短刀", s: "短刀", lv: 40, atk: 50, job: 8, req: { DEX: 40 } });
    const weapons: GearWeapon[] = [strDagger, wearableDagger];
    const targetsAt = () => ({ STR: 4, DEX: 90, INT: 4, LUK: 200 });
    const result = weaponPicks(weapons, 420, 50, { targetsAt });
    expect(result.best?.id).toBe(2);
    expect(result.stronger?.id).toBe(1);
  });

  it("beforeOpen：best／stronger 都不會選到只有 V002 來源的武器", () => {
    const v002Dagger = weapon({ id: 1, n: "V002短刀", s: "短刀", lv: 10, atk: 100, job: 8, o: "2026-10-15" });
    const openDagger = weapon({ id: 2, n: "現在短刀", s: "短刀", lv: 10, atk: 50, job: 8 });
    const weapons: GearWeapon[] = [v002Dagger, openDagger];

    const withoutFilter = weaponPicks(weapons, 420, 10);
    expect(withoutFilter.best?.id).toBe(1);

    const result = weaponPicks(weapons, 420, 10, { beforeOpen: true });
    expect(result.best?.id).toBe(2);
    expect(result.stronger).toBeNull();
  });

  it("下一把同分時優先選沒有 o 的", () => {
    const current = weapon({ id: 3, n: "目前武器", s: "短刀", lv: 10, atk: 50, job: 8 });
    const v002Next = weapon({ id: 1, n: "V002下一把", s: "短刀", lv: 20, atk: 80, spd: 4, job: 8, o: "2026-10-15" });
    const openNext = weapon({ id: 2, n: "現在能打的下一把", s: "短刀", lv: 20, atk: 80, spd: 4, job: 8 });
    const weapons: GearWeapon[] = [current, v002Next, openNext];
    const result = weaponPicks(weapons, 420, 10);
    expect(result.next?.id).toBe(2);
  });
});

describe("statShortfall", () => {
  it("需求比目標高的部分", () => {
    const w = weapon({ id: 1, n: "測試短刀", s: "短刀", lv: 10, job: 8, req: { DEX: 35 } });
    expect(statShortfall(w, { STR: 4, DEX: 25, INT: 4, LUK: 4 })).toEqual([{ stat: "DEX", short: 10 }]);
  });

  it("沒超過目標或沒寫需求的不列", () => {
    const w = weapon({ id: 2, n: "測試短刀2", s: "短刀", lv: 10, job: 8, req: { DEX: 20, STR: 10 } });
    expect(statShortfall(w, { STR: 20, DEX: 25, INT: 4, LUK: 4 })).toEqual([]);
  });
});

describe("scrollPicks", () => {
  it("物理職業：武器種類攻擊卷、手套攻擊卷、主屬性卷；options 依成功率高到低；空的部位不出現", () => {
    const scrolls: GearScroll[] = [
      scroll({ id: 1, n: "短劍攻擊卷軸", slot: "短刀", stat: "攻擊", rate: 10, effect: "物理攻擊力+5" }),
      scroll({ id: 2, n: "短劍攻擊卷軸", slot: "短刀", stat: "攻擊", rate: 60, effect: "物理攻擊力+2" }),
      scroll({ id: 3, n: "手套攻擊卷軸", slot: "手套", stat: "攻擊", rate: 70, effect: "物理攻擊力+1" }),
      scroll({ id: 4, n: "手套敏捷卷軸", slot: "手套", stat: "敏捷", rate: 50, effect: "DEX+1" }),
      scroll({ id: 5, n: "披風幸運卷軸", slot: "披風", stat: "幸運", rate: 30, effect: "LUK+1" }),
      scroll({ id: 6, n: "頭盔生命卷軸", slot: "頭盔", stat: "生命", rate: 80, effect: "MaxHP+10" }),
    ];
    const result = scrollPicks(scrolls, 420, null, "LUK");
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ slot: "短刀", stat: "攻擊" });
    expect(result[0].options.map(o => o.rate)).toEqual([60, 10]);
    expect(result[1]).toMatchObject({ slot: "手套", stat: "攻擊" });
    expect(result[2]).toMatchObject({ slot: "披風", stat: "幸運" });
  });

  it("法師：短杖／長杖魔力卷＋主屬性卷，沒有手套攻擊", () => {
    const scrolls: GearScroll[] = [
      scroll({ id: 1, n: "短杖魔力卷軸", slot: "短杖", stat: "魔力", rate: 10, effect: "MAD+5" }),
      scroll({ id: 2, n: "長杖魔力卷軸", slot: "長杖", stat: "魔力", rate: 10, effect: "MAD+5" }),
      scroll({ id: 3, n: "手套攻擊卷軸", slot: "手套", stat: "攻擊", rate: 70, effect: "PAD+1" }),
      scroll({ id: 4, n: "耳環智力卷軸", slot: "耳環", stat: "智力", rate: 20, effect: "INT+1" }),
    ];
    const result = scrollPicks(scrolls, 210, null, "INT");
    expect(result.map(f => `${f.slot}${f.stat}`)).toEqual(["短杖魔力", "長杖魔力", "耳環智力"]);
  });

  it("指定 weaponType 時只列那一種；main 給 null 不列主屬性卷", () => {
    const scrolls: GearScroll[] = [
      scroll({ id: 1, n: "短杖魔力卷軸", slot: "短杖", stat: "魔力", rate: 10, effect: "x" }),
      scroll({ id: 2, n: "長杖魔力卷軸", slot: "長杖", stat: "魔力", rate: 10, effect: "x" }),
      scroll({ id: 3, n: "耳環智力卷軸", slot: "耳環", stat: "智力", rate: 20, effect: "x" }),
    ];
    const result = scrollPicks(scrolls, 210, "短杖", null);
    expect(result).toEqual([{ slot: "短杖", stat: "魔力", options: [scrolls[0]] }]);
  });
});

describe("closestSource", () => {
  it("商店優先", () => {
    const src: GearSource = { shops: [{ p: "商店", pr: 1 }], drops: [{ m: 1, n: "怪", lv: 5, map: 1 }] };
    expect(closestSource(src, 10)).toEqual({ kind: "shop", shop: { p: "商店", pr: 1 } });
  });

  it("沒商店選最好打的掉落怪：不高於你的越接近越好，比你高的差距算兩倍", () => {
    const src: GearSource = {
      drops: [
        { m: 1, n: "怪A", lv: 10, map: 1 },
        { m: 2, n: "怪B", lv: 20, map: 1 },
        { m: 3, n: "怪C", lv: 30, map: 1 },
      ],
    };
    expect(closestSource(src, 20)).toEqual({ kind: "drop", drop: src.drops![1] });
    expect(closestSource(src, 15)).toEqual({ kind: "drop", drop: src.drops![0] });
    // 35 等：7 等的肥肥（差 28）比 55 等的巨居蟹（差 20×2＝40）好打
    const far: GearSource = { drops: [{ m: 4, n: "肥肥", lv: 7, map: 1 }, { m: 5, n: "巨居蟹", lv: 55, map: 1 }] };
    expect(closestSource(far, 35)).toEqual({ kind: "drop", drop: far.drops![0] });
  });

  it("任務：現在接得到的算差距 0、等級還不夠的差距算兩倍；同分任務優先（一定拿得到）", () => {
    // 35 等刺客的手套攻擊卷軸：40 等任務（差 5×2＝10）勝過 55 等巨居蟹（差 40）
    const glove: GearSource = {
      drops: [{ m: 5, n: "巨居蟹", lv: 55, map: 1 }],
      quests: [{ id: "2013", n: "珍的最後一個挑戰", minLv: 40 }],
    };
    expect(closestSource(glove, 35)).toEqual({ kind: "quest", quest: glove.quests![0] });
    const tie: GearSource = { drops: [{ m: 1, n: "同等級的怪", lv: 30, map: 1 }], quests: [{ id: "1", n: "現在就能接", minLv: 20 }] };
    expect(closestSource(tie, 30)).toEqual({ kind: "quest", quest: tie.quests![0] });
  });

  it("沒掉落選第一個任務", () => {
    const src: GearSource = { quests: [{ id: "1", n: "任務一" }, { id: "2", n: "任務二" }] };
    expect(closestSource(src, 10)).toEqual({ kind: "quest", quest: src.quests![0] });
  });

  it("什麼來源都沒有回 null", () => {
    expect(closestSource({}, 10)).toBeNull();
  });

  it("先推舊地區的怪，就算 V002 的怪等級更近；整組都是 V002 才退回原本的（10/15 開放後也一樣）", () => {
    const mixed: GearSource = {
      drops: [
        { m: 1, n: "怪A", lv: 10, map: 1, o: "2026-10-15" },
        { m: 2, n: "怪B", lv: 12, map: 1 },
      ],
    };
    expect(closestSource(mixed, 10)).toEqual({ kind: "drop", drop: mixed.drops![1] });

    const onlyV002: GearSource = { drops: [{ m: 1, n: "怪A", lv: 10, map: 1, o: "2026-10-15" }] };
    expect(closestSource(onlyV002, 10)).toEqual({ kind: "drop", drop: onlyV002.drops![0] });
  });

  it("要跨層看：舊地區的任務贏過只有 V002 的掉落（弩攻擊卷軸實例）", () => {
    const src: GearSource = {
      drops: [{ m: 1, n: "小雪球", lv: 31, map: 1, o: "2026-10-15" }],
      quests: [{ id: "2001", n: "酋長蓋房子", minLv: 40 }],
    };
    expect(closestSource(src, 30)).toEqual({ kind: "quest", quest: src.quests![0] });
  });
});

describe("任務來源的職業限制", () => {
  const warriorOnly = { id: "10", n: "劍士才能接", jobs: [100, 110, 111] };
  const archerReward = { id: "11", n: "獎勵只發弓箭手", rj: 8200 };
  const anyone = { id: "12", n: "誰都能接" };

  it("questFits：任務限定職業要包含你的職業；獎勵職業旗標要對到你的系別", () => {
    expect(questFits(warriorOnly, 110)).toBe(true);
    expect(questFits(warriorOnly, 210)).toBe(false);
    expect(questFits(archerReward, 310)).toBe(true);
    expect(questFits(archerReward, 110)).toBe(false);
    expect(questFits(anyone, 520)).toBe(true);
  });

  it("obtainableBy：有商店或掉落就算；只有任務時至少一個任務接得到", () => {
    expect(obtainableBy(source({ quests: [archerReward] }), 110)).toBe(false);
    expect(obtainableBy(source({ quests: [archerReward, anyone] }), 110)).toBe(true);
    expect(obtainableBy(source({ shops: [{ p: "商店", pr: 1 }], quests: [archerReward] }), 110)).toBe(true);
  });

  it("weaponPicks：只有別的職業任務拿得到的武器不推", () => {
    const weapons: GearWeapon[] = [
      weapon({ id: 1, n: "劍士任務的通用劍", s: "單手劍", lv: 30, atk: 60, mag: 60, job: 0, src: source({ quests: [warriorOnly] }) }),
      weapon({ id: 2, n: "商店短杖", s: "短杖", lv: 30, mag: 40, job: 2, src: source({ shops: [{ p: "商店", pr: 1 }] }) }),
    ];
    expect(weaponPicks(weapons, 210, 30).best?.id).toBe(2);
  });

  it("scrollPicks：只有別的職業拿得到的成功率不列", () => {
    const scrolls: GearScroll[] = [
      scroll({ id: 1, n: "矛攻擊卷軸", slot: "矛", stat: "攻擊", rate: 10, effect: "物理攻擊力+5", src: source({ quests: [archerReward] }) }),
      scroll({ id: 2, n: "矛攻擊卷軸", slot: "矛", stat: "攻擊", rate: 60, effect: "物理攻擊力+2", src: source({ drops: [{ m: 1, n: "怪", lv: 30, map: 1 }] }) }),
    ];
    const families = scrollPicks(scrolls, 130, "矛", "STR");
    expect(families[0].options.map(o => o.rate)).toEqual([60]);
  });

  it("closestSource 給了職業：跳過接不到的任務", () => {
    const src = source({ quests: [archerReward, anyone] });
    expect(closestSource(src, 30, 110)).toEqual({ kind: "quest", quest: anyone });
    expect(closestSource(src, 30, 310)).toEqual({ kind: "quest", quest: archerReward });
  });
});

describe("stronger：更強但穿不上的那把，挑最容易補到的", () => {
  it("兩把都比 best 強時，選缺的點數總和最少的（黑色雨傘缺 6 點勝過缺 39 點的杖）", () => {
    const allInt = rule({ jobs: [231], label: "全智", main: "INT", secondary: null });
    const weapons: GearWeapon[] = [
      weapon({ id: 1, n: "黃色雨傘", s: "單手劍", lv: 40, mag: 52, job: 0, src: source({ drops: [{ m: 1, n: "怪", lv: 40, map: 1 }] }) }),
      weapon({ id: 2, n: "要幸運的杖", s: "長杖", lv: 70, mag: 90, job: 2, req: { INT: 200, LUK: 43 }, src: source({ shops: [{ p: "商店", pr: 1 }] }) }),
      weapon({ id: 3, n: "黑色雨傘", s: "單手劍", lv: 70, mag: 85, job: 0, req: { STR: 6, DEX: 6, INT: 6, LUK: 6 }, src: source({ shops: [{ p: "商店", pr: 1 }] }) }),
    ];
    const picks = weaponPicks(weapons, 231, 75, { targetsAt: lv => statTargets(allInt, lv) });
    expect(picks.best?.id).toBe(1);
    expect(picks.stronger?.id).toBe(3);
  });

  it("只強一點點的不算：至少要多 5 點或一成（妖精短杖魔力 53 對黃色雨傘 52 不列）", () => {
    const allInt = rule({ jobs: [210], label: "全智", main: "INT", secondary: null });
    const weapons: GearWeapon[] = [
      weapon({ id: 1, n: "黃色雨傘", s: "單手劍", lv: 40, mag: 52, job: 0, src: source({ shops: [{ p: "商店", pr: 1 }] }) }),
      weapon({ id: 2, n: "妖精短杖", s: "短杖", lv: 38, mag: 53, job: 2, req: { LUK: 40 }, src: source({ shops: [{ p: "商店", pr: 1 }] }) }),
    ];
    const picks = weaponPicks(weapons, 210, 40, { targetsAt: lv => statTargets(allInt, lv) });
    expect(picks.best?.id).toBe(1);
    expect(picks.stronger).toBeNull();
  });
});

describe("alternatives：差太多的備選不列", () => {
  it("攻擊／魔力不到第一名八成的不算備選（40 等法師不該看到 8 等新手短杖）", () => {
    const allInt = rule({ jobs: [210], label: "全智", main: "INT", secondary: null });
    const weapons: GearWeapon[] = [
      weapon({ id: 1, n: "黃色雨傘", s: "單手劍", lv: 40, mag: 52, job: 0, src: source({ shops: [{ p: "商店", pr: 1 }] }) }),
      weapon({ id: 2, n: "木製短杖", s: "短杖", lv: 8, mag: 15, job: 2, src: source({ shops: [{ p: "商店", pr: 1 }] }) }),
      weapon({ id: 3, n: "還可以的長杖", s: "長杖", lv: 35, mag: 45, job: 2, src: source({ shops: [{ p: "商店", pr: 1 }] }) }),
    ];
    const picks = weaponPicks(weapons, 210, 40, { targetsAt: lv => statTargets(allInt, lv) });
    expect(picks.best?.id).toBe(1);
    expect(picks.alternatives.map(w => w.id)).toEqual([3]);
  });
});

describe("商店在哪、任務能不能接、點法指定武器種類", () => {
  it("closestSource：冰原雪域、天空之城的店排在舊地區打得到的怪後面（10/15 開放後也一樣）；只有那家店賣才推它", () => {
    const src = source({
      shops: [{ p: "冰原雪域", n: "斯考特", m: 211000000, pr: 250000, o: "2026-10-15" }],
      drops: [{ m: 1, n: "火石球", lv: 40, map: 1 }],
    });
    expect(closestSource(src, 38)).toEqual({ kind: "drop", drop: src.drops![0] });
    expect(closestSource(source({ shops: src.shops }), 38)).toEqual({ kind: "shop", shop: src.shops![0] });
  });

  it("questFits／closestSource：過了等級上限的任務接不了，不推", () => {
    const quest = { id: "2115", n: "有等級上限", minLv: 30, maxLv: 65 };
    expect(questFits(quest, 110, 60)).toBe(true);
    expect(questFits(quest, 110, 70)).toBe(false);
    expect(closestSource(source({ quests: [quest] }), 70, 110)).toBeNull();
  });

  it("隨機給的任務多算 10 分：同樣好拿時，穩定的掉落優先", () => {
    const src = source({
      drops: [{ m: 1, n: "怪", lv: 30, map: 1 }],
      quests: [{ id: "2013", n: "珍的最後一個挑戰", minLv: 30, rand: 1 }],
    });
    // 35 等：怪差 5 分；任務能接但隨機（0＋10）→ 推怪
    expect(closestSource(src, 35)).toEqual({ kind: "drop", drop: src.drops![0] });
  });

  it("weaponPicks types：一轉海盜照「指虎需求」只看指虎，攻擊高一點的火槍不推", () => {
    const weapons: GearWeapon[] = [
      weapon({ id: 1, n: "黃金火槍", s: "火槍", lv: 25, atk: 27, job: 16, src: source({ shops: [{ p: "店", pr: 1 }] }) }),
      weapon({ id: 2, n: "指虎", s: "指虎", lv: 25, atk: 26, job: 16, src: source({ shops: [{ p: "店", pr: 1 }] }) }),
    ];
    expect(weaponPicks(weapons, 500, 27).best?.id).toBe(1);
    expect(weaponPicks(weapons, 500, 27, { types: ["指虎"] }).best?.id).toBe(2);
  });

  it("equipRequirement：點法指定武器種類時，敏捷目標只看那種武器的需求", () => {
    const thief = rule({ jobs: [400], label: "拳套需求", main: "LUK", secondary: { stat: "DEX", type: "equip", floor: 25 }, weapons: ["拳套"] });
    const weapons: GearWeapon[] = [
      weapon({ id: 1, n: "狼牙", s: "拳套", lv: 25, atk: 16, job: 8, req: { DEX: 50 } }),
      weapon({ id: 2, n: "短刀", s: "短刀", lv: 25, atk: 30, job: 8, req: { DEX: 40 } }),
    ];
    expect(equipRequirement(weapons, 400, 25, thief)).toEqual({ DEX: 50 });
  });
});

describe("合成來源", () => {
  const craft = { n: "後街吉姆", m: 103000000, mats: [{ id: 1472000, n: "拳套", c: 1 }, { id: 4011001, n: "鋼鐵", c: 3 }], fee: 5000 };

  it("只有合成也算拿得到", () => {
    expect(obtainableBy(source({ crafts: [craft] }), 410)).toBe(true);
  });

  it("closestSource：合成排在商店後面、掉落前面（材料湊齊一定做得出來）", () => {
    const src = source({ crafts: [craft], drops: [{ m: 1, n: "黑斧木妖", lv: 22, map: 1 }] });
    expect(closestSource(src, 25)).toEqual({ kind: "craft", craft });
    expect(closestSource(source({ ...src, shops: [{ p: "店", pr: 1 }] }), 25)).toEqual({ kind: "shop", shop: { p: "店", pr: 1 } });
  });

  it("跳過冰原雪域、天空之城的合成 NPC，先推舊地區打得到的怪（10/15 開放後也一樣）", () => {
    const later = { ...craft, n: "冰原雪域工匠", m: 211000000, o: "2026-10-15" };
    const src = source({ crafts: [later], drops: [{ m: 1, n: "怪", lv: 25, map: 1 }] });
    expect(closestSource(src, 25)).toEqual({ kind: "drop", drop: src.drops![0] });
  });

  it("舊地區的合成排在冰原雪域的店前面（狼牙：推墮落城市後街吉姆合成，不推斯考特賣 60,000 楓幣）", () => {
    const src = source({ shops: [{ p: "冰原雪域", n: "斯考特", m: 211000000, pr: 60000, o: "2026-10-15" }], crafts: [craft] });
    expect(closestSource(src, 25)).toEqual({ kind: "craft", craft });
  });
});

const piece = (over: Partial<GearKit> & Pick<GearKit, "n" | "lv" | "v">): GearKit => ({ ids: [1], slot: "帽子", stat: "DEX", src: { quests: [{ id: "1", n: "任務" }] }, ...over });

describe("kitStats：空身加上要湊的裝備", () => {
  const cape = piece({ n: "破舊的披風", lv: 25, v: 5 });
  const hat = piece({ n: "綠色斗笠", lv: 25, v: 3, req: { DEX: 30 } });
  const robe = piece({ n: "桑那服", lv: 30, v: 10 });
  const base = { STR: 4, DEX: 25, INT: 4, LUK: 112 };

  it("等級不夠的不算，排在 later", () => {
    const result = kitStats([cape, hat, robe], 20, base);
    expect(result.stats.DEX).toBe(25);
    expect(result.worn).toEqual([]);
    expect(result.later.map(k => k.n)).toEqual(["破舊的披風", "綠色斗笠", "桑那服"]);
  });

  it("先穿上的會讓後面的穿得上（披風 +5 才戴得上要敏捷 30 的斗笠），順序不影響", () => {
    const result = kitStats([hat, cape, robe], 25, base);
    expect(result.stats.DEX).toBe(33);
    expect(result.worn.map(k => k.n)).toEqual(["綠色斗笠", "破舊的披風"]);
    expect(result.later.map(k => k.n)).toEqual(["桑那服"]);
  });

  it("10/15 前不算只有 V002 才拿得到的", () => {
    const later = piece({ n: "V002 帽", lv: 10, v: 9, o: "2026-10-15" });
    expect(kitStats([later], 30, base, true).stats.DEX).toBe(25);
    expect(kitStats([later], 30, base, false).stats.DEX).toBe(34);
  });

  it("不改到傳進來的 base", () => {
    kitStats([cape], 30, base);
    expect(base.DEX).toBe(25);
  });
});

describe("nearestUpgrade：比現在這把強、穿不上的裡面，差最少點的那把", () => {
  const claw = (id: number, n: string, lv: number, atk: number, dex: number) =>
    weapon({ id, n, s: "拳套", lv, job: 8, atk, req: { DEX: dex, LUK: 0 }, src: source({ shops: [{ p: "店", pr: 1 }] }) });
  const weapons = [claw(1, "青銅指虎", 20, 14, 40), claw(2, "狼牙", 25, 16, 50), claw(3, "銀守護拳套", 35, 20, 70), claw(4, "護腕", 40, 22, 80)];
  const wear = { STR: 4, DEX: 44, INT: 4, LUK: 162 };

  it("刺客 35 全幸（敏捷 44）：狼牙只差 6，不是攻擊最高的銀守護拳套；等級還沒到的護腕不算", () => {
    expect(nearestUpgrade(weapons, 410, 35, wear, weapons[0])?.n).toBe("狼牙");
  });

  it("都穿得上或沒有更強的回 null", () => {
    expect(nearestUpgrade(weapons, 410, 35, { ...wear, DEX: 999 }, weapons[2])).toBeNull();
  });
});

describe("scrollFamily：單一部位單一屬性的一組卷軸", () => {
  const scrolls = [
    scroll({ id: 1, n: "套服敏捷卷軸", slot: "套服", stat: "敏捷", rate: 60, effect: "DEX+2，命中率+1", src: source({ shops: [{ p: "店", pr: 1 }] }) }),
    scroll({ id: 2, n: "套服敏捷卷軸", slot: "套服", stat: "敏捷", rate: 100, effect: "DEX+1", src: source({ shops: [{ p: "店", pr: 1 }] }) }),
  ];
  it("成功率高的在前；沒有拿得到的回 null", () => {
    expect(scrollFamily(scrolls, 410, "套服", "敏捷")?.options.map(s => s.rate)).toEqual([100, 60]);
    expect(scrollFamily(scrolls, 410, "披風", "敏捷")).toBeNull();
  });
});
