/**
 * 攻略文的平均下數（v1.50）：計算機的 kills.avg 是平均傷害無條件進位，1.45 跟 1.15 都寫 2，比較就會錯。
 * 這裡驗：確定算法（killStats）跟 Monte Carlo 差 2% 內、四個新代號、計算表改印平均、比較句的防呆。
 * 背景見 docs/superpowers/specs/2026-11-04-job-articles-design.md「v1.50」。
 */
import fs from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JobArticleTable } from "@/components/JobArticleView";
import { killStats, type Range } from "@/lib/damage";
import { HEAL } from "@/lib/damage-skills";
import { computeGroup, defaultState } from "@/lib/damage-view";
import {
  articleAssumes,
  articleKillStats,
  articleShowText,
  assumptionLines,
  avgText,
  buildCalcTable,
  fillTokens,
  hitComparisonProblems,
  oneShotPercent,
  validateArticle,
  xp10Text,
  type JobArticle,
} from "@/lib/job-article";
import { staticCalcData, staticOpenMaps } from "@/lib/static-data";

const data = staticCalcData();

/** 固定種子的亂數（mulberry32）：測試每次都一樣，不會偶發紅 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mix = state;
    mix = Math.imul(mix ^ (mix >>> 15), mix | 1);
    mix ^= mix + Math.imul(mix ^ (mix >>> 7), mix | 61);
    return ((mix ^ (mix >>> 14)) >>> 0) / 4294967296;
  };
}

/** 真的一下一下打：每下各自擲爆擊，傷害在範圍裡均勻取整數；一次 hits 下打完才算下一次 */
function simulate(hp: number, normal: Range, crit: Range | null, rate: number, hits: number, runs: number, seed = 20261104) {
  const random = seeded(seed);
  const roll = (range: Range) => range.min + Math.floor(random() * (range.max - range.min + 1));
  let uses = 0;
  let oneShots = 0;
  for (let run = 0; run < runs; run++) {
    let left = hp;
    let count = 0;
    while (left > 0) {
      count++;
      for (let hit = 0; hit < hits; hit++) left -= crit && random() < rate ? roll(crit) : roll(normal);
    }
    uses += count;
    if (count === 1) oneShots++;
  }
  return { avg: uses / runs, oneShot: oneShots / runs };
}

const relative = (actual: number, expected: number) => Math.abs(actual - expected) / expected;
const loadArticle = (job: number) => JSON.parse(fs.readFileSync(path.join("src/data/job-articles", `${job}-31-50.json`), "utf8")) as JobArticle;

describe("killStats：平均幾下打死的確定算法", () => {
  const flat = (value: number): Range => ({ min: value, max: value });

  it("最低一下就夠：平均 1 下、一下打死 100%", () => {
    expect(killStats(100, { min: 100, max: 200 }, null, 0, 1)).toEqual({ avg: 1, oneShot: 1 });
  });

  it("傷害固定：剛好幾下就是幾下", () => {
    expect(killStats(100, flat(50), null, 0, 1)).toEqual({ avg: 2, oneShot: 0 });
    expect(killStats(101, flat(50), null, 0, 1)).toEqual({ avg: 3, oneShot: 0 });
  });

  it("傷害有範圍：手算得出來的例子", () => {
    // 打 1 或 2、HP 2：一半一下死、一半兩下死
    const result = killStats(2, { min: 1, max: 2 }, null, 0, 1);
    expect(result.avg).toBeCloseTo(1.5, 10);
    expect(result.oneShot).toBeCloseTo(0.5, 10);
  });

  it("一次打兩下：第一下打死也算一次，沒打完的那下不另外算", () => {
    expect(killStats(3, flat(1), null, 0, 2).avg).toBe(2);
    expect(killStats(2, flat(1), null, 0, 2)).toEqual({ avg: 1, oneShot: 1 });
  });

  it("爆擊每下各擲一次", () => {
    // 爆一下就死，否則五下才死：1＋.5＋.25＋.125＋.0625
    expect(killStats(50, flat(10), flat(100), 0.5, 1).avg).toBeCloseTo(1.9375, 10);
    // 一次兩下，兩下都不爆才活：1−.5²
    expect(killStats(100, flat(10), flat(100), 0.5, 2).oneShot).toBeCloseTo(0.75, 10);
  });

  it("不會低於 HP÷一次期望（計算機無條件進位前的數字）", () => {
    const expected = 2 * (0.6 * 75 + 0.4 * 150);
    expect(killStats(1000, { min: 50, max: 100 }, { min: 100, max: 200 }, 0.4, 2).avg).toBeGreaterThanOrEqual(1000 / expected);
  });

  it("免疫（每下 1）、HP 大也算得完", () => {
    expect(killStats(30000, flat(1), null, 0, 1).avg).toBe(30000);
  });

  it.each([
    { hp: 1500, normal: { min: 180, max: 330 }, crit: { min: 290, max: 520 }, rate: 0.4, hits: 2 },
    { hp: 300, normal: { min: 100, max: 400 }, crit: null, rate: 0, hits: 1 },
    { hp: 5000, normal: { min: 200, max: 700 }, crit: null, rate: 0, hits: 3 },
    { hp: 2600, normal: { min: 30, max: 900 }, crit: { min: 60, max: 1800 }, rate: 0.5, hits: 2 },
    { hp: 120, normal: { min: 20, max: 25 }, crit: { min: 40, max: 50 }, rate: 0.15, hits: 1 },
  ])("跟 Monte Carlo 差 2% 內：HP $hp", ({ hp, normal, crit, rate, hits }) => {
    const exact = killStats(hp, normal, crit, rate, hits);
    const sim = simulate(hp, normal, crit, rate, hits, 200_000);
    expect(relative(exact.avg, sim.avg)).toBeLessThan(0.02);
    expect(Math.abs(exact.oneShot - sim.oneShot)).toBeLessThan(0.02);
  });
});

/** 五篇的計算表：每職業中段等級、表上那把武器，每隻怪拿計算機同一套算的範圍來模擬 */
const JOBS = [110, 230, 310, 410, 420];
/** 刺客、俠盜文章的 statCap 敏捷停 60，表上那把（照預設配點挑的）穿不上：改用文章實際寫的那把 */
const WEARABLE: Record<number, number> = { 410: 1472009, 420: 1332012 };

describe("真資料：範圍、爆擊跟計算機同一套", () => {
  it.each(JOBS)("%i 計算表每隻怪：平均下數跟 Monte Carlo 差 2% 內", job => {
    const article = loadArticle(job);
    const table = buildCalcTable({ job, from: 31, to: 50, data, gear: article.gear, statCap: article.statCap });
    expect(table.rows.length).toBeGreaterThan(0);
    for (const row of table.rows) {
      const stats = articleKillStats({ mobId: row.id, level: table.midLevel, weaponId: WEARABLE[job] ?? table.assumptions.weapon!.id, table, data });
      if (!article.statCap) expect(stats.avg, `${job} ${row.name} 跟表同一個數字`).toBeCloseTo(row.avg!, 8);
      const sim = simulate(row.hp, stats.hit, stats.crit, stats.critRate, stats.hits, 40_000);
      expect(relative(stats.avg, sim.avg), `${job} ${row.name}`).toBeLessThan(0.02);
      expect(Math.abs(stats.oneShot - sim.oneShot), `${job} ${row.name}`).toBeLessThan(0.02);
    }
  });

  it("範圍、爆擊率、出手時間就是 computeGroup 算的", () => {
    const table = buildCalcTable({ job: 310, from: 31, to: 50, data });
    const level = 44;
    const weaponId = 1452005;
    const monster = data.monsters.find(entry => entry.id === 3210800)!;
    const stats = articleKillStats({ mobId: monster.id, level, weaponId, table, data });
    const state = defaultState(data, 310, level, null);
    const group = { ...state.groups[0], weaponId, weaponAtk: null };
    const skill = { skillId: stats.skillId, skillLevel: stats.skillLevel };
    const result = computeGroup(data, { job: 310, ...skill, monsterId: monster.id }, group, monster);
    if (!result.ok || !result.vs) throw new Error("算不出來");
    expect(stats.hit).toEqual(result.vs.hit);
    expect(stats.crit).toEqual(result.vs.crit?.hit ?? null);
    expect(stats.critRate).toBe(result.critRate ?? 0);
    expect(stats.hits).toBe(result.hits);
    expect(stats.ms).toBe(result.speed?.ms);
    // 平均不會低於進位前的 HP÷一次期望；計算機畫面寫的是這個進位
    expect(stats.avg).toBeGreaterThanOrEqual(monster.hp / result.expectedUse);
    expect(result.vs.kills.avg).toBe(Math.ceil(monster.hp / result.expectedUse));
  });

  it("打死一隻的時間＝平均下數×出手時間；10 分鐘經驗＝600 秒÷打死一隻×每隻經驗", () => {
    const table = buildCalcTable({ job: 310, from: 31, to: 50, data });
    const monster = data.monsters.find(entry => entry.id === 3210800)!;
    const stats = articleKillStats({ mobId: monster.id, level: 44, weaponId: 1452005, table, data });
    expect(stats.killMs).toBeCloseTo(stats.avg * stats.ms!, 8);
    expect(stats.xp10).toBeCloseTo((600_000 / stats.killMs!) * monster.exp, 6);
  });
});

describe("新代號", () => {
  const table = buildCalcTable({ job: 310, from: 31, to: 50, data });
  const cleric = buildCalcTable({ job: 230, from: 31, to: 50, data });
  const fill = (text: string) => fillTokens(text, table, data);

  it("avg 一位小數、oneShot 整數百分比、killTime 兩位小數、xp10 約幾萬", () => {
    expect(fill("{{avg:3210800@44#1452005}}")).toMatch(/^\d+\.\d$/);
    expect(fill("{{oneShot:3210800@44#1452005}}")).toMatch(/^\d{1,3}%$/);
    expect(fill("{{killTime:3210800@44#1452005}}")).toMatch(/^\d+\.\d\d$/);
    expect(fill("{{xp10:3210800@44#1452005}}")).toMatch(/^約 \d+\.\d 萬$/);
  });

  it("數字跟 articleKillStats 一樣", () => {
    const stats = articleKillStats({ mobId: 3210800, level: 44, weaponId: 1452005, table, data });
    expect(fill("{{avg:3210800@44#1452005}}")).toBe(avgText(stats.avg));
    expect(Number(fill("{{killTime:3210800@44#1452005}}"))).toBeCloseTo(stats.killMs! / 1000, 2);
    expect(fill("{{oneShot:3210800@44#1452005}}")).toBe(`${oneShotPercent(stats.oneShot)}%`);
  });

  it("xp10 的寫法：不到一萬寫到百位，不寫「0.8 萬」", () => {
    expect(xp10Text(31000)).toBe("約 3.1 萬");
    expect(xp10Text(8640)).toBe("約 8,600");
    expect(xp10Text(99990)).toBe("約 10.0 萬");
  });

  it("oneShot：沒到 100% 不准寫 100%，有機會也不准寫 0%", () => {
    expect(oneShotPercent(1)).toBe(100);
    expect(oneShotPercent(0.998)).toBe(99);
    expect(oneShotPercent(0)).toBe(0);
    expect(oneShotPercent(0.002)).toBe(1);
    expect(oneShotPercent(0.784)).toBe(78);
  });

  it.each([
    ["{{avg:3210800@44}}", "武器"],
    ["{{avg:3210800}}", "@等級#武器id"],
    ["{{oneShot:3210800}}", "@等級#武器id"],
    ["{{killTime:3210800@44}}", "武器"],
    ["{{xp10:3210800}}", "@等級#武器id"],
    ["{{avg:3210800@60#1452005}}", "範圍"],
    ["{{avg:3210800@44#1452005*2}}", "群體治癒"],
    ["{{avg:999@44#1452005}}", "怪"],
    ["{{avg:3210800@31#1452007}}", "拿不到"],
  ])("%s 擋掉", (text, message) => {
    expect(() => fill(text)).toThrow(message);
  });

  it("僧侶群體治癒：不寫隻數照表的 3 隻，*1 是打 1 隻，隻數要 1～5", () => {
    const mob = cleric.rows[0].id;
    const weapon = cleric.assumptions.weapon!.id;
    const level = cleric.midLevel;
    const at = (targets?: number) => articleKillStats({ mobId: mob, level, weaponId: weapon, targets, table: cleric, data });
    expect(at().targets).toBe(3);
    expect(at(1).targets).toBe(1);
    expect(at(1).skillId).toBe(HEAL);
    expect(at(1).avg).toBeLessThan(at(5).avg);
    expect(fillTokens(`{{avg:${mob}@${level}#${weapon}}}`, cleric, data)).toBe(avgText(at(3).avg));
    expect(fillTokens(`{{avg:${mob}@${level}#${weapon}*1}}`, cleric, data)).toBe(avgText(at(1).avg));
    expect(() => fillTokens(`{{avg:${mob}@${level}#${weapon}*6}}`, cleric, data)).toThrow("1～5");
    expect(() => fillTokens(`{{avg:${mob}@${level}#${weapon}*0}}`, cleric, data)).toThrow("1～5");
  });

  it("僧侶 10 分鐘經驗：範圍內每一隻都算（跟計算機同一條）", () => {
    const mob = cleric.rows[0];
    const stats = (targets: number) => articleKillStats({ mobId: mob.id, level: cleric.midLevel, weaponId: cleric.assumptions.weapon!.id, targets, table: cleric, data });
    expect(stats(3).xp10).toBeCloseTo((600_000 / stats(3).killMs!) * mob.exp * 3, 6);
    expect(stats(1).xp10).toBeCloseTo((600_000 / stats(1).killMs!) * mob.exp, 6);
  });

  it("進 assumes.pinned，存的是畫面上的值", () => {
    const article = { intro: "{{avg:3210800@44#1452005}}、{{oneShot:3210800@44#1452005}}、{{killTime:3210800@44#1452005}}、{{xp10:3210800@44#1452005}}", assumes: {} };
    const { pinned } = articleAssumes(article, table, data);
    expect(pinned!["avg:3210800@44#1452005"]!.toFixed(1)).toBe(fill("{{avg:3210800@44#1452005}}"));
    expect(`${pinned!["oneShot:3210800@44#1452005"]}%`).toBe(fill("{{oneShot:3210800@44#1452005}}"));
    expect(pinned!["killTime:3210800@44#1452005"]!.toFixed(2)).toBe(fill("{{killTime:3210800@44#1452005}}"));
    expect(xp10Text(pinned!["xp10:3210800@44#1452005"]!)).toBe(fill("{{xp10:3210800@44#1452005}}"));
  });

  it("assumes.relies 也認得新代號", () => {
    const article = { ...loadArticle(310), assumes: { ...articleAssumes(loadArticle(310), table, data), relies: { "avg:3210800@44#1452005": 99 } } };
    const errors = validateArticle(article, { job: 310, from: 31, to: 50, data, openMaps: staticOpenMaps() });
    expect(errors.some(error => error.includes("assumes.relies") && error.includes("avg:3210800@44#1452005") && error.includes("99"))).toBe(true);
    expect(errors.some(error => error.includes("認不得"))).toBe(false);
  });
});

describe("計算表", () => {
  it("每隻怪有平均下數；僧侶兩欄都有", () => {
    const hunter = buildCalcTable({ job: 310, from: 31, to: 50, data });
    for (const row of hunter.rows) {
      expect(row.avg).toBeGreaterThanOrEqual(1);
      expect(row.avgOne).toBeNull();
    }
    const cleric = buildCalcTable({ job: 230, from: 31, to: 50, data });
    for (const row of cleric.rows) {
      expect(row.avg).toBeGreaterThanOrEqual(1);
      expect(row.avgOne).toBeGreaterThanOrEqual(1);
      expect(row.avgOne!).toBeLessThanOrEqual(row.avg!);
    }
  });

  it("avgText 一位小數；算不出來寫算不出來", () => {
    expect(avgText(1.45)).toBe("1.5");
    expect(avgText(2)).toBe("2.0");
    expect(avgText(null)).toBe("算不出來");
  });

  it("假設行寫明是平均值、計算機會進位", () => {
    const table = buildCalcTable({ job: 310, from: 31, to: 50, data });
    expect(assumptionLines(table).join("\n")).toContain("平均值；計算機畫面會進位成整數");
  });

  it("畫面的表印平均一位小數，不寫「約 N」；僧侶兩欄都是", () => {
    for (const job of [310, 230]) {
      const article = loadArticle(job);
      const table = buildCalcTable({ job, from: 31, to: 50, data, gear: article.gear, statCap: article.statCap });
      const html = renderToString(JobArticleTable({ table })).replace(/<!-- -->/g, "");
      for (const row of table.rows) expect(html).toContain(`>${avgText(row.avg)}</td>`);
      if (job === 230) for (const row of table.rows) expect(html).toContain(`>${avgText(row.avgOne)}</td>`);
      expect(html).not.toMatch(/>約 \d+<\/td>/);
    }
  });

  it("article:show 的表印一位小數，還列新代號可以怎麼寫", () => {
    const article = loadArticle(310);
    const text = articleShowText({ job: 310, from: 31, to: 50, article, data, openMaps: staticOpenMaps() });
    const table = buildCalcTable({ job: 310, from: 31, to: 50, data, gear: article.gear, statCap: article.statCap });
    const row = table.rows[0];
    expect(text).toContain(`${row.name} | ${avgText(row.avg)} |`);
    const weapon = table.assumptions.weapon!.id;
    expect(text).toContain(`{{avg:${row.id}@${table.midLevel}#${weapon}}}`);
    expect(text).toContain(`{{xp10:${row.id}@${table.midLevel}#${weapon}}}`);
  });

  it("article:show：刺客 statCap 的表算得出來，沒有代號報錯", () => {
    const article = loadArticle(410);
    const text = articleShowText({ job: 410, from: 31, to: 50, article, data, openMaps: staticOpenMaps() });
    expect(text).not.toContain("算不出來（代號");
  });

  it("article:show 僧侶兩欄都印平均", () => {
    const article = loadArticle(230);
    const text = articleShowText({ job: 230, from: 31, to: 50, article, data, openMaps: staticOpenMaps() });
    const table = buildCalcTable({ job: 230, from: 31, to: 50, data, gear: article.gear, statCap: article.statCap });
    const row = table.rows[0];
    expect(text).toContain(`${row.name} | ${avgText(row.avgOne)} | ${row.avgs.map(avgText).join(" | ")} |`);
  });
});

describe("比較句防呆", () => {
  const problems = (text: string) => hitComparisonProblems([{ where: "intro", text }]);

  it("比較字眼＋兩個 hits 代號：擋，叫寫手改 avg 或 killTime", () => {
    const found = problems("戰鬥弓 {{hits:1@37#2}} 下，火焰之弓也 {{hits:1@37#3}} 下，一樣快。");
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("{{avg}}");
    expect(found[0]).toContain("{{killTime}}");
  });

  it("hitsOne 也算，表上的 hits 也算", () => {
    expect(problems("打 1 隻 {{hitsOne:1}} 下，3 隻 {{hits:1}} 下，差不多。")).toHaveLength(1);
  });

  it("只有一個代號、弱的比較字不擋（沒在比）", () => {
    expect(problems("這隻 {{hits:1@37#2}} 下，比較快。")).toEqual([]);
    expect(problems("37 等多半 {{hits:1@37#2}} 下，三成要補第二下，每隻經驗更多。")).toEqual([]);
  });

  it.each(["打黑肥肥跟那把一樣 {{hits:1@37#2}} 下。", "單練 {{hits:1@50#2}} 下，經驗還輸殭屍菇菇。", "{{hits:1@44#2}} 下，比那把省 10 萬。"])("一個代號＋一看就是在比的字也擋：%s", text => {
    expect(problems(text)).toHaveLength(1);
  });

  it("不在同一句不算", () => {
    expect(problems("這隻 {{hits:1@37#2}} 下。那隻 {{hits:2@37#2}} 下。這把比較快。")).toEqual([]);
  });

  it("沒有比較字眼不擋", () => {
    expect(problems("37 等打這隻 {{hits:1@37#2}} 下，40 等打那隻 {{hits:2@40#2}} 下。")).toEqual([]);
  });

  it.each(["這把 2 下，那把 3 下，少一下。", "火焰之弓一下死，跟戰鬥弓一樣。", "暴風弓只要兩下，快很多。", "贏在 3 下打完。", "少數怪差 1 下。", "換了這把少一下。"])("寫死的下數在比較句擋：%s", text => {
    expect(problems(text)).toHaveLength(1);
  });

  it.each(["這隻要看一下位置，多走兩張圖。", "下面那層怪比較多。", "往下走比較快。", "至少練到 40 等。", "每下多 5 點。", "35 等大多一下死。", "回報傷害夠（2～3 下）10 分鐘經驗比較多。", "四成要補第二下，經驗更多。"])("不是下數的「下」不擋：%s", text => {
    expect(problems(text)).toEqual([]);
  });

  it("改用 avg、killTime 的比較句放行", () => {
    expect(problems("戰鬥弓平均 {{avg:1@37#2}} 下，火焰之弓 {{avg:1@37#3}} 下，打死一隻少 {{killTime:1@37#2}} 秒。")).toEqual([]);
  });

  it("validateArticle 擋得到，來源標題不管", () => {
    const article = loadArticle(310);
    const bad = { ...article, intro: "這把 {{hits:2230102@37#1452000}} 下，那把 {{hits:2230102@37#1452006}} 下，一樣。" };
    const errors = validateArticle(bad, { job: 310, from: 31, to: 50, data, openMaps: staticOpenMaps() });
    expect(errors.some(error => error.startsWith("intro：") && error.includes("{{avg}}"))).toBe(true);
    const label = { ...article, sources: [{ ...article.sources[0], label: "這把 2 下那把 3 下，一樣" }, ...article.sources.slice(1)] };
    const labelErrors = validateArticle(label, { job: 310, from: 31, to: 50, data, openMaps: staticOpenMaps() });
    expect(labelErrors.some(error => error.startsWith("sources"))).toBe(false);
  });
});
