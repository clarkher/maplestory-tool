/**
 * 首頁「能力值與裝備」卡的顯示用字跟組裝（src/lib/gear-view.ts）。
 * 前半是純字串（卷軸效果、攻速、還差幾點、玩家提醒分組），後半直接讀 public/data/gear.json，
 * 確認卡片組出來的東西跟畫面上要看到的一致（跟 gear-realdata.test.ts 同一招）。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GearData, GearNote, GearScroll, GearWeapon, StatRule } from "@/lib/gear";
import {
  bandGear,
  craftMaterialsText,
  dropLead,
  effectParts,
  effectText,
  familyPick,
  gearPlan,
  inheritNote,
  notesFor,
  offenseText,
  shortText,
  sourceOpensLater,
  sourceText,
  speedWord,
  tabsFor,
  weaponStatParts,
  weaponStatsText,
} from "@/lib/gear-view";

const weapon = (over: Partial<GearWeapon> = {}): GearWeapon => ({ id: 1, n: "測試武器", s: "拳套", lv: 35, job: 8, src: {}, ...over });
const scroll = (over: Partial<GearScroll> = {}): GearScroll => ({
  id: 1, n: "拳套攻擊卷軸", slot: "拳套", stat: "攻擊", rate: 60, effect: "物理攻擊力+2，命中率+1", src: {}, ...over,
});
const note = (over: Partial<GearNote> & Pick<GearNote, "jobs" | "topic">): GearNote => ({ t: "", s: [], v: "tw", ...over });

describe("effectText：卷軸效果寫成玩家看得懂的字", () => {
  it("英文屬性換中文，「，」換成「、」", () => {
    expect(effectText("物理攻擊力+5，命中率+3，LUK+1")).toBe("物理攻擊力+5、命中率+3、幸運+1");
    expect(effectText("魔法攻擊力+5，INT+3，魔法防禦力+1")).toBe("魔法攻擊力+5、智力+3、魔法防禦力+1");
    expect(effectText("物理攻擊力+5，STR+3，物理防禦力+1")).toBe("物理攻擊力+5、力量+3、物理防禦力+1");
    expect(effectText("命中率+5，DEX+3，迴避率+1")).toBe("命中率+5、敏捷+3、迴避率+1");
  });

  it("最大 HP／MP 換中文；原本就用「、」的照樣", () => {
    expect(effectText("物理防禦力+5，魔法防禦力+3，MaxHP+10")).toBe("物理防禦力+5、魔法防禦力+3、最大 HP+10");
    expect(effectText("MaxMP+10")).toBe("最大 MP+10");
    expect(effectText("物理攻擊力+5、命中率+3、敏捷+1")).toBe("物理攻擊力+5、命中率+3、敏捷+1");
  });

  it("effectParts 一項一塊（畫面上每塊不斷行，「+5」不會跟「物理攻擊力」拆開）", () => {
    expect(effectParts("物理攻擊力+5，命中率+3，LUK+1")).toEqual(["物理攻擊力+5", "命中率+3", "幸運+1"]);
  });
});

describe("speedWord：攻擊速度只寫遊戲裡的字", () => {
  it("沿用 equipStatValue 的對照，去掉括號數字", () => {
    expect(speedWord(3)).toBe("更快");
    expect(speedWord(4)).toBe("快");
    expect(speedWord(5)).toBe("快");
    expect(speedWord(6)).toBe("普通");
    expect(speedWord(8)).toBe("慢");
  });

  it("沒寫攻速回 null", () => {
    expect(speedWord(undefined)).toBeNull();
  });
});

describe("offenseText／weaponStatsText", () => {
  it("物理職業寫攻擊、法師寫魔力", () => {
    expect(offenseText(weapon({ atk: 20, mag: 3 }), false)).toBe("攻擊 20");
    expect(offenseText(weapon({ atk: 52, mag: 52 }), true)).toBe("魔力 52");
  });

  it("Lv、攻擊或魔力、攻速三塊用「・」連起來", () => {
    expect(weaponStatsText(weapon({ lv: 35, atk: 20, spd: 4 }), false)).toBe("Lv.35・攻擊 20・攻速 快");
    expect(weaponStatsText(weapon({ lv: 40, atk: 52, mag: 52, spd: 5 }), true)).toBe("Lv.40・魔力 52・攻速 快");
  });

  it("沒有等級需求寫「不限等級」，沒寫攻速就不寫", () => {
    expect(weaponStatsText(weapon({ lv: 0, mag: 15 }), true)).toBe("不限等級・魔力 15");
  });

  it("weaponStatParts 一塊一塊給畫面排", () => {
    expect(weaponStatParts(weapon({ lv: 35, atk: 20, spd: 4 }), false)).toEqual(["Lv.35", "攻擊 20", "攻速 快"]);
  });
});

describe("inheritNote：這一轉還沒有自己的點法", () => {
  const swordsman: StatRule = {
    jobs: [100, 110, 120, 130], label: "敏捷＝等級×2，到 60 就停，其餘全力", main: "STR",
    secondary: { stat: "DEX", type: "double-level", cap: 60 }, t: "", s: [], v: "tw", mainstream: true,
  };

  it("三轉沿用二轉：寫出是哪一轉沿用哪一轉", () => {
    expect(inheritNote(111, swordsman)).toBe("三轉先沿用二轉的點法（還沒有三轉攻略）");
  });

  it("規則本來就是這一轉的：不寫", () => {
    expect(inheritNote(110, swordsman)).toBeNull();
  });

  it("隔兩轉沿用（三轉直接用一轉的）也寫對", () => {
    expect(inheritNote(111, { ...swordsman, jobs: [100] })).toBe("三轉先沿用一轉的點法（還沒有三轉攻略）");
  });
});

describe("shortText：還差幾點", () => {
  it("一項：〇〇還差 N", () => {
    expect(shortText([{ stat: "STR", short: 36 }])).toBe("力量還差 36");
  });

  it("好幾項差一樣多：〇〇、〇〇各差 N", () => {
    expect(shortText([{ stat: "STR", short: 2 }, { stat: "DEX", short: 2 }, { stat: "LUK", short: 2 }])).toBe("力量、敏捷、幸運各差 2");
  });

  it("好幾項差的不一樣：逐項寫", () => {
    expect(shortText([{ stat: "DEX", short: 10 }, { stat: "LUK", short: 36 }])).toBe("敏捷還差 10、幸運還差 36");
  });

  it("沒有差回空字串", () => {
    expect(shortText([])).toBe("");
  });
});

describe("sourceText／sourceOpensLater：怎麼拿", () => {
  const mapLabel = (id: number) => (id === 106000000 ? "螞蟻洞" : "未開放地圖");

  it("掉落的前半句（畫面上不斷行的那塊）", () => {
    expect(dropLead({ n: "火肥肥", lv: 32 })).toBe("火肥肥（Lv.32）會掉");
  });

  it("商店、掉落、任務三種寫法", () => {
    expect(sourceText({ kind: "shop", shop: { p: "墮落城市武器店", n: "曼斯塔", m: 103000001, pr: 8000 } }, mapLabel)).toBe("墮落城市武器店的曼斯塔賣 8,000 楓幣");
    expect(sourceText({ kind: "quest", quest: { id: "2013", n: "珍的最後一個挑戰", minLv: 40, rand: 1 } }, mapLabel)).toBe("Lv.40 任務〈珍的最後一個挑戰〉隨機給");
    expect(sourceText({ kind: "drop", drop: { m: 3210100, n: "火肥肥", lv: 32, map: 106000000 } }, mapLabel)).toBe("火肥肥（Lv.32）會掉・螞蟻洞");
    expect(sourceText({ kind: "quest", quest: { id: "9414", n: "散發烈焰氣息的劍" } }, mapLabel)).toBe("任務〈散發烈焰氣息的劍〉給");
    // 任務有等級限制就寫出來：35 等的人看到 40 等任務才知道要再等 5 級
    expect(sourceText({ kind: "quest", quest: { id: "2013", n: "珍的最後一個挑戰", minLv: 40 } }, mapLabel)).toBe("Lv.40 任務〈珍的最後一個挑戰〉給");
  });

  it("只有 V002 才拿得到的來源回開放日，其他回 undefined", () => {
    expect(sourceOpensLater({ kind: "shop", shop: { p: "墮落城市武器店", pr: 8000 } })).toBeUndefined();
    expect(sourceOpensLater({ kind: "shop", shop: { p: "冰原雪域", pr: 250000, o: "2026-10-15" } })).toBe("2026-10-15");
    expect(sourceOpensLater({ kind: "drop", drop: { m: 1, n: "月光精靈", lv: 45, map: 2, o: "2026-10-15" } })).toBe("2026-10-15");
    expect(sourceOpensLater({ kind: "quest", quest: { id: "1", n: "任務", o: "2026-10-15" } })).toBe("2026-10-15");
    expect(sourceOpensLater({ kind: "drop", drop: { m: 1, n: "青螃蟹", lv: 48, map: 2 } })).toBeUndefined();
  });
});

describe("familyPick：一組卷軸裡最好拿的那張", () => {
  const options = [
    scroll({ id: 3, rate: 100, o: "2026-10-15" }),
    scroll({ id: 2, rate: 60 }),
    scroll({ id: 1, rate: 10 }),
  ];

  it("10/15 前跳過只有 V002 拿得到的，挑成功率最高、現在就拿得到的", () => {
    expect(familyPick(options, true).id).toBe(2);
  });

  it("10/15 後直接挑成功率最高的", () => {
    expect(familyPick(options, false).id).toBe(3);
  });

  it("全部都只有 V002 拿得到時，退回成功率最高的", () => {
    const all = [scroll({ id: 5, rate: 60, o: "2026-10-15" }), scroll({ id: 4, rate: 10, o: "2026-10-15" })];
    expect(familyPick(all, true).id).toBe(5);
  });
});

describe("notesFor：玩家提醒依主題分組", () => {
  const notes = [
    note({ jobs: [400, 410], topic: "weapon", t: "盜賊與刺客的武器" }),
    note({ jobs: [410], topic: "armor", t: "刺客的防具" }),
    note({ jobs: [400], topic: "scroll", t: "盜賊的衝卷" }),
    note({ jobs: [410, 411], topic: "stat", t: "刺客與暗殺者的能力值" }),
  ];

  it("照 武器、衝卷、防具、能力值 的順序，標中文主題名", () => {
    const groups = notesFor(notes, 410);
    expect(groups.map(group => group.label)).toEqual(["武器", "衝卷", "防具", "能力值"]);
    expect(groups[0].notes.map(entry => entry.t)).toEqual(["盜賊與刺客的武器"]);
  });

  it("這一轉沒有的主題沿上一轉找（刺客沒有衝卷筆記 → 用盜賊的）", () => {
    const groups = notesFor(notes, 410);
    expect(groups.find(group => group.topic === "scroll")?.notes.map(entry => entry.t)).toEqual(["盜賊的衝卷"]);
  });

  it("這一轉自己有的主題就不再往上找；整條線都沒有的主題不出現", () => {
    const groups = notesFor(notes, 411);
    // 暗殺者自己有能力值筆記；武器、衝卷、防具沿刺客、盜賊往上找
    expect(groups.find(group => group.topic === "stat")?.notes.map(entry => entry.t)).toEqual(["刺客與暗殺者的能力值"]);
    expect(groups.find(group => group.topic === "armor")?.notes.map(entry => entry.t)).toEqual(["刺客的防具"]);
    // 俠盜：武器、衝卷沿盜賊（400）找得到；防具、能力值只掛在刺客那條線上，不出現
    expect(notesFor(notes, 420).map(group => group.topic)).toEqual(["weapon", "scroll"]);
  });

  it("初心者沒有玩家提醒", () => {
    expect(notesFor(notes, 0)).toEqual([]);
  });

  it("寫了 tab 的提醒只在選了那套點法時出現", () => {
    const tabbed = [note({ jobs: [210], topic: "stat", t: "轉換", tab: "裝備法" }), note({ jobs: [210], topic: "stat", t: "共通" })];
    expect(notesFor(tabbed, 210).flatMap(group => group.notes.map(n => n.t))).toEqual(["共通"]);
    expect(notesFor(tabbed, 210, "裝備法").flatMap(group => group.notes.map(n => n.t))).toEqual(["轉換", "共通"]);
  });
});

/* ------------------------------------------------------------------ 真資料 */

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const gear = JSON.parse(fs.readFileSync(`${DATA}gear.json`, "utf8")) as GearData;

describe("真資料：gearPlan 組出來的卡片內容", () => {
  it("刺客 Lv35（10/15 前）：銀守護拳套（同數值裡拿法最多），墮落城市後街吉姆合成；下一把 40 等、現在就拿得到", () => {
    const plan = gearPlan(gear, 410, 35, true);
    expect(plan.best?.n).toBe("銀守護拳套");
    expect(plan.bestSource).toMatchObject({ kind: "craft", craft: { n: "後街吉姆" } });
    expect(plan.next?.lv).toBe(40);
    expect(plan.next?.o).toBeUndefined();
    expect(plan.bestShort).toEqual([]);
  });

  it("火毒巫師 Lv40：黃色雨傘；同等級的杖只多 3 點魔力，不列「想用更強的」", () => {
    const plan = gearPlan(gear, 210, 40, true);
    expect(plan.best?.n).toBe("黃色雨傘");
    expect(plan.stronger).toBeNull();
    expect(plan.targets).toEqual({ STR: 4, DEX: 4, INT: 208, LUK: 4 });
  });

  it("祭司 Lv75：黃色雨傘；「想用更強的」是差在幸運的杖", () => {
    const plan = gearPlan(gear, 231, 75, true);
    expect(plan.best?.n).toBe("黃色雨傘");
    expect(plan.stronger?.s.endsWith("杖")).toBe(true);
    expect(plan.strongerShort.map(entry => entry.stat)).toEqual(["LUK"]);
    // 全智點法幸運永遠是 4，「還差 74」等於叫人補不可能的點數：改講「換成另一種點法就能用」
    expect(plan.strongerVia?.label).toBe("三轉裝備法：幸運＝等級＋3");
  });

  it("其他點法也穿不上時 strongerVia 是 null（只講還差幾點）", () => {
    const plan = gearPlan(gear, 410, 35, true);
    expect(plan.strongerVia).toBeNull();
  });

  it("十字軍 Lv75：沿用狂戰士的點法", () => {
    const plan = gearPlan(gear, 111, 75, true);
    expect(plan.inherited).toBe(true);
    expect(plan.rule?.jobs).toContain(110);
  });

  it("俠盜 Lv55：破碎刃；華氏短劍只多 3 攻擊卻要力量 40，不列「想用更強的」", () => {
    const plan = gearPlan(gear, 420, 55, true);
    expect(plan.best?.n).toBe("破碎刃");
    expect(plan.stronger).toBeNull();
    expect(plan.strongerShort).toEqual([]);
  });

  it("每組卷軸都挑了一張，10/15 前不挑只有 V002 才拿得到的（同一組還有別張時）", () => {
    for (const job of [110, 210, 310, 410, 420, 520]) {
      const plan = gearPlan(gear, job, 50, true);
      expect(plan.families.length).toBeGreaterThan(0);
      for (const family of plan.families) {
        expect(family.options).toContain(family.pick);
        if (family.options.some(option => !option.o)) expect(family.pick.o).toBeUndefined();
      }
    }
  });

  it("29 個職業從轉職到 120 等都組得出來，推薦的武器一定穿得上", () => {
    const jobs = [100, 110, 111, 120, 121, 130, 131, 200, 210, 211, 220, 221, 230, 231, 300, 310, 311, 320, 321, 400, 410, 411, 420, 421, 500, 510, 511, 520, 521];
    for (const job of jobs) {
      for (const level of [10, 30, 45, 70, 100, 120]) {
        const plan = gearPlan(gear, job, level, true);
        expect(plan.rule).not.toBeNull();
        expect(plan.bestShort).toEqual([]);
      }
    }
  });

  it("初心者：沒有點法、武器、卷軸，只給轉職前那一條", () => {
    const plan = gearPlan(gear, 0, 8, true);
    expect(plan.rule).toBeNull();
    expect(plan.best).toBeNull();
    expect(plan.families).toEqual([]);
    expect(plan.notes).toEqual([]);
  });
});

describe("bandGear：升級路線一段裡的武器跟卷", () => {
  const drop = (lv: number, o?: string) => ({ drops: [{ m: lv, n: `怪${lv}`, lv, map: 1, ...(o ? { o } : {}) }] });
  const fixture: GearData = {
    builtAt: "test",
    rules: [],
    notes: [],
    weapons: [
      weapon({ id: 25, n: "拳套25", lv: 25, atk: 16, src: { shops: [{ p: "店", pr: 1 }] } }),
      weapon({ id: 30, n: "拳套30", lv: 30, atk: 18, src: drop(30) }),
      weapon({ id: 35, n: "拳套35", lv: 35, atk: 20, src: drop(33) }),
      weapon({ id: 401, n: "只有V002的拳套40", lv: 40, atk: 22, src: drop(58, "2026-10-15"), o: "2026-10-15" }),
      weapon({ id: 402, n: "現在拿得到的拳套40", lv: 40, atk: 22, src: drop(40) }),
    ],
    scrolls: [
      scroll({ id: 1, n: "拳套攻擊卷軸", slot: "拳套", stat: "攻擊", rate: 60, src: drop(30) }),
      scroll({ id: 2, n: "手套攻擊卷軸", slot: "手套", stat: "攻擊", rate: 60, effect: "物理攻擊力+2", src: drop(55) }),
      scroll({ id: 3, n: "披風幸運卷軸", slot: "披風", stat: "幸運", rate: 60, effect: "幸運+2", src: drop(7) }),
    ],
  };

  it("只列「換武器的那一級」：30 等拿拳套30、35 等換拳套35", () => {
    const band = bandGear(fixture, 410, 30, 39, true);
    expect(band.weapons.map(entry => [entry.level, entry.weapon.id])).toEqual([[30, 30], [35, 35]]);
    expect(band.weapons[1].source).toMatchObject({ kind: "drop", drop: { lv: 33 } });
  });

  it("10/15 前同等級有現在拿得到的，就不推只有 V002 才拿得到的", () => {
    const band = bandGear(fixture, 410, 40, 49, true);
    expect(band.weapons.map(entry => entry.weapon.id)).toEqual([402]);
  });

  it("卷只列武器卷跟手套攻擊卷（部位的主屬性卷不隨等級變，留在首頁卡片）", () => {
    const band = bandGear(fixture, 410, 30, 39, true);
    expect(band.families.map(family => family.options[0].n)).toEqual(["拳套攻擊卷軸", "手套攻擊卷軸"]);
  });

  it("初心者回空的", () => {
    expect(bandGear(fixture, 0, 1, 9, true)).toEqual({ weapons: [], families: [] });
  });
});

describe("真資料：bandGear", () => {
  it("刺客 30–39：從 30 等起、依等級排、10/15 前來源都現在拿得到", () => {
    const band = bandGear(gear, 410, 30, 39, true);
    expect(band.weapons[0].level).toBe(30);
    const levels = band.weapons.map(entry => entry.level);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    for (const entry of band.weapons) expect(sourceOpensLater(entry.source!)).toBeUndefined();
    expect(band.families.length).toBeGreaterThan(0);
  });
});

describe("bandGear：還沒轉到選的職業時，用那一轉實際用的武器", () => {
  const shop = { shops: [{ p: "店", pr: 1 }] };
  const rule = (over: Partial<StatRule> & Pick<StatRule, "jobs" | "label" | "main">): StatRule => ({
    secondary: null, t: "", s: [], v: "tw", mainstream: true, ...over,
  });
  const fixture: GearData = {
    builtAt: "test",
    notes: [],
    scrolls: [],
    rules: [
      rule({ jobs: [400, 410], label: "幸運為主，敏捷只點到拳套需求", main: "LUK", weapons: ["拳套"] }),
      rule({ jobs: [420], label: "幸運為主，敏捷只點到短刀需求", main: "LUK" }),
      rule({ jobs: [500, 510], label: "力量為主，敏捷只點到指虎需求", main: "STR", weapons: ["指虎"] }),
      rule({ jobs: [500, 520], label: "力量＝等級，其餘全敏", main: "DEX", weapons: ["火槍"], mainstream: false }),
      rule({ jobs: [520], label: "每級 4 敏 1 力", main: "DEX" }),
    ],
    weapons: [
      weapon({ id: 1, n: "拳套", s: "拳套", lv: 20, atk: 14, job: 8, src: shop }),
      weapon({ id: 2, n: "短刀", s: "短刀", lv: 20, atk: 40, job: 8, src: shop }),
      weapon({ id: 3, n: "指虎", s: "指虎", lv: 20, atk: 20, job: 16, src: shop }),
      weapon({ id: 4, n: "火槍", s: "火槍", lv: 20, atk: 18, job: 16, src: shop }),
    ],
  };

  it("俠盜的一轉（10–29）列拳套：一轉盜賊不管之後走哪條都是丟標；30 等起才列短刀", () => {
    expect(bandGear(fixture, 420, 21, 29, true).weapons.map(entry => entry.weapon.s)).toEqual(["拳套"]);
    expect(bandGear(fixture, 420, 30, 39, true).weapons.map(entry => entry.weapon.s)).toEqual(["短刀"]);
  });

  it("槍手的一轉照「力量＝等級」那套列火槍（那一轉有對得上槍手武器的點法就用它）", () => {
    expect(bandGear(fixture, 520, 21, 29, true).weapons.map(entry => entry.weapon.s)).toEqual(["火槍"]);
  });
});

describe("合成的寫法", () => {
  const craft = { n: "後街吉姆", m: 103000000, mats: [{ id: 1472000, n: "拳套", c: 1 }, { id: 4011001, n: "鋼鐵", c: 3 }, { id: 4000021, n: "動物皮", c: 20 }, { id: 4003001, n: "木材", c: 30 }], fee: 5000 };

  it("「墮落城市的後街吉姆合成」＋材料「拳套、鋼鐵×3、動物皮×20、木材×30、5,000 楓幣」", () => {
    expect(sourceText({ kind: "craft", craft }, id => (id === 103000000 ? "墮落城市" : "?"))).toBe("墮落城市的後街吉姆合成");
    expect(craftMaterialsText(craft)).toBe("拳套、鋼鐵×3、動物皮×20、木材×30、5,000 楓幣");
    expect(sourceOpensLater({ kind: "craft", craft: { ...craft, o: "2026-10-15" } })).toBe("2026-10-15");
  });
});

describe("真資料：狼牙（台服靠後街吉姆合成）", () => {
  it("一轉盜賊 25 等推狼牙，墮落城市後街吉姆合成——10/15 開放後也一樣，不推冰原雪域斯考特的店", () => {
    const before = gearPlan(gear, 400, 25, true);
    const after = gearPlan(gear, 400, 25, false);
    expect(before.best?.n).toBe("狼牙");
    expect(after.best?.n).toBe("狼牙");
    expect(before.bestSource).toMatchObject({ kind: "craft", craft: { n: "後街吉姆", m: 103000000 } });
    expect(after.bestSource).toMatchObject({ kind: "craft", craft: { n: "後街吉姆", m: 103000000 } });
  });

  it("俠盜的升級路線 21–29（一轉）在 25 等換狼牙，10/15 開放後也寫後街吉姆合成", () => {
    const wolf = bandGear(gear, 420, 21, 29, false).weapons.find(entry => entry.weapon.n === "狼牙");
    expect(wolf?.level).toBe(25);
    expect(wolf?.source).toMatchObject({ kind: "craft", craft: { n: "後街吉姆", m: 103000000 } });
  });
});

describe("真資料：10/15 開放後同一把武器還是先推舊地區拿得到的", () => {
  it("劍士 35 等綠蛇刀：小幽靈（Lv.35）會掉，不推冰原雪域斯考特賣 200,000 楓幣", () => {
    const plan = gearPlan(gear, 100, 35, false);
    expect(plan.best?.n).toBe("綠蛇刀");
    expect(plan.bestSource).toMatchObject({ kind: "drop", drop: { n: "小幽靈", lv: 35 } });
  });

  it("火毒巫師 45 等黃色雨傘：青螃蟹（Lv.48）會掉，不推天空之城雲彩公園的月光精靈", () => {
    const plan = gearPlan(gear, 210, 45, false);
    expect(plan.best?.n).toBe("黃色雨傘");
    expect(plan.bestSource).toMatchObject({ kind: "drop", drop: { n: "青螃蟹", lv: 48 } });
  });
});

describe("tabsFor：卡片上方的點法切換", () => {
  it("刺客：一般點法、全幸；暗殺者也有；法師各轉都是全智、裝備法", () => {
    expect(tabsFor(gear.rules, 410).map(t => t.tab)).toEqual(["一般點法", "全幸"]);
    expect(tabsFor(gear.rules, 400).map(t => t.tab)).toEqual(["一般點法", "全幸"]);
    expect(tabsFor(gear.rules, 411).map(t => t.tab)).toEqual(["一般點法", "全幸"]);
    for (const job of [200, 210, 220, 230, 211, 221, 231]) expect(tabsFor(gear.rules, job).map(t => t.tab)).toEqual(["全智", "裝備法"]);
  });

  it("俠盜、神偷也有一般點法、全幸（2026-10-08 使用者：照刺客的做法加）", () => {
    for (const job of [420, 421]) expect(tabsFor(gear.rules, job).map(t => t.tab)).toEqual(["一般點法", "全幸"]);
  });

  it("劍士、弓箭手、海盜沒有切換", () => {
    for (const job of [100, 110, 131, 310, 320, 510, 520]) expect(tabsFor(gear.rules, job)).toEqual([]);
  });

  it("每個標籤都有點法按鈕下那行白話說明（tabText）", () => {
    for (const job of [400, 410, 411, 420, 421, 200, 210, 211, 231]) {
      for (const { tab, rule } of tabsFor(gear.rules, job)) expect(rule.tabText, `${job} ${tab}`).toBeTruthy();
    }
  });
});

describe("真資料：gearPlan 選了第二套", () => {
  it("刺客 35 全幸：四格敏 25、幸 162；敏捷靠裝備補 19 到 44，拳套是青銅指虎；空身先點到 31 就能用狼牙；一般點法這級用銀守護拳套", () => {
    const plan = gearPlan(gear, 410, 35, true, "全幸");
    expect(plan.rule?.tab).toBe("全幸");
    expect(plan.targets).toEqual({ STR: 4, DEX: 25, INT: 4, LUK: 162 });
    expect(plan.kit).toMatchObject({ stat: "DEX", base: 25, total: 19, wear: 44 });
    expect(plan.kit?.worn.map(k => k.piece.n)).toEqual(["藍色桑那服／紅色桑那服", "破舊的披風", "綠色斗笠", "黏稠稠鞋子"]);
    expect(plan.kit?.worn[0].source).toMatchObject({ kind: "quest" });
    expect(plan.best?.n).toBe("青銅指虎");
    expect(plan.stronger?.n).toBe("狼牙");
    expect(plan.strongerShort).toEqual([{ stat: "DEX", short: 6 }]);
    expect(plan.strongerVia).toBeNull();
    expect(plan.diff).toEqual({ tab: "一般點法", stat: "LUK", delta: 45 });
    expect(plan.compare).toMatchObject({ tab: "一般點法", weapon: { n: "銀守護拳套" }, need: { stat: "DEX", value: 70 } });
    expect(plan.others.map(r => r.tab)).toContain("一般點法");
  });

  it("刺客 35 全幸的衝卷：套服敏捷卷軸、拳套攻擊卷軸，再來披風敏捷卷軸", () => {
    const plan = gearPlan(gear, 410, 35, true, "全幸");
    expect(plan.families.slice(0, 3).map(f => `${f.slot}${f.stat}`)).toEqual(["套服敏捷", "拳套攻擊", "披風敏捷"]);
  });

  it("盜賊 25 全幸的衝卷：桑那服 30 等才拿得到，披風敏捷卷軸先、拳套攻擊卷軸再來，套服敏捷卷軸排在拳套攻擊後面", () => {
    const names = gearPlan(gear, 400, 25, true, "全幸").families.map(f => `${f.slot}${f.stat}`);
    expect(names.slice(0, 2)).toEqual(["披風敏捷", "拳套攻擊"]);
    expect(names.indexOf("套服敏捷")).toBeGreaterThan(names.indexOf("拳套攻擊"));
  });

  it("盜賊 15 全幸的衝卷：披風、桑那服都還穿不上，拳套攻擊卷軸排第一，套服敏捷、披風敏捷卷軸都在後面", () => {
    const names = gearPlan(gear, 400, 15, true, "全幸").families.map(f => `${f.slot}${f.stat}`);
    expect(names[0]).toBe("拳套攻擊");
    expect(names.indexOf("套服敏捷")).toBeGreaterThan(0);
    expect(names.indexOf("披風敏捷")).toBeGreaterThan(0);
  });

  it("刺客 25 全幸：披風 +5 後才戴得上斗笠，敏捷 33 → 鋼鐵拳套；桑那服、鞋子 30 等才有", () => {
    const plan = gearPlan(gear, 410, 25, true, "全幸");
    expect(plan.kit).toMatchObject({ total: 8, wear: 33 });
    expect(plan.kit?.later.map(k => k.piece.lv)).toEqual([30, 30]);
    expect(plan.best?.n).toBe("鋼鐵拳套");
  });

  it("暗殺者 80 全幸：還是青銅指虎（一般點法是閃電甲）", () => {
    const plan = gearPlan(gear, 411, 80, false, "全幸");
    expect(plan.best?.n).toBe("青銅指虎");
    expect(plan.compare?.weapon.n).toContain("閃電甲");
  });

  it("暗殺者 80 全幸：點法那行寫的武器是「拳套」，不是「武器要的敏捷」（跟盜賊、刺客一樣）", () => {
    expect(gearPlan(gear, 411, 80, false, "全幸").rule?.weapons).toEqual(["拳套"]);
  });

  it("火毒巫師 50 裝備法：大魔法師短杖；比全智少 49 智力；全智這級用黃色雨傘；沒有要湊的裝備", () => {
    const plan = gearPlan(gear, 210, 50, true, "裝備法");
    expect(plan.best?.n).toBe("大魔法師短杖");
    expect(plan.targets).toEqual({ STR: 4, DEX: 4, INT: 209, LUK: 53 });
    expect(plan.diff).toEqual({ tab: "全智", stat: "INT", delta: -49 });
    expect(plan.compare).toMatchObject({ tab: "全智", weapon: { n: "黃色雨傘" }, need: null });
    expect(plan.kit).toBeNull();
  });

  it("魔導士（火毒）70 裝備法：天使之翼", () => {
    expect(gearPlan(gear, 211, 70, false, "裝備法").best?.n).toBe("天使之翼");
  });

  it("火毒巫師：玩家提醒・能力值有洗點（寫明要花真錢）跟不洗點兩條，全智、裝備法兩頁都看得到", () => {
    const stat = (tab?: string) => gearPlan(gear, 210, 50, true, tab).notes.find(group => group.topic === "stat")?.notes.map(n => n.t) ?? [];
    for (const tab of ["裝備法", undefined]) {
      expect(stat(tab).filter(t => t.startsWith("全智轉裝備法"))).toHaveLength(2);
      expect(stat(tab).some(t => t.includes("洗點") && t.includes("真錢"))).toBe(true);
      expect(stat(tab).some(t => t.includes("不洗點"))).toBe(true);
    }
  });

  it("俠盜 35 全幸（舊版經驗）：敏捷 25＋裝備 19＝44 → 飛影刃；空身先點到 36 就能用雙枝短刀；一般點法這級用暗影刃（要敏捷 70）", () => {
    const plan = gearPlan(gear, 420, 35, true, "全幸");
    expect(plan.rule?.tab).toBe("全幸");
    expect(plan.rule?.v).toBe("legacy");
    expect(plan.rule?.weapons).toEqual(["短刀"]);
    expect(plan.kit).toMatchObject({ stat: "DEX", base: 25, total: 19, wear: 44 });
    expect(plan.best?.n).toBe("飛影刃");
    expect(plan.stronger?.n).toBe("雙枝短刀");
    expect(plan.strongerShort).toEqual([{ stat: "DEX", short: 11 }]);
    expect(plan.compare).toMatchObject({ tab: "一般點法", weapon: { n: "暗影刃" }, need: { stat: "DEX", value: 70 } });
    expect(plan.families[0]).toMatchObject({ slot: "套服", stat: "敏捷" });
    expect(plan.families.some(f => f.slot === "短刀" && f.stat === "攻擊")).toBe(true);
  });

  it("神偷 80 全幸：三轉也有全幸、要湊的裝備同一份", () => {
    const plan = gearPlan(gear, 421, 80, false, "全幸");
    expect(plan.rule?.tab).toBe("全幸");
    expect(plan.kit?.wear).toBe(44);
    expect(plan.best?.s).toBe("短刀");
  });

  it("沒選、選了主推、選了這個職業沒有的標籤：都照主推（diff、compare、kit 都是 null）", () => {
    for (const tab of [undefined, null, "一般點法", "裝備法"]) {
      const plan = gearPlan(gear, 410, 35, true, tab);
      expect(plan.rule?.tab).toBe("一般點法");
      expect(plan.best?.n).toBe("銀守護拳套");
      expect(plan.diff).toBeNull();
      expect(plan.compare).toBeNull();
      expect(plan.kit).toBeNull();
    }
    expect(gearPlan(gear, 420, 35, true, "裝備法").rule?.label).toBe("幸運為主，敏捷只點到短刀需求");
    expect(gearPlan(gear, 110, 35, true, "全幸").rule?.tab).toBeUndefined();
  });

  it("綠色斗笠只有〈第一次同行〉（21 到 30 等）能拿：35 等任務已經接不到，還是寫去哪拿、並標 30 等以後接不到；桑那服的任務沒有上限不標", () => {
    for (const level of [25, 35]) {
      const plan = gearPlan(gear, 410, level, true, "全幸");
      const entries = [...(plan.kit?.worn ?? []), ...(plan.kit?.later ?? [])];
      const hat = entries.find(entry => entry.piece.n === "綠色斗笠");
      expect(hat?.source).toMatchObject({ kind: "quest", quest: { n: "第一次同行" } });
      expect(hat?.closedAfter).toBe(30);
      const sauna = entries.find(entry => entry.piece.n.startsWith("藍色桑那服"));
      expect(sauna?.source).toMatchObject({ kind: "quest" });
      expect(sauna?.closedAfter).toBeUndefined();
    }
  });

  it("盜賊 10 等全幸：敏捷跟一般點法一樣多，不寫「多 0 點」（diff 是 null）；15 等多 5 點", () => {
    expect(gearPlan(gear, 400, 10, true, "全幸").diff).toBeNull();
    expect(gearPlan(gear, 400, 15, true, "全幸").diff).toMatchObject({ stat: "LUK", delta: 5 });
  });

  it("盜賊 15 等全幸：一般點法這級用的跟「再強一點」是同一把鋼鐵拳套，不講兩次（compare 是 null）", () => {
    const plan = gearPlan(gear, 400, 15, true, "全幸");
    expect(plan.stronger?.n).toBe("鋼鐵拳套");
    expect(plan.compare).toBeNull();
  });
});

describe("bandGear：升級路線跟著卡片選的點法換（第二套點法）", () => {
  const shop = { shops: [{ p: "店", pr: 1 }] };
  const rule = (over: Partial<StatRule> & Pick<StatRule, "jobs" | "label" | "main">): StatRule => ({
    secondary: null, t: "", s: [], v: "tw", mainstream: true, ...over,
  });
  const claw = (id: number, lv: number, atk: number, dex: number) =>
    weapon({ id, n: `拳套${lv}`, s: "拳套", lv, atk, job: 8, req: { DEX: dex }, src: shop });
  const kit = [
    { ids: [1], n: "披風", slot: "披風", lv: 25, stat: "DEX" as const, v: 5, scroll: { id: 9, n: "披風敏捷卷軸", slot: "披風", stat: "敏捷", rate: 100, times: 5 }, src: shop },
    { ids: [2], n: "桑那服", slot: "套服", lv: 30, stat: "DEX" as const, v: 10, scroll: { id: 8, n: "套服敏捷卷軸", slot: "套服", stat: "敏捷", rate: 100, times: 10 }, src: shop },
  ];
  const fixture: GearData = {
    builtAt: "test",
    notes: [],
    rules: [
      rule({ jobs: [400, 410], label: "一般", main: "LUK", secondary: { stat: "DEX", type: "equip", floor: 25 }, weapons: ["拳套"], tab: "一般點法" }),
      rule({ jobs: [400, 410], label: "全幸", main: "LUK", secondary: { stat: "DEX", type: "fixed", value: 25 }, weapons: ["拳套"], tab: "全幸", mainstream: false, kit }),
      rule({ jobs: [420], label: "俠盜", main: "LUK", weapons: ["短刀"] }),
    ],
    weapons: [claw(1, 10, 10, 0), claw(2, 20, 14, 30), claw(3, 30, 18, 40), claw(4, 35, 20, 70)],
    scrolls: [
      scroll({ id: 7, n: "拳套攻擊卷軸", slot: "拳套", stat: "攻擊", rate: 60, src: shop }),
      scroll({ id: 8, n: "套服敏捷卷軸", slot: "套服", stat: "敏捷", rate: 100, effect: "DEX+1", src: shop }),
      scroll({ id: 9, n: "披風敏捷卷軸", slot: "披風", stat: "敏捷", rate: 100, effect: "DEX+1", src: shop }),
    ],
  };

  it("刺客選全幸：30–39 照「空身＋要湊的裝備」（敏捷 25＋15＝40）拿拳套30，不是一般點法 35 等換的拳套35", () => {
    expect(bandGear(fixture, 410, 30, 39, true).weapons.map(e => e.weapon.n)).toEqual(["拳套30", "拳套35"]);
    expect(bandGear(fixture, 410, 30, 39, true, "全幸").weapons.map(e => e.weapon.n)).toEqual(["拳套30"]);
  });

  it("全幸：這段剛穿得上的要湊裝備，它的卷也列進這段（30–39 桑那服 → 套服敏捷卷軸；披風 25 等就穿了，不再列）", () => {
    const names = (from: number, to: number) => bandGear(fixture, 410, from, to, true, "全幸").families.map(f => f.options[0].n);
    expect(names(30, 39)).toEqual(["拳套攻擊卷軸", "套服敏捷卷軸"]);
    expect(names(21, 29)).toEqual(["拳套攻擊卷軸", "披風敏捷卷軸"]);
    expect(bandGear(fixture, 410, 30, 39, true).families.map(f => f.options[0].n)).toEqual(["拳套攻擊卷軸"]);
  });

  it("還沒轉到選的職業（一轉）也照選的點法：一轉盜賊 21–29 全幸穿不上拳套20（敏捷 25＋5＝30 才穿得上，25 等才有披風）", () => {
    expect(bandGear(fixture, 410, 21, 29, true, "全幸").weapons.map(e => [e.level, e.weapon.n])).toEqual([[21, "拳套10"], [25, "拳套20"]]);
  });

  it("現在的職業卡片上沒有這個標籤（俠盜沒有全幸）：不換", () => {
    expect(bandGear(fixture, 420, 21, 29, true, "全幸")).toEqual(bandGear(fixture, 420, 21, 29, true));
  });
});

describe("真資料：選了第二套的升級路線、運氣好的上限、法師防具", () => {
  it("刺客 30–39 全幸：青銅指虎（一般點法 30 等鋰礦鬥拳、35 等守護拳套）；卷多套服敏捷卷軸", () => {
    const band = bandGear(gear, 410, 30, 39, true, "全幸");
    expect(band.weapons.map(e => e.weapon.n)).toEqual(["青銅指虎"]);
    expect(band.families.some(f => f.slot === "套服" && f.stat === "敏捷")).toBe(true);
  });

  it("火毒 50–59 裝備法：法杖（大魔法師短杖），不是全智的黃色雨傘", () => {
    expect(bandGear(gear, 210, 50, 59, true, "裝備法").weapons[0].weapon.n).toBe("大魔法師短杖");
    expect(bandGear(gear, 210, 50, 59, true).weapons[0].weapon.n).toBe("黃色雨傘");
  });

  it("刺客 35 全幸：空身先點到 31 就能用狼牙，幸運少 6（strongerCost）；一般點法沒有這個", () => {
    expect(gearPlan(gear, 410, 35, true, "全幸").strongerCost).toEqual({ stat: "LUK", value: 6 });
    expect(gearPlan(gear, 410, 35, true).strongerCost).toBeNull();
  });

  it("刺客 35 全幸：套服、披風改衝 60% 卷全部成功，敏捷最多 59（多 15），能用狼牙", () => {
    const lucky = gearPlan(gear, 410, 35, true, "全幸").kit?.lucky;
    expect(lucky).toMatchObject({ rate: 60, slots: ["套服", "披風"], wear: 59, weapon: { n: "狼牙" } });
  });

  it("刺客 25 全幸：只有披風能衝（桑那服 30 等才有），60% 全過敏捷 38，還是鋼鐵拳套那級", () => {
    const lucky = gearPlan(gear, 410, 25, true, "全幸").kit?.lucky;
    expect(lucky).toMatchObject({ rate: 60, slots: ["披風"], wear: 38 });
    expect(lucky?.weapon?.lv).toBe(15);
  });

  it("盜賊 15 全幸：要湊的裝備一件都還穿不上，沒有運氣好的上限", () => {
    expect(gearPlan(gear, 400, 15, true, "全幸").kit?.lucky).toBeNull();
  });

  it("火毒 50 裝備法：每個部位列一件穿得上的法師防具（都穿得上、等級不超過 50、10/15 前沒有只有 V002 的）；全智幸運 4 都穿不上", () => {
    const plan = gearPlan(gear, 210, 50, true, "裝備法");
    const pieces = plan.armor?.pieces ?? [];
    expect(pieces.map(p => p.piece.slot)).toContain("帽子");
    expect(pieces.map(p => p.piece.slot)).toContain("鞋子");
    for (const { piece, source } of pieces) {
      expect(piece.lv).toBeLessThanOrEqual(50);
      expect(piece.o).toBeUndefined();
      expect(piece.req?.LUK ?? 0).toBeLessThanOrEqual(53);
      expect(source).not.toBeNull();
    }
    expect(plan.armor?.mainCannot).toMatchObject({ tab: "全智", stat: "LUK", have: 4 });
    expect(plan.armor?.mainCannot?.slots).toContain("帽子");
  });

  it("法師 10 裝備法：8 等修煉服、10 等馬車鞋不要能力值，全智也穿得上；全智穿不上的只有要幸運 13 的帽子", () => {
    const plan = gearPlan(gear, 200, 10, true, "裝備法");
    expect(plan.armor?.pieces.map(p => p.piece.slot)).toEqual(["帽子", "上衣", "褲裙", "鞋子"]);
    expect(plan.armor?.mainCannot).toEqual({ tab: "全智", stat: "LUK", have: 4, slots: ["帽子"] });
  });

  it("全智、刺客沒有法師防具那塊", () => {
    expect(gearPlan(gear, 210, 50, true).armor).toBeNull();
    expect(gearPlan(gear, 410, 35, true, "全幸").armor).toBeNull();
  });
});