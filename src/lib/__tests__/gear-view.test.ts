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
  it("一轉盜賊 25 等推狼牙，來源是合成", () => {
    const plan = gearPlan(gear, 400, 25, true);
    expect(plan.best?.n).toBe("狼牙");
    expect(plan.bestSource?.kind).toBe("craft");
  });

  it("俠盜的升級路線 21–29（一轉）在 25 等換狼牙", () => {
    const band = bandGear(gear, 420, 21, 29, true);
    expect(band.weapons.find(entry => entry.weapon.n === "狼牙")?.level).toBe(25);
  });
});
