import { describe, expect, it } from "vitest";
import { applyDamageLink, computeGroup, defaultState, parseDamageLink } from "@/lib/damage-view";
import { articleDamageHref, articleKillStats, assumptionLines, buildCalcTable, tableGearLine, tableLevels, validateArticle, type JobArticle } from "@/lib/job-article";
import { staticCalcData, staticJobArticle, staticJobArticleKeys } from "@/lib/static-data";

const data = staticCalcData();
const article = (job: number) => staticJobArticle(job, 31, 50) as JobArticle;
const tableOf = (job: number, gear = article(job).gear) => buildCalcTable({ job, from: 31, to: 50, data, gear, statCap: article(job).statCap });
const JOBS = [110, 230, 310, 410, 420];

describe("表算的是文章主推的武器，每個等級都有數字", () => {
  it("印哪幾級：範圍裡的 5 的倍數加中段", () => {
    expect(tableLevels(31, 50)).toEqual([35, 40, 45]);
    expect(tableLevels(51, 70)).toEqual([55, 60, 65]);
    expect(tableLevels(10, 30)).toEqual([15, 20, 25]);
    expect(tableLevels(91, 120)).toEqual([95, 105, 115]);
  });

  it.each(JOBS)("%i：每一欄都是 gear 寫的那把，數字跟同等級同武器的代號一樣", job => {
    const table = tableOf(job);
    const { gear, statCap } = article(job);
    expect(statCap === undefined || table.statCap !== null).toBe(true);
    expect(table.columns.map(column => column.level)).toEqual([35, 40, 45]);
    table.columns.forEach((column, index) => {
      const piece = gear.find(entry => column.level >= entry.from && column.level <= entry.to)!;
      expect(column.weapon!.id).toBe(piece.weapon);
      // 指定招式（僧侶按爪）代號算不到，下面單獨驗
      if (piece.skill !== undefined) return;
      for (const row of table.rows) {
        const stats = articleKillStats({ mobId: row.id, level: column.level, weaponId: piece.weapon, targets: column.targets ?? undefined, table, data });
        expect(row.avgs[index]).toBeCloseTo(stats.avg, 6);
      }
    });
  });

  it("俠盜：35 等丟拳套，40、45 等拿刀，招式跟著換，表上那行分開寫", () => {
    const table = tableOf(420);
    const [low, mid, high] = table.columns;
    expect(low.weapon!.id).toBe(1472004);
    expect(mid.weapon!.id).toBe(1332012);
    expect(high.weapon!.id).toBe(1332012);
    expect(low.skill.name).toBe("雙飛斬");
    expect(mid.skill.name).toBe("迴旋斬");
    expect(tableGearLine(table)).toBe(`35 等拿${low.weapon!.name}放雙飛斬；40、45 等拿${mid.weapon!.name}放迴旋斬`);
  });

  it("僧侶：35 等欄是結論叫讀者按的魔力爪、短杖、打 1 隻，40 等起才是傘跟治癒 3 隻", () => {
    const table = tableOf(230);
    const [low, mid] = table.columns;
    expect(low.skill.name).toBe("魔力爪");
    expect(low.weapon!.id).toBe(1372005);
    expect(low.targets).toBeNull();
    expect(mid.skill.name).toBe("群體治癒");
    expect(mid.weapon!.id).toBe(1302016);
    expect(mid.targets).toBe(3);
    const group = { ...defaultState(data, 230, 35, null).groups[0], weaponId: 1372005, weaponAtk: null, ammoId: null };
    const row = table.rows[0];
    const monster = data.monsters.find(entry => entry.id === row.id)!;
    const result = computeGroup(data, { job: 230, skillId: 2001005, skillLevel: group.levels[2001005], monsterId: row.id }, group, monster);
    expect(result.ok && Math.abs(row.avgs[0]! - result.vs!.kills.avg)).toBeLessThan(1);
    expect(tableGearLine(table)).toContain("35 等拿木製短杖放魔力爪");
  });

  it("同一把到底：表上那行不寫等級；假設行每一欄一條", () => {
    const table = tableOf(110);
    expect(tableGearLine(table)).toBe(`拿${table.columns[0].weapon!.name}放魔天一擊`);
    const lines = assumptionLines(table).join("\n");
    for (const level of [35, 40, 45]) expect(lines).toContain(`Lv.${level}：`);
  });

  it("配點上限照文章算：刺客、俠盜敏捷 60，多的算回幸運", () => {
    for (const job of [410, 420]) {
      const table = tableOf(job);
      const plain = defaultState(data, job, 40, null).groups[0].stats;
      const { stats } = table.assumptions;
      expect(stats.DEX).toBe(60);
      expect(stats.LUK).toBe(plain.LUK + (plain.DEX - 60));
    }
  });

  it("幾等不 MISS 照每一級自己的武器、能力值算", () => {
    const table = tableOf(420);
    const row = table.rows.find(entry => entry.hitLv !== null && entry.hitLv > 31)!;
    const need = (level: number) => {
      const stats = articleKillStats({ mobId: row.id, level, weaponId: level <= 35 ? 1472004 : 1332012, table, data });
      return stats.accuracy;
    };
    expect(need(row.hitLv!).have).toBeGreaterThanOrEqual(need(row.hitLv!).need);
    expect(need(row.hitLv! - 1).have).toBeLessThan(need(row.hitLv! - 1).need);
  });
});

describe("防呆：gear 寫錯這篇不出", () => {
  const openMaps = new Set(Object.keys(data.maps).map(Number));
  const check = (job: number, gear: unknown) => validateArticle({ ...article(job), gear }, { job, from: 31, to: 50, data, openMaps }).join("\n");

  it("沒寫、型別錯、沒蓋滿、中間斷掉都擋", () => {
    expect(check(110, undefined)).toMatch(/gear/);
    expect(check(110, "1402008")).toMatch(/gear/);
    expect(check(110, [{ from: 31, to: 49, weapon: 1402008 }])).toMatch(/gear.*連續/);
    expect(check(420, [{ from: 31, to: 34, weapon: 1472004 }, { from: 36, to: 50, weapon: 1332012 }])).toMatch(/gear.*連續/);
  });
  it("指定的招還沒點、中段那把不在計算機選單都擋", () => {
    expect(check(230, [{ from: 31, to: 50, weapon: 1372005, skill: 2301004 }])).toMatch(/gear.*還沒點/);
    expect(check(420, [{ from: 31, to: 45, weapon: 1472004 }, { from: 46, to: 50, weapon: 1332012 }])).toMatch(/gear.*計算機的武器選單/);
  });
  it("不是這職業的武器、等級還拿不到都擋", () => {
    expect(check(110, [{ from: 31, to: 50, weapon: 1452000 }])).toMatch(/gear.*拿不到/);
    expect(check(420, [{ from: 31, to: 50, weapon: 1332003 }])).toMatch(/gear/);
  });
  it("真檔每一篇：表算的每一把，結論都要講到（讀者照結論買，表才算的是他手上那把）", () => {
    const keys = staticJobArticleKeys();
    expect(keys.length).toBeGreaterThanOrEqual(5);
    for (const { job, from, to } of keys) {
      const { answer, gear } = staticJobArticle(job, from, to)!;
      const text = JSON.stringify(answer);
      for (const { weapon } of gear) expect(text.includes(`weapon:${weapon}}`) || text.includes(`#${weapon}`), `${job}-${from}-${to} ${weapon}`).toBe(true);
    }
  });
});

describe("表下的計算機連結開出來就是表上中段那一組", () => {
  it("有配點上限才帶能力值，算出來跟表一樣", () => {
    expect(articleDamageHref(tableOf(110))).not.toContain("dex=");
    const table = tableOf(410);
    const href = articleDamageHref(table);
    expect(href).toContain("dex=60");
    const link = parseDamageLink(href.split("?")[1]);
    expect(link?.stats).toEqual(table.assumptions.stats);
    const state = applyDamageLink(defaultState(data, 410, 40, null), data, link);
    expect(state.groups[0].stats).toEqual(table.assumptions.stats);
    expect(state.groups[0].weaponId).toBe(table.assumptions.weapon!.id);
    const row = table.rows[0];
    const monster = data.monsters.find(entry => entry.id === row.id)!;
    const result = computeGroup(data, { ...state.shared, monsterId: row.id }, state.groups[0], monster);
    expect(result.ok && result.vs!.kills.avg).toBe(row.hits);
  });
  it("能力值少一項或不是整數當沒帶", () => {
    expect(parseDamageLink("job=410&level=40&str=4&dex=60&int=4")?.stats).toBeNull();
    expect(parseDamageLink("job=410&level=40&str=4&dex=60.5&int=4&luk=9")?.stats).toBeNull();
  });
});
