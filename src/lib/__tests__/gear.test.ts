import { describe, expect, it } from "vitest";
import {
  canWear,
  closestSource,
  equipRequirement,
  isMagicJob,
  rulesFor,
  scrollPicks,
  statShortfall,
  statTargets,
  totalStats,
  weaponPicks,
  weaponTypesFor,
} from "@/lib/gear";
import type { GearScroll, GearSource, GearWeapon, StatRule } from "@/lib/gear";

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
      weapon({ id: 4, n: "單手斧", s: "單手斧", lv: 10, atk: 35, spd: 5, job: 1 }),
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
    const src: GearSource = { shop: 1, drops: [{ m: 1, n: "怪", lv: 5, map: 1 }] };
    expect(closestSource(src, 10)).toEqual({ kind: "shop" });
  });

  it("沒商店選等級最接近的掉落怪，同分選等級低的", () => {
    const src: GearSource = {
      drops: [
        { m: 1, n: "怪A", lv: 10, map: 1 },
        { m: 2, n: "怪B", lv: 20, map: 1 },
        { m: 3, n: "怪C", lv: 30, map: 1 },
      ],
    };
    expect(closestSource(src, 20)).toEqual({ kind: "drop", drop: src.drops![1] });
    expect(closestSource(src, 15)).toEqual({ kind: "drop", drop: src.drops![0] });
  });

  it("沒掉落選第一個任務", () => {
    const src: GearSource = { quests: [{ id: "1", n: "任務一" }, { id: "2", n: "任務二" }] };
    expect(closestSource(src, 10)).toEqual({ kind: "quest", quest: src.quests![0] });
  });

  it("什麼來源都沒有回 null", () => {
    expect(closestSource({}, 10)).toBeNull();
  });

  it("beforeOpen 略過 V002 來源，整組都是 V002 才退回原本的", () => {
    const mixed: GearSource = {
      drops: [
        { m: 1, n: "怪A", lv: 10, map: 1, o: "2026-10-15" },
        { m: 2, n: "怪B", lv: 12, map: 1 },
      ],
    };
    expect(closestSource(mixed, 10, true)).toEqual({ kind: "drop", drop: mixed.drops![1] });

    const onlyV002: GearSource = { drops: [{ m: 1, n: "怪A", lv: 10, map: 1, o: "2026-10-15" }] };
    expect(closestSource(onlyV002, 10, true)).toEqual({ kind: "drop", drop: onlyV002.drops![0] });
  });

  it("beforeOpen 要跨層看：non-V002 的任務贏過只有 V002 的掉落（弩攻擊卷軸實例）", () => {
    const src: GearSource = {
      drops: [{ m: 1, n: "小雪球", lv: 50, map: 1, o: "2026-10-15" }],
      quests: [{ id: "2001", n: "酋長蓋房子", minLv: 30 }],
    };
    expect(closestSource(src, 50, true)).toEqual({ kind: "quest", quest: src.quests![0] });
    expect(closestSource(src, 50, false)).toEqual({ kind: "drop", drop: src.drops![0] });
  });
});
