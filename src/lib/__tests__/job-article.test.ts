/**
 * 職業×等級範圍攻略文（v1.43）：範圍、門檻、計算表、文字代號、防呆、頁面。真資料跑。
 * 規格 docs/superpowers/specs/2026-11-04-job-articles-design.md（使用者拍板 1A 2A 3A 4A）。
 * 最後一段掃 src/data/job-articles/ 全部真檔，文章寫錯這裡會紅。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HEAL } from "@/lib/damage-skills";
import { findRoute, suggestStart } from "@/lib/route";
import { BOSS_SPAWN_MAX } from "@/lib/now-plan";
import { JobArticleTable, JobArticleView } from "@/components/JobArticleView";
import { applyDamageLink, computeGroup, damageLinkHref, defaultState, HEAL_ASSUMPTION, linkStartLevel, parseDamageLink, parseState, type CalcData } from "@/lib/damage-view";
import type { GearData } from "@/lib/gear";
import {
  ANSWER_MAX,
  PQ_ENTRANCES,
  articleDamageHref,
  articleAssumes,
  articleShowText,
  articleEligible,
  articleGuides,
  articleHeroPath,
  articleImageProblems,
  articleImages,
  articlePath,
  articleRanges,
  articleSlug,
  JOB_SLUGS,
  stepImageAlt,
  assumptionLines,
  buildCalcTable,
  featuredMonsters,
  characterAccuracy,
  fillTokens,
  hitLvText,
  parseArticleFile,
  resolveArticle,
  splitArticles,
  TAG_LABEL,
  tableAssumes,
  validateArticle,
  writerBrief,
  type ArticleImageManifest,
  type JobArticle,
} from "@/lib/job-article";
import { undeadOnlyStage } from "@/lib/job-rules";
import { JOB_OPTIONS } from "@/lib/jobs";
import { articleLd, SITE_ROBOTS } from "@/lib/seo";
import type { GuideCommon, GuideJob, MapRecord, Meta, Monster, PortalEdge, Skill, TrainingRow } from "@/lib/types";

// 頁面、網站地圖、llms.txt 讀的文章清單換成這裡的假資料；掃真檔那段用 importActual
const mockArticles = vi.hoisted(() => ({
  keys: [] as Array<{ job: number; from: number; to: number }>,
  article: undefined as unknown,
  images: {} as Record<string, unknown>,
}));
vi.mock("@/lib/static-data", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/static-data")>()),
  staticJobArticleKeys: () => mockArticles.keys,
  staticJobArticleRanges: (job: number) => mockArticles.keys.filter(key => key.job === job),
  staticJobArticle: () => mockArticles.article,
  staticArticleImages: () => mockArticles.images,
}));

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const DATA = `${ROOT}public/data/`;
const read = <T>(file: string) => JSON.parse(fs.readFileSync(`${DATA}${file}`, "utf8")) as T;
const guides: Record<number, GuideJob | undefined> = {};
for (const file of fs.readdirSync(`${DATA}guides`)) {
  const code = Number(file.replace(".json", ""));
  if (Number.isFinite(code)) guides[code] = read<GuideJob>(`guides/${file}`);
}
const data: CalcData = {
  gear: read<GearData>("gear.json"),
  skills: new Map(read<Skill[]>("skills.json").map(skill => [skill.id, skill])),
  guides,
  monsters: read<Monster[]>("monsters.json"),
  maps: read<Record<string, MapRecord>>("maps.json"),
  training: read<TrainingRow[]>("training.json"),
  expToNext: read<GuideCommon>("guides/common.json").expTable.toNext,
};
const openMaps = new Set(read<{ maps: number[] }>("atlas-index.json").maps);
const byName = (name: string) => data.monsters.find(monster => monster.n === name)!;
const ALL_JOBS = Object.keys(guides).map(Number).sort((a, b) => a - b);
/** 現在過門檻的每一個範圍（之後 30 篇都在裡面）：不寫死幾篇，資料更新會變 */
const ELIGIBLE = ALL_JOBS.flatMap(job => articleRanges(job).map(range => ({ job, ...range }))).filter(range => articleEligible(range.job, range.from, range.to, guides));

/** 只有 train 不同的假攻略 */
const fakeGuide = (job: number, train: Array<Partial<GuideJob["train"][number]>>): GuideJob => ({
  job,
  name: String(job),
  stat: [],
  builds: [],
  notes: [],
  gaps: [],
  notOpenYet: [],
  train: train.map(row => ({ from: 31, to: 50, kind: "solo", map: 1, name: "圖", mobs: [], why: "", v: "tw", s: [], ...row })),
});

describe("範圍：照轉職切（拍板 1A）", () => {
  it("一轉 10～30；二轉 31～50、51～70；三轉 71～90、91～120", () => {
    expect(articleRanges(200)).toEqual([{ from: 10, to: 30 }]);
    expect(articleRanges(230)).toEqual([{ from: 31, to: 50 }, { from: 51, to: 70 }]);
    expect(articleRanges(231)).toEqual([{ from: 71, to: 90 }, { from: 91, to: 120 }]);
    expect(articleRanges(0)).toEqual([]);
    expect(articleRanges(1110)).toEqual([]);
  });
  it("網址跟檔名：/guides/priest-31-50、230-31-50.json", () => {
    expect(articlePath(230, 31, 50)).toBe("/guides/priest-31-50");
    expect(articleSlug(230, 31, 50)).toBe("priest-31-50");
    expect(parseArticleFile("230-31-50.json")).toEqual({ job: 230, from: 31, to: 50 });
    expect(parseArticleFile("readme.md")).toBeNull();
    expect(parseArticleFile("230-31.json")).toBeNull();
  });
  it("三轉把接它的二轉攻略也算；二轉、一轉只算自己", () => {
    expect(articleGuides(231, guides).map(guide => guide.job)).toEqual([231, 230]);
    expect(articleGuides(230, guides).map(guide => guide.job)).toEqual([230]);
    expect(articleGuides(200, guides).map(guide => guide.job)).toEqual([200]);
  });
});

describe("門檻（拍板 2A）：至少 2 張不同地圖、不是舊版來源、有地圖", () => {
  it("真資料：二轉、三轉都有範圍過門檻（篇數不寫死，資料更新會變）", () => {
    expect(ELIGIBLE.length).toBeGreaterThan(0);
    for (const job of [230, 231]) expect(ELIGIBLE.some(range => range.job === job), String(job)).toBe(true);
  });
  it("不是拍板的範圍不過", () => {
    expect(articleEligible(230, 40, 60, guides)).toBe(false);
    expect(articleEligible(231, 31, 50, guides)).toBe(false);
  });
  it("legacy、沒地圖、範圍外、同一張圖都不算", () => {
    const check = (train: Array<Partial<GuideJob["train"][number]>>) => articleEligible(110, 31, 50, { 110: fakeGuide(110, train) });
    expect(check([{ map: 1 }, { map: 2 }])).toBe(true);
    expect(check([{ map: 1 }, { map: 2, v: "legacy" }])).toBe(false);
    expect(check([{ map: 1 }, { map: null }])).toBe(false);
    expect(check([{ map: 1 }, { map: 2, from: 51, to: 70 }])).toBe(false);
    expect(check([{ map: 1 }, { map: 1, kind: "party" }])).toBe(false);
    // 邊界：剛好碰到範圍的算
    expect(check([{ map: 1 }, { map: 2, from: 25, to: 31 }])).toBe(true);
    expect(check([{ map: 1 }, { map: 2, from: 50, to: 60 }])).toBe(true);
  });
  it("三轉含二轉：自己只有 1 張圖，加上二轉那張才過；二轉不會反過來算三轉的", () => {
    const fake = { 110: fakeGuide(110, [{ from: 71, to: 90, map: 2 }]), 111: fakeGuide(111, [{ from: 71, to: 90, map: 1 }]) };
    expect(articleEligible(111, 71, 90, fake)).toBe(true);
    expect(articleEligible(111, 71, 90, { 110: fakeGuide(110, []), 111: fake[111] })).toBe(false);
  });
});

describe("預設角色的命中", () => {
  const groupWith = (job: number, level: number, stats: { STR: number; DEX: number; INT: number; LUK: number }) => ({
    ...defaultState(data, job, level, null).groups[0],
    stats,
  });
  it("魔法命中＝智力÷10＋幸運÷10，各自捨去（智力 230、幸運 30 → 26，樣稿的算例）", () => {
    expect(characterAccuracy(data, 230, groupWith(230, 46, { STR: 4, DEX: 4, INT: 230, LUK: 30 })).value).toBe(26);
    expect(characterAccuracy(data, 230, groupWith(230, 46, { STR: 4, DEX: 4, INT: 239, LUK: 39 })).value).toBe(26);
    expect(characterAccuracy(data, 230, groupWith(230, 46, { STR: 4, DEX: 4, INT: 230, LUK: 30 })).kind).toBe("magic");
  });
  it("物理命中＝敏捷×0.8＋幸運×0.5＋被動技能（裝備的命中不算）", () => {
    const group = groupWith(110, 40, { STR: 100, DEX: 60, INT: 4, LUK: 10 });
    // 精準之劍／之斧 x 是命中：照技能點法在這一級點到幾級查
    const swordRow = (id: number) => {
      const skill = data.skills.get(id)!;
      const level = group.levels[id] ?? 0;
      return level > 0 ? skill.levels![Math.min(level, skill.levels!.length) - 1].x ?? 0 : 0;
    };
    const weapon = data.gear.weapons.find(entry => entry.id === group.weaponId)!;
    const passive = /斧/.test(weapon.s) ? swordRow(1100001) : swordRow(1100000);
    const result = characterAccuracy(data, 110, group);
    expect(result.kind).toBe("physical");
    expect(result.value).toBe(Math.floor(60 * 0.8 + 10 * 0.5 + passive));
  });
  it("精準強化、幻化術這種一轉被動也算", () => {
    const stats = { STR: 4, DEX: 100, INT: 4, LUK: 4 };
    const group = { ...groupWith(300, 20, stats), levels: { 3000000: 16 } };
    expect(characterAccuracy(data, 300, group).value).toBe(Math.floor(100 * 0.8 + 4 * 0.5 + 16));
  });
});

describe("計算表", () => {
  const cleric = buildCalcTable({ job: 230, from: 31, to: 50, data });

  it("用範圍中段的等級算：31～50 是 40、91～120 是 105", () => {
    expect(cleric.midLevel).toBe(40);
    expect(buildCalcTable({ job: 231, from: 91, to: 120, data }).midLevel).toBe(105);
  });

  it("僧侶：群體治癒、範圍 3 隻、只列不死系、看魔防", () => {
    expect(cleric.assumptions.skill.id).toBe(HEAL);
    expect(cleric.assumptions.targets).toBe(3);
    expect(cleric.assumptions.accuracy.kind).toBe("magic");
    expect(cleric.rows.length).toBeGreaterThan(0);
    for (const row of cleric.rows) {
      const monster = data.monsters.find(entry => entry.id === row.id)!;
      expect(monster.und, row.name).toBe(1);
      expect(row.def).toBe(monster.mdd);
    }
    // 黑肥肥（不死系以外）在 31～50 的攻略裡有，但治癒打不到，不列
    expect(cleric.rows.some(row => row.name === "黑肥肥")).toBe(false);
    expect(cleric.rows.some(row => row.name === "殭屍菇菇")).toBe(true);
    expect(cleric.rows.some(row => row.name === "天使猴")).toBe(true);
  });

  it("每隻怪去重、照等級低到高，數值對得上怪物資料", () => {
    const ids = cleric.rows.map(row => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    const levels = cleric.rows.map(row => row.lv ?? 0);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    const ghost = cleric.rows.find(row => row.name === "天使猴")!;
    const monster = byName("天使猴");
    expect(ghost).toMatchObject({ id: monster.id, lv: monster.lv, hp: monster.hp, exp: monster.exp });
  });

  it("地圖是 null 的列不算：女神組隊任務的怪不會跑進來", () => {
    const fake = { ...guides, 230: fakeGuide(230, [{ from: 31, to: 50, map: null, mobs: [byName("殭屍菇菇").id] }, { from: 31, to: 50, map: 105050000, mobs: [byName("小幽靈").id] }]) };
    const table = buildCalcTable({ job: 230, from: 31, to: 50, data: { ...data, guides: fake } });
    expect(table.rows.map(row => row.name)).toEqual(["小幽靈"]);
  });

  it("打死幾下跟傷害計算機同一套：直接呼叫 computeGroup 對答案（僧侶兩種隻數）", () => {
    const group = defaultState(data, 230, 40, null).groups[0];
    const skillLevel = group.levels[HEAL];
    expect(skillLevel).toBeGreaterThan(0);
    for (const row of cleric.rows) {
      const monster = data.monsters.find(entry => entry.id === row.id)!;
      const three = computeGroup(data, { job: 230, skillId: HEAL, skillLevel, monsterId: monster.id, targets: 3 }, group, monster);
      const one = computeGroup(data, { job: 230, skillId: HEAL, skillLevel, monsterId: monster.id, targets: 1 }, group, monster);
      expect(three.ok && three.vs?.kills.avg, row.name).toBe(row.hits);
      expect(one.ok && one.vs?.kills.avg, row.name).toBe(row.hitsOne);
    }
    // 範圍打越多隻，每隻分到越少
    const big = cleric.rows.find(row => row.hp > 1000)!;
    expect(big.hits!).toBeGreaterThanOrEqual(big.hitsOne!);
  });

  it("刺客 40：群體技能還沒有就用單體那招（雙飛斬），物防、物理命中、只有一欄下數", () => {
    const table = buildCalcTable({ job: 410, from: 31, to: 50, data });
    expect(table.assumptions.skill.name).toBe("雙飛斬");
    expect(table.assumptions.targets).toBeNull();
    expect(table.assumptions.accuracy.kind).toBe("physical");
    const row = table.rows.find(entry => entry.name === "天使猴")!;
    const monster = byName("天使猴");
    const group = defaultState(data, 410, 40, null).groups[0];
    const result = computeGroup(data, { job: 410, skillId: table.assumptions.skill.id, skillLevel: table.assumptions.skill.level, monsterId: monster.id }, group, monster);
    expect(result.ok && result.vs?.kills.avg).toBe(row.hits);
    expect(row.hitsOne).toBeNull();
    expect(row.def).toBe(monster.pdd);
  });

  it("招式跟傷害計算機的預設同一招：按表下面的連結看到的是同一個數字；僧侶 31～70 例外固定群體治癒", () => {
    for (const { job, from, to } of ELIGIBLE) {
      const table = buildCalcTable({ job, from, to, data });
      const state = defaultState(data, job, table.midLevel, null);
      const label = `${job}-${from}-${to}`;
      if (undeadOnlyStage(job, table.midLevel) && (state.groups[0].levels[HEAL] ?? 0) > 0) {
        expect(table.assumptions.skill.id, label).toBe(HEAL);
        expect(table.assumptions.targets, label).toBe(3);
        for (const row of table.rows) expect(data.monsters.find(entry => entry.id === row.id)!.und, row.name).toBe(1);
      } else {
        expect(table.assumptions.skill, label).toMatchObject({ id: state.shared.skillId, level: state.shared.skillLevel });
        expect(table.assumptions.targets, label).toBeNull();
      }
    }
    expect(buildCalcTable({ job: 310, from: 31, to: 50, data }).assumptions.skill.name).toBe("二連箭");
    expect(buildCalcTable({ job: 110, from: 31, to: 50, data }).assumptions.skill.name).toBe("魔天一擊");
  }, 120_000);

  it("王級怪不列：整張圖最多 3 隻、或地圖上沒有刷怪資料的，不是練功目標", () => {
    for (const { job, from, to } of ELIGIBLE) {
      for (const row of buildCalcTable({ job, from, to, data }).rows) {
        const monster = data.monsters.find(entry => entry.id === row.id)!;
        expect(monster.sp?.length, `${job} ${row.name} 沒有刷怪資料`).toBeGreaterThan(0);
        expect(Math.max(...monster.sp!.map(([, count]) => count)), `${job} ${row.name}`).toBeGreaterThan(BOSS_SPAWN_MAX);
      }
    }
    const names = (job: number) => buildCalcTable({ job, from: 10, to: 30, data }).rows.map(row => row.name);
    expect(names(400)).not.toContain("超級綠水靈");
    expect(names(500)).not.toContain("樹妖王");
  });

  /** 那一級的角色（武器固定用表的那把）打不打得中；每一個過門檻的範圍都驗，物理職業的命中被動會看武器 */
  const stateCache = new Map<string, ReturnType<typeof defaultState>>();
  const stateAt = (job: number, level: number) => {
    const key = `${job}-${level}`;
    if (!stateCache.has(key)) stateCache.set(key, defaultState(data, job, level, null));
    return stateCache.get(key)!;
  };
  const hitAt = (table: ReturnType<typeof buildCalcTable>, monster: Monster, level: number) => {
    const { job, assumptions } = table;
    const group = { ...stateAt(job, level).groups[0], weaponId: assumptions.weapon!.id };
    const result = computeGroup(data, { job, skillId: assumptions.skill.id, skillLevel: assumptions.skill.level, monsterId: monster.id, ...(assumptions.targets ? { targets: assumptions.targets } : {}) }, group, monster);
    return { have: characterAccuracy(data, job, group).value, need: result.ok && result.vs ? result.vs.accuracy : Infinity };
  };

  it("幾等不 MISS：從那一級到範圍結束每一級都打得中，前一級打不中；寫「超過」的是範圍最後一級還打不中", () => {
    for (const { job, from, to } of ELIGIBLE) {
      const table = buildCalcTable({ job, from, to, data });
      for (const row of table.rows) {
        const monster = data.monsters.find(entry => entry.id === row.id)!;
        const label = `${job}-${from}-${to} ${row.name}`;
        if (row.hitLv === null) {
          const last = hitAt(table, monster, to);
          expect(last.have, label).toBeLessThan(last.need);
          continue;
        }
        for (let level = row.hitLv; level <= to; level++) {
          const at = hitAt(table, monster, level);
          expect(at.have, `${label} Lv.${level}`).toBeGreaterThanOrEqual(at.need);
        }
        if (row.hitLv > from) {
          const before = hitAt(table, monster, row.hitLv - 1);
          expect(before.have, `${label} Lv.${row.hitLv - 1}`).toBeLessThan(before.need);
        }
      }
    }
    // 真的有差別：不是全部都一進範圍就中
    expect(new Set(cleric.rows.map(row => row.hitLv)).size).toBeGreaterThan(1);
  }, 120_000);

  it("幾等不 MISS 跟假設行對得上：狂戰士 40 拿斧頭命中 50，要 56、67 的怪在範圍內都打不中（預設武器中途換劍不算）", () => {
    const table = buildCalcTable({ job: 110, from: 31, to: 50, data });
    expect(table.assumptions.accuracy.value).toBe(50);
    expect(table.rows.find(row => row.name === "骷髏犬")!.hitLv).toBeNull();
    expect(table.rows.find(row => row.name === "冰獨眼獸")!.hitLv).toBeNull();
    expect(table.rows.find(row => row.name === "黑肥肥")!.hitLv).toBe(31);
  });

  it("畫面字：範圍內達不到寫「超過 N 等」", () => {
    const table = { ...cleric, rows: [{ ...cleric.rows[0], hitLv: null }, { ...cleric.rows[0], hitLv: 44 }] };
    expect(hitLvText(table.rows[0], table)).toBe("超過 50 等");
    expect(hitLvText(table.rows[1], table)).toBe("44");
  });

  it("假設照實回傳：等級、能力值、武器、技能跟等級都是預設角色的值", () => {
    const group = defaultState(data, 230, 40, null).groups[0];
    const { assumptions } = cleric;
    expect(assumptions.level).toBe(40);
    expect(assumptions.stats).toEqual(group.stats);
    expect(assumptions.weapon?.id).toBe(group.weaponId);
    expect(assumptions.weapon?.name).toBe(data.gear.weapons.find(entry => entry.id === group.weaponId)!.n);
    expect(assumptions.skill).toMatchObject({ id: HEAL, name: "群體治癒", level: group.levels[HEAL] });
    const lines = assumptionLines(cleric).join("\n");
    expect(lines).toContain(`智力 ${group.stats.INT}`);
    expect(lines).toContain(assumptions.weapon!.name);
    expect(lines).toContain(`群體治癒 ${group.levels[HEAL]} 級`);
    expect(lines).toContain("3 隻");
    expect(lines).toContain("裝備");
  });

  it("傷害計算機對這一招的提醒照原文列進假設：群體治癒的公式說明", () => {
    expect(assumptionLines(cleric).join()).toContain(HEAL_ASSUMPTION);
    const hunter = buildCalcTable({ job: 310, from: 31, to: 50, data });
    const group = defaultState(data, 310, 40, null).groups[0];
    const direct = computeGroup(data, { job: 310, skillId: hunter.assumptions.skill.id, skillLevel: hunter.assumptions.skill.level, monsterId: null }, group, null);
    if (!direct.ok) throw new Error(direct.reason);
    expect(hunter.assumptions.notes).toEqual([...direct.warnings, ...direct.notes]);
  });

  it("命中那行：法師也寫裝備沒算（裝備上的智力、幸運也算魔法命中）", () => {
    const line = assumptionLines(cleric).find(entry => entry.startsWith("命中"))!;
    expect(line).toContain("裝備");
    expect(line).toContain("更早打得中");
  });

  it("全部過門檻的範圍都算得出來：每一列都有下數、假設有武器（資料更新打壞這裡會紅）", () => {
    for (const job of ALL_JOBS) {
      for (const { from, to } of articleRanges(job)) {
        if (!articleEligible(job, from, to, guides)) continue;
        const table = buildCalcTable({ job, from, to, data });
        expect(table.assumptions.weapon, `${job}-${from}-${to}`).not.toBeNull();
        expect(table.rows.length, `${job}-${from}-${to}`).toBeGreaterThan(0);
        for (const row of table.rows) expect(row.hits, `${job}-${from}-${to} ${row.name}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("文字代號", () => {
  const table = buildCalcTable({ job: 230, from: 31, to: 50, data });
  const row = table.rows.find(entry => entry.name === "天使猴")!;

  it("{{hits:id}}、{{hitLv:id}} 換成算出來的數字", () => {
    expect(fillTokens(`打 {{hits:${row.id}}} 下，{{hitLv:${row.id}}} 等不 MISS`, table)).toBe(`打 ${row.hits} 下，${row.hitLv ?? "超過 50"} 等不 MISS`);
    expect(fillTokens("沒有代號", table)).toBe("沒有代號");
  });
  it("範圍內打不中換成「超過 N」，後面接「等」讀得通", () => {
    const missed = { ...table, rows: [{ ...row, hitLv: null }] };
    expect(fillTokens(`{{hitLv:${row.id}}} 等`, missed)).toBe("超過 50 等");
  });
  it("指到表裡沒有的怪、認不得的代號、缺數字都丟錯，不會留原文上線", () => {
    expect(() => fillTokens("{{hits:999}}", table)).toThrow(/999/);
    expect(() => fillTokens("{{exp:" + row.id + "}}", table)).toThrow(/代號/);
    expect(() => fillTokens("{{亂寫:" + row.id + "}}", table, data)).toThrow(/代號/);
    expect(() => fillTokens("{{hits}}", table)).toThrow(/代號/);
    const noHits = { ...table, rows: [{ ...row, hits: null }] };
    expect(() => fillTokens(`{{hits:${row.id}}}`, noHits)).toThrow(/代號/);
    // 黑肥肥在攻略裡，但不在僧侶的表（不是不死系）
    expect(() => fillTokens(`{{hits:${byName("黑肥肥").id}}}`, table)).toThrow(/黑肥肥|表/);
  });
  it("{{mob:名字}}、{{mobs:片段}} 換成字本身，{{def:id}} 換成表上的防禦", () => {
    expect(fillTokens("打{{mob:天使猴}}、{{mobs:獨角獅}}", table)).toBe("打天使猴、獨角獅");
    expect(fillTokens(`魔防 {{def:${row.id}}}`, table)).toBe(`魔防 ${row.def}`);
  });
  it("resolveArticle 把整篇每個字串都換掉", () => {
    const resolved = resolveArticle(validCleric(), table, data);
    expect(JSON.stringify(resolved)).not.toContain("{{");
    expect(resolved.answer[1].text).toContain(String(row.hits));
  });
});

/** 一篇合格的僧侶 31～50：全部欄位都用真資料填，每個防呆測試改壞一個地方 */
function validCleric(): JobArticle {
  const monkey = byName("天使猴").id;
  const zombie = byName("殭屍菇菇").id;
  return {
    title: "僧侶 31～50 等怎麼練",
    description: "僧侶 31 到 50 等先打{{mob:殭屍菇菇}}，再打{{mob:天使猴}}。",
    published: "2026-11-04",
    updated: "2026-11-04",
    persona: { name: "毒舌奶媽", line: "專講僧侶怎麼用治癒打不死系。" },
    heroAlt: "僧侶在{{map:105050000}}面對{{mob:殭屍菇菇}}",
    answer: [
      { text: `31～39 打{{mob:殭屍菇菇}}`, tag: "tw", from: 31, to: 39 },
      { text: `40～50 打{{mob:天使猴}} {{hits:${monkey}}} 下、{{hitLv:${monkey}}} 等不 MISS`, tag: "calc", from: 40, to: 50 },
    ],
    gear: [{ from: 31, to: 39, weapon: 1372005 }, { from: 40, to: 50, weapon: 1302016 }],
    intro: "僧侶這段靠群體治癒打不死系。",
    steps: [
      { from: 31, to: 39, kind: "party", map: 105050000, mobs: [zombie], title: "{{map:105050000}}：{{mob:殭屍菇菇}}", text: "魔防低。", tag: "tw" },
      { from: 40, to: 50, kind: "party", map: 107000403, mobs: [monkey], title: "{{map:107000403}}：{{mob:天使猴}}", text: "主線。", tag: "tw" },
    ],
    sections: [{ heading: "容易踩的坑", items: [{ text: "玩具城還沒開。", tag: "tw" }, { text: "治癒每級多 10%。", tag: "game" }], paragraphs: [{ text: "一段話。", tag: "official" }] }],
    sources: [
      { label: "僧侶實玩攻略", url: "https://forum.gamer.com.tw/C.php?bsn=85994&snA=1291" },
      { label: "官方公告", url: "https://maplestoryclassic-event.beanfun.com/EventAd/EventAd?eventAdId=20210" },
    ],
    assumes: tableAssumes(buildCalcTable({ job: 230, from: 31, to: 50, data })),
  };
}

describe("validateArticle：防呆每一條都擋得住", () => {
  const ctx = { job: 230, from: 31, to: 50, data, openMaps };
  const broken = (change: (article: JobArticle) => void, context = ctx) => {
    const article = validCleric();
    change(article);
    return validateArticle(article, context).join("\n");
  };

  it("合格的文章沒有錯", () => {
    expect(validateArticle(validCleric(), ctx)).toEqual([]);
  });
  it("欄位缺、型別錯不會丟例外，回錯誤", () => {
    expect(validateArticle(null, ctx).length).toBeGreaterThan(0);
    expect(validateArticle({ title: "只有標題" }, ctx).join()).toMatch(/steps|answer/);
    expect(broken(article => { (article as unknown as { steps: unknown }).steps = "不是陣列"; })).toMatch(/steps/);
    expect(broken(article => { article.steps[0].title = ""; })).toMatch(/title/);
  });
  it("地圖要有中文名", () => {
    expect(broken(article => { article.steps[0].map = 999999999; })).toMatch(/地圖.*中文名/);
  });
  it("怪要在怪物資料裡、至少一隻", () => {
    expect(broken(article => { article.steps[0].mobs = [999999999]; })).toMatch(/怪.*999999999/);
    expect(broken(article => { article.steps[0].mobs = []; })).toMatch(/mobs/);
  });
  it("地圖要出現在這個職業的攻略練功段；三轉算二轉的", () => {
    // 弓箭手村有中文名，但不是僧侶的練功圖
    expect(broken(article => { article.steps[0].map = 100000000; })).toMatch(/攻略/);
    const secondOnly = guides[230]!.train.find(row => row.map && !guides[231]!.train.some(other => other.map === row.map))!;
    const priest = (map: number) => {
      const article = validCleric();
      article.steps = [{ from: 71, to: 90, kind: "solo", map, mobs: [byName("大幽靈").id], title: "圖", text: "字", tag: "tw" }];
      article.answer = [{ text: "71～90 一", tag: "tw", from: 71, to: 90 }, { text: "二", tag: "tw" }];
      return validateArticle(article, { job: 231, from: 71, to: 90, data, openMaps }).join("\n");
    };
    expect(priest(secondOnly.map!)).not.toMatch(/攻略/);
  });
  it("已開放清單有這張圖就算開放，攻略舊資料的 notOpenYet 不再擋（有清單以清單為準）", () => {
    const stale = { ...guides, 230: { ...guides[230]!, notOpenYet: [{ from: 30, to: 40, place: "螞蟻洞Ⅰ 還沒開", s: [] }] } };
    const open = new Set(Object.keys(data.maps).map(Number));
    expect(broken(() => {}, { ...ctx, data: { ...data, guides: stale }, openMaps: open })).not.toMatch(/尚未開放/);
  });

  it("職業名裡有武器名不算打字寫武器（弩弓手、弩弓）", () => {
    const named = { ...ctx, data: { ...data, guides: { ...guides, 230: { ...guides[230]!, name: "弩弓手" } } } };
    expect(broken(article => { article.title = "弩弓手 31～50 等"; }, named)).not.toMatch(/武器名「弩弓」/);
    expect(broken(article => { article.title = "拿弩弓去練功"; }, named)).toMatch(/武器名「弩弓」/);
  });

  it("尚未開放不准當推薦：地圖不在已開放清單，或等級重疊的 notOpenYet 寫了這張圖", () => {
    expect(broken(article => { article.steps[0].map = 105050000; }, { ...ctx, openMaps: new Set([107000403]) })).toMatch(/尚未開放/);
    const stale = { ...guides, 230: { ...guides[230]!, notOpenYet: [{ from: 30, to: 40, place: "螞蟻洞Ⅰ 還沒開", s: [] }] } };
    const noList = { ...ctx, openMaps: undefined as unknown as Set<number> };
    expect(broken(() => {}, { ...noList, data: { ...data, guides: stale } })).toMatch(/尚未開放/);
    // 等級沒重疊不算（那段時間的事）
    const elsewhere = { ...guides, 230: { ...guides[230]!, notOpenYet: [{ from: 60, to: 70, place: "螞蟻洞Ⅰ 還沒開", s: [] }] } };
    expect(broken(() => {}, { ...ctx, data: { ...data, guides: elsewhere } })).not.toMatch(/尚未開放/);
  });
  it("出處網址要在攻略的來源裡，或是官方 beanfun.com；假冒網域擋掉", () => {
    expect(broken(article => { article.sources[0].url = "https://example.com/a"; })).toMatch(/出處/);
    expect(broken(article => { article.sources[0].url = "https://beanfun.com.example.com/a"; })).toMatch(/出處/);
    expect(broken(article => { article.sources[0].url = "不是網址"; })).toMatch(/出處/);
    expect(broken(article => { article.sources[0].url = "https://www.beanfun.com/a"; })).not.toMatch(/出處/);
    expect(broken(article => { article.sources[0].url = "https://beanfun.com/a"; })).not.toMatch(/出處/);
    expect(broken(article => { article.sources = []; })).toMatch(/sources/);
    // 別的職業攻略的來源不算
    const other = guides[110]!.train.flatMap(row => row.s).find(url => !JSON.stringify(guides[230]).includes(url))!;
    expect(broken(article => { article.sources[0].url = other; })).toMatch(/出處/);
  });
  it("三轉的出處可以用二轉攻略的", () => {
    const url = guides[230]!.train.flatMap(row => row.s).find(entry => !JSON.stringify(guides[231]).includes(entry))!;
    const article = validCleric();
    article.sources = [{ label: "二轉的來源", url }];
    expect(validateArticle(article, { job: 231, from: 71, to: 90, data, openMaps }).join()).not.toMatch(/出處/);
  });
  it("範圍要過門檻", () => {
    expect(broken(() => {}, { ...ctx, job: 210, from: 51, to: 70 })).toMatch(/門檻/);
  });
  it("標題不寫經典版（模板會補）", () => {
    expect(broken(article => { article.title = "楓之谷經典版僧侶攻略"; })).toMatch(/經典版/);
  });
  it("標題 23 字內（換完代號算）：Google 大約顯示 30 字，模板後面的「楓之谷經典版」才看得到", () => {
    expect(broken(article => { article.title = "字".repeat(24); })).toMatch(/title.*23/);
    expect(broken(article => { article.title = "字".repeat(23); })).not.toMatch(/title/);
  });
  it("文中提到的怪名要查得到：{{mob:}} 的名字要完全對、{{mobs:}} 要有怪的名字含這幾個字", () => {
    expect(broken(article => { article.intro = "打{{mob:天使猴猴}}"; })).toMatch(/intro.*天使猴猴/);
    expect(broken(article => { article.intro = "打{{mobs:妖魔}}"; })).toMatch(/intro.*妖魔/);
    expect(broken(article => { article.intro = "打{{mobs:獨角獅}}"; })).toEqual("");
    const gone = { ...ctx, data: { ...data, monsters: data.monsters.filter(monster => monster.n !== "天使猴") } };
    expect(broken(() => {}, gone)).toMatch(/天使猴/);
    // 標未開放的怪不算查得到
    const closed = { ...ctx, data: { ...data, monsters: data.monsters.map(monster => (monster.n === "殭屍菇菇" ? { ...monster, un: 1 as const } : monster)) } };
    expect(broken(() => {}, closed)).toMatch(/殭屍菇菇/);
  });
  it("怪名不准直接打字：要走 {{mob:}} 才查得到；地圖名裡的、來源標題不算", () => {
    expect(broken(article => { article.intro = "先打天使猴"; })).toMatch(/intro.*天使猴.*\{\{mob/);
    expect(broken(article => { article.steps[0].text = "殭屍菇菇魔防低"; })).toMatch(/steps\[0\].*殭屍菇菇/);
    // 只打一部分的名字（紅獨角獅打成獨角獅）也擋，要走 {{mobs:}}
    expect(broken(article => { article.intro = "48 等打獨角獅"; })).toMatch(/intro.*獨角獅/);
    // 地圖名裡的怪名不算：猴子森林不是在講猴子
    expect(broken(article => { article.intro = "去猴子森林、猴子沼澤地、鱷魚潭"; })).toEqual("");
    expect(broken(article => { article.sources[0].label = "玩家討論：天使猴"; })).toEqual("");
  });
  it("文字依賴的前提（assumes）要跟表對得上：武器、技能、命中變了就擋", () => {
    expect(broken(article => { delete (article as { assumes?: unknown }).assumes; })).toMatch(/assumes/);
    expect(broken(article => { article.assumes.weapon = 1; })).toMatch(/assumes.*武器/);
    expect(broken(article => { article.assumes.skillLevel = 1; })).toMatch(/assumes.*技能/);
    expect(broken(article => { article.assumes.accuracy = 1; })).toMatch(/assumes.*命中/);
    // 黃色雨傘從資料消失，表換武器：文字還寫黃色雨傘就要擋
    const noUmbrella = { ...data, gear: { ...data.gear, weapons: data.gear.weapons.filter(weapon => weapon.n !== "黃色雨傘") } };
    expect(broken(() => {}, { ...ctx, data: noUmbrella })).toMatch(/assumes.*武器/);
  });
  it("文字依賴的先後（幾等不 MISS、幾下打死）變了就擋；數字小動、先後沒變放行（代號會跟著變）", () => {
    // 骷髏犬迴避改 40：打不中了，「骷髏犬那一級以前不 MISS 的只有…」這種句子會變錯話
    const harder = { ...data, monsters: data.monsters.map(monster => (monster.n === "骷髏犬" ? { ...monster, eva: 40 } : monster)) };
    expect(broken(() => {}, { ...ctx, data: harder })).toMatch(/assumes.*骷髏犬/);
    const tougher = { ...data, monsters: data.monsters.map(monster => (monster.n === "殭屍菇菇" ? { ...monster, hp: monster.hp + 1 } : monster)) };
    expect(broken(() => {}, { ...ctx, data: tougher })).not.toMatch(/assumes/);
    // 表上多一隻、少一隻都要重看
    expect(broken(article => { const { [String(byName("天使猴").id)]: _drop, ...rest } = article.assumes.hitLv; article.assumes.hitLv = rest; })).toMatch(/assumes.*天使猴/);
  });
  it("描述 150 字內（換完代號算），答案 2～4 條", () => {
    expect(broken(article => { article.description = "字".repeat(151); })).toMatch(/150/);
    expect(broken(article => { article.description = "字".repeat(150); })).not.toMatch(/150/);
    expect(broken(article => { article.answer = article.answer.slice(0, 1); })).toMatch(/answer/);
    expect(broken(article => { article.answer = [...article.answer, ...article.answer, article.answer[0]]; })).toMatch(/answer/);
  });
  it("等級步驟要在文章範圍內、前小後大", () => {
    expect(broken(article => { article.steps[0].from = 30; })).toMatch(/範圍/);
    expect(broken(article => { article.steps[0].to = 51; })).toMatch(/範圍/);
    expect(broken(article => { article.steps[0].from = 45; })).toMatch(/範圍/);
  });
  it("來源等級只能是講好的那幾種；步驟不能標官方公告", () => {
    expect(broken(article => { (article.steps[0] as { tag: string }).tag = "official"; })).toMatch(/tag/);
    expect(broken(article => { (article.answer[0] as { tag?: string }).tag = "亂寫"; })).toMatch(/tag/);
    expect(broken(article => { (article.sections[0].items![0] as { tag?: string }).tag = "亂寫"; })).toMatch(/tag/);
  });
  it("每一條都要標來源等級（段落、條列也是）；遊戲資料、官方公告有自己的標籤", () => {
    expect(broken(article => { delete (article.sections[0].items![0] as { tag?: string }).tag; })).toMatch(/items\[0\].*tag/);
    expect(broken(article => { delete (article.sections[0].paragraphs![0] as { tag?: string }).tag; })).toMatch(/paragraphs\[0\].*tag/);
    expect(TAG_LABEL.game).toBe("遊戲資料");
    expect(TAG_LABEL.official).toBe("官方公告");
  });
  it("不准有 emoji：每個範圍的字、每個欄位都掃", () => {
    for (const code of [0x2300, 0x23ff, 0x25a0, 0x25ff, 0x2600, 0x27bf, 0x1f300, 0x1f600]) {
      const glyph = String.fromCodePoint(code);
      expect(broken(article => { article.sections[0].items![0].text += glyph; }), code.toString(16)).toMatch(/emoji/);
      expect(broken(article => { article.steps[1].title += glyph; }), code.toString(16)).toMatch(/emoji/);
    }
    // 箭頭、全形波浪號不算
    expect(broken(article => { article.intro += "31～35→40"; })).not.toMatch(/emoji/);
  });
  it("代號換不掉就擋", () => {
    expect(broken(article => { article.intro = "{{hits:999999999}}"; })).toMatch(/代號/);
    expect(broken(article => { article.steps[0].text = "{{exp:100}}"; })).toMatch(/代號/);
    expect(broken(article => { article.intro = "{{hits:100"; })).toMatch(/代號/);
  });
  it("僧侶 31～70 主推要有不死系；標備案不算主推；別的職業不管", () => {
    const pig = { map: 101040001, mobs: [byName("黑肥肥").id] };
    expect(broken(article => { Object.assign(article.steps[0], pig); })).toMatch(/不死系/);
    expect(broken(article => { Object.assign(article.steps[0], pig, { alt: true }); })).not.toMatch(/不死系/);
    expect(broken(article => { article.steps = article.steps.map(step => ({ ...step, alt: true as const })); })).toMatch(/主推/);
    const assassin = guides[410]!.train.filter(row => row.map && row.from <= 50 && row.to >= 31 && row.mobs.length);
    const article = validCleric();
    article.gear = [{ from: 31, to: 50, weapon: 1472009 }];
    article.steps = [{ from: 31, to: 50, kind: "solo", map: assassin[0].map!, mobs: assassin[0].mobs, title: "圖", text: "字", tag: "tw" }];
    article.answer = [{ text: "31～50 一", tag: "tw", from: 31, to: 50 }, { text: "二", tag: "tw" }];
    article.sources = [{ label: "來源", url: assassin[0].s[0] }];
    article.heroAlt = `刺客在{{map:${assassin[0].map}}}面對{{mob:${data.monsters.find(monster => monster.id === assassin[0].mobs[0])!.n}}}`;
    article.description = "刺客。";
    article.steps[0].title = "圖";
    article.sections = [];
    article.assumes = tableAssumes(buildCalcTable({ job: 410, from: 31, to: 50, data, gear: article.gear }));
    expect(validateArticle(article, { job: 410, from: 31, to: 50, data, openMaps })).toEqual([]);
  });
});

describe("給寫手看的資料", () => {
  it("計算表、假設、這個範圍的攻略列、能用的出處都在，三轉含二轉", () => {
    const brief = writerBrief({ job: 231, from: 71, to: 90, data });
    expect(brief.job).toMatchObject({ id: 231, name: "祭司" });
    expect(brief.eligible).toBe(true);
    expect(brief.table.rows.length).toBeGreaterThan(0);
    expect(brief.assumptionLines.length).toBeGreaterThan(0);
    expect(brief.train.length).toBeGreaterThan(0);
    for (const row of brief.train) expect(row.from <= 90 && row.to >= 71).toBe(true);
    expect(brief.train.every(row => row.mapName === null || typeof row.mapName === "string")).toBe(true);
    expect(brief.allowedSources).toEqual(expect.arrayContaining(guides[230]!.train[0].s));
    expect(brief.train[0].mobNames.length).toBe(brief.train[0].mobs.length);
    expect(brief.assumes).toEqual(tableAssumes(brief.table));
  });
});

describe("頁面（文章清單換成假資料）", () => {
  const key = { job: 230, from: 31, to: 50 };
  const params = (slug: string) => ({ params: Promise.resolve({ slug }) });
  beforeEach(() => {
    mockArticles.keys = [key];
    mockArticles.article = validCleric();
    mockArticles.images = {};
  });

  it("只出有檔案的範圍；沒有檔案的範圍 404", async () => {
    const { default: Page, dynamicParams, generateStaticParams } = await import("@/app/guides/[slug]/page");
    expect(dynamicParams).toBe(false);
    expect(generateStaticParams()).toEqual([{ slug: "priest-31-50" }]);
    mockArticles.article = undefined;
    await expect(Page(params("priest-31-50"))).rejects.toThrow();
    mockArticles.article = validCleric();
    await expect(Page(params("230-31-50"))).rejects.toThrow();
  });

  it("標題、描述、canonical、openGraph", async () => {
    const { generateMetadata } = await import("@/app/guides/[slug]/page");
    const meta = await generateMetadata(params("priest-31-50"));
    expect(meta.title).toBe("僧侶 31～50 等怎麼練");
    expect(meta.description).toBe("僧侶 31 到 50 等先打殭屍菇菇，再打天使猴。");
    expect(meta.alternates?.canonical).toBe("/guides/priest-31-50");
    expect(meta.openGraph?.url).toBe("/guides/priest-31-50");
    expect(meta.openGraph?.title).toContain("僧侶 31～50 等怎麼練");
    // 頁面的 openGraph 會整包蓋掉 layout：還沒有主圖時退回全站預覽圖，不指到不存在的檔案
    expect(meta.openGraph).toMatchObject({ siteName: "楓谷幫手", type: "article", locale: "zh_TW", images: [{ url: "/og.jpg" }], publishedTime: "2026-11-04T00:00:00+08:00", modifiedTime: "2026-11-04T00:00:00+08:00" });
  });

  it("畫面：結論、步驟、計算表、假設、來源標籤、來源清單、連結都在；代號都換掉了", async () => {
    const { default: Page } = await import("@/app/guides/[slug]/page");
    const html = renderToString(await Page(params("priest-31-50")));
    const table = buildCalcTable({ job: 230, from: 31, to: 50, data, gear: validCleric().gear });
    expect(html).not.toContain("{{");
    expect(html).toContain("先講結論");
    // 文章日期只用文章自己的欄位；遊戲資料只講版本，不再帶日期冒充文章日期
    const meta = read<Meta>("meta.json");
    expect(html.replace(/<!-- -->/g, "")).toContain(`依遊戲資料 ${meta.gameVersion} 計算`);
    expect(html).not.toContain("GMT");
    expect(html).toContain("僧侶這段靠群體治癒打不死系");
    expect(html).toContain("螞蟻洞Ⅰ：殭屍菇菇");
    // 麵包屑：職業攻略 > 僧侶 > 31～50 等
    expect(html).toMatch(/href="\/guide"[^>]*>職業攻略/);
    expect(html).toMatch(/href="\/jobs\/230"[^>]*>僧侶/);
    expect(html).toContain("31～50 等");
    // 來源等級四種字樣（這篇用到 台服回報、站上計算）
    expect(html).toContain("台服回報");
    expect(html).toContain("站上計算");
    expect(html).not.toContain(">舊版路線<");
    // 表：每隻怪都在、表自己橫捲、圖用 monster_frames
    for (const row of table.rows) {
      expect(html).toContain(row.name);
      expect(html).toContain(`/assets/monster_frames/${row.id}.png`);
    }
    expect(html).not.toContain("/assets/monsters/");
    expect(html).toMatch(/class="[^"]*scroll-x[^"]*"[^>]*><table/);
    // 假設跟公式說明
    for (const line of assumptionLines(table)) expect(html.replace(/<!-- -->/g, "")).toContain(line.replace(/&/g, "&amp;"));
    expect(html).toContain("公式是舊版玩家整理，經典版沒驗證");
    // 連結
    expect(html).toContain('href="/go?to=105050000"');
    expect(html).toContain(`href="/plan/damage?job=230&amp;level=40&amp;weapon=${table.assumptions.weapon!.id}&amp;skill=${HEAL}&amp;targets=3"`);
    expect(html).toContain('href="/plan/train"');
    expect(html).toContain('href="https://forum.gamer.com.tw/C.php?bsn=85994&amp;snA=1291"');
    // 結構化資料在 article 外的 body 裡（SeoPage 放的），不是 head
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('"@type":"WebPage"');
    expect(html).toContain("https://maplehelper.tw/guides/priest-31-50");
    // 不准有 emoji
    expect(html).not.toMatch(/[\u2300-\u23FF\u25A0-\u25FF\u2600-\u27BF]|[\u{1F300}-\u{10FFFF}]/u);
  });

  it("文章裡代號換不掉，整頁建不起來（不會把代號原文放上線）", async () => {
    const { default: Page } = await import("@/app/guides/[slug]/page");
    const bad = validCleric();
    bad.intro = "{{hits:999999999}}";
    mockArticles.article = bad;
    await expect(Page(params("priest-31-50"))).rejects.toThrow(/999999999/);
  });

  it("手機：站上算的數字排在最前面、第一欄固定、有往右滑的提示", async () => {
    const { JobArticleTable } = await import("@/components/JobArticleView");
    const table = buildCalcTable({ job: 230, from: 31, to: 50, data });
    const html = renderToString(JobArticleTable({ table }));
    const head = html.slice(html.indexOf("<thead"), html.indexOf("</thead>"));
    const order = ["範圍 3 隻", "打 1 隻", "幾等不 MISS", "等級", "HP", "魔防", "經驗"].map(text => head.indexOf(text));
    expect(order.every(index => index > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const stuck = [...html.matchAll(/<(th|td)[^>]*class="([^"]*sticky[^"]*)"[^>]*>/g)];
    expect(stuck.length).toBe(table.rows.length + 1);
    // 捲動時後面的數字不能透過來：一定要實心底
    for (const cell of stuck) expect(cell[2]).toMatch(/left-0.*bg-\[color:var\(--paper/);
    expect(html).toContain("往右滑");
  });

  it("單體職業的表只有一欄下數、物防；群體治癒才有兩欄", async () => {
    const { JobArticleTable } = await import("@/components/JobArticleView");
    const thief = renderToString(JobArticleTable({ table: buildCalcTable({ job: 410, from: 31, to: 50, data }) }));
    expect(thief).toContain("物防");
    expect(thief).not.toContain("魔防");
    expect(thief).not.toContain("範圍 3 隻");
    const healer = renderToString(JobArticleTable({ table: buildCalcTable({ job: 230, from: 31, to: 50, data }) }));
    expect(healer).toContain("魔防");
    expect(healer).toContain("範圍 3 隻");
    expect(healer).toContain("打 1 隻");
  });

  it("職業頁：有檔案才出現「分等級攻略」，只列有的範圍", async () => {
    const { default: JobPage } = await import("@/app/jobs/[id]/page");
    const shown = renderToString(await JobPage({ params: Promise.resolve({ id: "230" }) }));
    expect(shown).toContain("分等級攻略");
    expect(shown).toContain('href="/guides/priest-31-50"');
    expect(shown).not.toContain('href="/guides/priest-51-70"');
    mockArticles.keys = [];
    const hidden = renderToString(await JobPage({ params: Promise.resolve({ id: "230" }) }));
    expect(hidden).not.toContain("分等級攻略");
  });

  it("網站地圖、llms.txt 列這些頁、沒有文章就不列", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const { GET } = await import("@/app/llms.txt/route");
    const urls = sitemap().map(entry => entry.url);
    expect(urls).toContain("https://maplehelper.tw/guides/priest-31-50");
    expect(urls.some(url => /\/jobs\/\d+\/\d+-\d+/.test(url))).toBe(false);
    expect(await GET().text()).toContain("https://maplehelper.tw/guides/priest-31-50");
    mockArticles.keys = [];
    expect(sitemap().map(entry => entry.url).some(url => url.includes("/guides/"))).toBe(false);
    expect(await GET().text()).not.toContain("分等級攻略文");
  });
});

describe("來源標籤的對比（全站小字 AA，v0.81）", () => {
  const css = fs.readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
  const light = css.slice(css.indexOf(":root,"));
  const dark = css.slice(css.indexOf(':root[data-theme="dark"]'));
  const token = (block: string, name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(block)![1].trim();
  /** #rrggbb 或 rgb(r g b / a)；回傳 [r, g, b, a] */
  const parse = (value: string): number[] => {
    if (value.startsWith("#")) return [1, 3, 5].map(at => parseInt(value.slice(at, at + 2), 16)).concat(1);
    const match = /rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/.exec(value)!;
    return match.slice(1).map(Number);
  };
  const over = (top: number[], below: number[]) => [0, 1, 2].map(at => top[at] * top[3] + below[at] * (1 - top[3])).concat(1);
  const luminance = (rgb: number[]) => {
    const [r, g, b] = rgb.slice(0, 3).map(channel => { const s = channel / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: number[], b: number[]) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  it("每一種標籤、深淺色：段落裡的洗色底、結論框裡的實心底都到 4.5", async () => {
    const { TAG_TONE } = await import("@/components/JobArticleView");
    for (const [theme, block] of [["light", light], ["dark", dark]] as const) {
      const paper = parse(token(block, "paper"));
      for (const [tag, tone] of Object.entries(TAG_TONE)) {
        const tokenOf = (cls: string) => /var\(--([\w-]+)\)/.exec(cls)![1];
        const ink = parse(token(block, tokenOf(tone.ink)));
        expect(contrast(ink, over(parse(token(block, tokenOf(tone.wash))), paper)), `${theme} ${tag} 段落裡`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(ink, paper), `${theme} ${tag} 結論框裡`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("「先講結論」框裡的標籤用實心底，不跟框的洗色疊在一起（深色模式社群整理曾經只有 4.08）", async () => {
    const { JobArticleView } = await import("@/components/JobArticleView");
    const article = { ...validCleric(), answer: [{ text: "一", tag: "community" as const }, { text: "二", tag: "tw" as const }] };
    const html = renderToString(JobArticleView({ jobName: "僧侶", rangeLabel: "31～50 等", path: "/guides/priest-31-50", jobPath: "/jobs/230", article, table: buildCalcTable({ job: 230, from: 31, to: 50, data }), monsters: new Map(), maps: {}, dataNote: "", jsonLd: [] }));
    const box = html.slice(html.indexOf("先講結論"), html.indexOf("</ol>"));
    expect(box).toContain("社群整理");
    expect(box).not.toContain("--maple-wash");
    expect(box).toContain("bg-[color:var(--paper)]");
  });
});

describe("手機收合（v1.78，拍板 A）：主推留著，其他收成標題，字都還在 HTML 裡給 Google 讀", () => {
  const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  const render = () => {
    const raw = realArticle(230, 31, 50);
    const table = buildCalcTable({ job: 230, from: 31, to: 50, data, gear: raw.gear });
    const article = resolveArticle(raw, table, data);
    const monsters = new Map(data.monsters.map(monster => [monster.id, monster]));
    const html = renderToString(JobArticleView({ jobName: "僧侶", rangeLabel: "31～50 等", path: "/guides/priest-31-50", jobPath: "/jobs/230", article, table, monsters, maps: data.maps, dataNote: "依遊戲資料計算", jsonLd: [] })).replace(/<!-- -->/g, "");
    const folds = [...html.matchAll(/<details([^>]*)>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)].map(match => ({ attrs: match[1], summary: match[2], body: match[3] }));
    return { article, table, html, folds };
  };

  it("備案卡收成一行（備案 起～迄＋標題），內文還在；主推卡不收", () => {
    const { article, html, folds } = render();
    expect(article.steps.some(step => step.alt)).toBe(true);
    for (const step of article.steps) {
      const fold = folds.find(entry => entry.body.includes(esc(step.text)));
      if (step.alt) {
        expect(fold, step.title).toBeDefined();
        expect(fold!.summary).toContain(`備案 ${step.from}～${step.to}`);
        expect(fold!.summary).toContain(esc(step.title));
      } else {
        expect(fold, step.title).toBeUndefined();
        expect(html).toContain(esc(step.text));
      }
    }
  });

  it("表後面的段落、這張表怎麼算的、資料來源都收起來；段落標題還是 h2", () => {
    const { article, folds } = render();
    // 標了 topic 的（必解任務、技能點法）照舊露著，v1.79 那組測試管
    for (const section of article.sections.filter(entry => !entry.topic)) {
      const fold = folds.find(entry => entry.summary.includes(esc(section.heading)));
      expect(fold, section.heading).toBeDefined();
      expect(fold!.summary).toMatch(/<h2/);
      const first = section.paragraphs?.[0] ?? section.items?.[0];
      expect(fold!.body).toContain(esc(first!.text));
    }
    const assume = folds.find(entry => entry.summary.includes("這張表怎麼算的"));
    expect(assume?.body).toContain("公式是舊版玩家整理，經典版沒驗證");
    expect(assume?.body).toContain("依遊戲資料計算");
    const sources = folds.find(entry => entry.summary.includes("資料來源"));
    expect(sources?.summary).toMatch(/<h2/);
    for (const source of article.sources) expect(sources?.body).toContain(esc(source.url));
  });

  it("全部預設收著（伺服器畫的第一格就是收的，不會開著再縮）", () => {
    const { folds } = render();
    expect(folds.length).toBeGreaterThan(5);
    for (const fold of folds) expect(fold.attrs).not.toMatch(/\bopen\b/);
  });

  it("featuredMonsters：每個主推步驟輪流挑一隻（表裡有的才算），最多 3 隻；一隻都沒有就取表的前 3 隻", () => {
    const rows = [11, 22, 33, 44, 55].map(id => ({ id }));
    const step = (mobs: number[], alt?: boolean) => ({ mobs, alt });
    // 第一輪每步第一隻：44、55、33；第一段怪多也不會把後面主推的怪擠掉（獵人 31～50 露了黑斧木妖卻沒露天使猴）
    expect(featuredMonsters([step([44]), step([22], true), step([55, 99, 11]), step([33])], rows)).toEqual([44, 55, 33]);
    expect(featuredMonsters([step([11, 22, 33]), step([44])], rows)).toEqual([11, 44, 22]);
    expect(featuredMonsters([step([44, 44]), step([22], true)], rows)).toEqual([44]);
    expect(featuredMonsters([step([99])], rows)).toEqual([11, 22, 33]);
  });

  it("計算表只露 3 隻：其他列還在 HTML、藏起來，按鈕寫看全部幾隻", () => {
    const table = buildCalcTable({ job: 230, from: 31, to: 50, data });
    expect(table.rows.length).toBeGreaterThan(3);
    const featured = table.rows.slice(1, 4).map(row => row.id);
    const html = renderToString(JobArticleTable({ table, featured })).replace(/<!-- -->/g, "");
    const rows = [...html.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g)].slice(1);
    expect(rows).toHaveLength(table.rows.length);
    table.rows.forEach((row, index) => {
      const [, attrs, cells] = rows[index];
      expect(cells).toContain(row.name);
      expect(/data-extra/.test(attrs), row.name).toBe(!featured.includes(row.id));
    });
    expect(html).toContain(`看全部 ${table.rows.length} 隻怪`);
  });

  it("沒給 featured、或怪不到 4 隻：整張表都露、沒有按鈕", () => {
    const table = buildCalcTable({ job: 230, from: 31, to: 50, data });
    expect(renderToString(JobArticleTable({ table }))).not.toMatch(/data-extra|看全部/);
    const small = { ...table, rows: table.rows.slice(0, 3) };
    expect(renderToString(JobArticleTable({ table: small, featured: [small.rows[0].id] }))).not.toMatch(/data-extra|看全部/);
  });
});

describe("必解任務、技能點法露在外面；往右滑提示在表上面（v1.79，使用者選 1、4）", () => {
  const view = (article: JobArticle) => {
    const table = buildCalcTable({ job: 230, from: 31, to: 50, data, gear: article.gear });
    return renderToString(JobArticleView({ jobName: "僧侶", rangeLabel: "31～50 等", path: "/guides/priest-31-50", jobPath: "/jobs/230", article: resolveArticle(article, table, data), table, monsters: new Map(), maps: data.maps, dataNote: "", jsonLd: [] })).replace(/<!-- -->/g, "");
  };
  const article = (): JobArticle => ({
    ...validCleric(),
    sections: [
      { heading: "收著的一段", paragraphs: [{ text: "收著的字。", tag: "tw" }] },
      { heading: "這兩條必解", topic: "quests", items: [{ text: "桑那服 30 等起。", tag: "game" }] },
      { heading: "技能這樣點", topic: "skills", items: [{ text: "治癒先滿。", tag: "tw" }] },
    ],
  });

  it("topic 的段落不收：標題是 h2、字在外面，排在收著的段落前面；其他照收", () => {
    const html = view(article());
    const folded = [...html.matchAll(/<details[^>]*>([\s\S]*?)<\/details>/g)].map(match => match[1]);
    for (const text of ["這兩條必解", "桑那服 30 等起。", "技能這樣點", "治癒先滿。"]) expect(folded.some(body => body.includes(text)), text).toBe(false);
    expect(html).toMatch(/<h2[^>]*>這兩條必解<\/h2>/);
    expect(html).toMatch(/<h2[^>]*>技能這樣點<\/h2>/);
    expect(folded.some(body => body.includes("收著的字。"))).toBe(true);
    expect(html.indexOf("這兩條必解")).toBeLessThan(html.indexOf("收著的一段"));
    expect(html.indexOf("這兩條必解")).toBeLessThan(html.indexOf("技能這樣點"));
  });

  it("validateArticle：topic 只能是 quests、skills", () => {
    const ctx = { job: 230, from: 31, to: 50, data, openMaps };
    expect(validateArticle(article(), ctx)).toEqual([]);
    const bad = article();
    (bad.sections[1] as { topic: string }).topic = "quest";
    expect(validateArticle(bad, ctx).join("\n")).toMatch(/sections\[1\]\.topic/);
  });

  it("「表可以往右滑」在表上面（滑之前就看得到）", async () => {
    const { JobArticleTable } = await import("@/components/JobArticleView");
    const html = renderToString(JobArticleTable({ table: buildCalcTable({ job: 230, from: 31, to: 50, data }) }));
    expect(html.indexOf("往右滑")).toBeGreaterThan(0);
    expect(html.indexOf("往右滑")).toBeLessThan(html.indexOf("<table"));
  });
});

describe("伺服器頁不能吃到瀏覽器專用的模組", () => {
  it("job-article 跟 static-data 一路 import 下去都沒有 use client（會變假值，算出 NaN）", () => {
    const seen = new Set<string>();
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = fs.readFileSync(file, "utf8");
      expect(/^\s*["']use client["']/m.test(source), file).toBe(false);
      for (const match of source.matchAll(/^(?:import|export) (?!type )[^;]*? from "([^"]+)"/gm)) {
        const spec = match[1].replace(/^@\//, `${ROOT}src/`);
        if (!spec.startsWith(".") && !spec.startsWith(ROOT)) continue;
        const target = path.resolve(path.dirname(file), spec);
        const resolved = [`${target}.ts`, `${target}.tsx`, path.join(target, "index.ts")].find(entry => fs.existsSync(entry));
        if (resolved) walk(resolved);
      }
    };
    walk(path.join(ROOT, "src/lib/job-article.ts"));
    walk(path.join(ROOT, "src/lib/static-data.ts"));
    expect(seen.size).toBeGreaterThan(5);
  });
});

describe("src/data/job-articles/ 的真檔全部要過", () => {
  const dir = path.join(ROOT, "src/data/job-articles");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(file => file !== "images.gen.json") : [];

  it("檔名都是 <職業>-<起>-<迄>.json，而且是拍板的範圍", () => {
    for (const file of files) {
      const key = parseArticleFile(file);
      expect(key, file).not.toBeNull();
      expect(articleRanges(key!.job), file).toContainEqual({ from: key!.from, to: key!.to });
    }
  });

  it("每一篇都標了必解任務、技能點法的段落（topic）：沒標的話手機上全被收起來（v1.79）", () => {
    for (const file of files) {
      const topics = (JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as JobArticle).sections.map(section => section.topic);
      expect(topics, `${file} 沒有 quests 段落`).toContain("quests");
      expect(topics, `${file} 沒有 skills 段落`).toContain("skills");
    }
  });

  it("每一篇都過 validateArticle，也換得掉代號", async () => {
    const actual = await vi.importActual<typeof import("@/lib/static-data")>("@/lib/static-data");
    expect(actual.staticJobArticleKeys().length).toBe(files.length);
    for (const { job, from, to } of actual.staticJobArticleKeys()) {
      const article = actual.staticJobArticle(job, from, to);
      expect(article, `${job}-${from}-${to}`).toBeDefined();
      expect(validateArticle(article, { job, from, to, data, openMaps }), `${job}-${from}-${to}`).toEqual([]);
      expect(() => resolveArticle(article!, buildCalcTable({ job, from, to, data, gear: article!.gear, statCap: article!.statCap }), data)).not.toThrow();
    }
  }, 240_000);

  it("結論按鈕、步驟卡帶去的圖都走得到（/go 算得出路線）", async () => {
    const actual = await vi.importActual<typeof import("@/lib/static-data")>("@/lib/static-data");
    const graph = read<Record<string, PortalEdge[]>>("graph.json");
    const nearest = read<Record<string, [number, number]>>("nearest-town.json");
    const dead: string[] = [];
    for (const { job, from, to } of actual.staticJobArticleKeys()) {
      const article = actual.staticJobArticle(job, from, to)!;
      const targets = [...article.answer.map(line => line.go), ...article.steps.map(step => step.go ?? step.map)].filter((map): map is number => typeof map === "number");
      for (const map of new Set(targets)) {
        const start = suggestStart(graph, data.maps, nearest, map);
        if (start !== map && (start === null || !findRoute(graph, start, map).ok)) dead.push(`${job}-${from}-${to}：${data.maps[String(map)]?.zh}（${map}）`);
      }
    }
    expect(dead).toEqual([]);
  }, 120_000);

  it("組隊入口清單跟攻略資料一致", () => {
    expect([...PQ_ENTRANCES].sort()).toEqual(read<GuideCommon>("guides/common.json").pq!.map(pq => pq.entrance).sort());
  });

  it("資料把文章打壞：只拿掉那一篇，其他篇照出（不擋整站的資料更新），錯誤講得出來", async () => {
    const actual = await vi.importActual<typeof import("@/lib/static-data")>("@/lib/static-data");
    const entries = actual.staticJobArticleKeys().map(key => ({ ...key, article: actual.staticJobArticle(key.job, key.from, key.to) }));
    const noDog = { ...data, monsters: data.monsters.filter(monster => monster.n !== "骷髏犬") };
    const { ok, broken } = splitArticles(entries, noDog, openMaps);
    expect(broken.map(entry => `${entry.job}-${entry.from}-${entry.to}`)).toContain("230-31-50");
    expect(broken.find(entry => entry.job === 230)!.errors.join("\n")).toMatch(/骷髏犬/);
    expect(ok.length).toBeGreaterThan(0);
    expect(ok.length + broken.length).toBe(entries.length);
    // 表上的怪消失、攻略消失，validateArticle 都回錯誤、不丟例外
    expect(() => splitArticles(entries, { ...data, monsters: [] }, openMaps)).not.toThrow();
    expect(() => splitArticles(entries, { ...data, guides: {} }, openMaps)).not.toThrow();
    // 現在的資料全部過
    expect(splitArticles(entries, data, openMaps).broken).toEqual([]);
  }, 120_000);

  it("審查列的實例：骷髏士官從資料拿掉、黃色雨傘拿掉、骷髏犬打不中，230 這篇都不會過", async () => {
    const actual = await vi.importActual<typeof import("@/lib/static-data")>("@/lib/static-data");
    const article = actual.staticJobArticle(230, 31, 50);
    const ctx = { job: 230, from: 31, to: 50, openMaps };
    expect(validateArticle(article, { ...ctx, data: { ...data, monsters: data.monsters.filter(monster => monster.n !== "骷髏士官") } }).join("\n")).toMatch(/骷髏士官/);
    expect(validateArticle(article, { ...ctx, data: { ...data, gear: { ...data.gear, weapons: data.gear.weapons.filter(weapon => weapon.n !== "黃色雨傘") } } }).join("\n")).toMatch(/武器/);
    expect(validateArticle(article, { ...ctx, data: { ...data, monsters: data.monsters.map(monster => (monster.n === "骷髏犬" ? { ...monster, eva: 40 } : monster)) } }).join("\n")).toMatch(/骷髏犬/);
  }, 120_000);

  it("static-data 組出來的計算資料跟測試讀到的同一份（頁面不會用到別的）", async () => {
    const actual = await vi.importActual<typeof import("@/lib/static-data")>("@/lib/static-data");
    const calc = actual.staticCalcData();
    expect(calc.monsters.length).toBe(data.monsters.length);
    expect(calc.skills.size).toBe(data.skills.size);
    expect(Object.keys(calc.guides).sort()).toEqual(ALL_JOBS.map(String).sort());
    expect(calc.expToNext).toEqual(data.expToNext);
    expect(buildCalcTable({ job: 230, from: 31, to: 50, data: calc })).toEqual(buildCalcTable({ job: 230, from: 31, to: 50, data }));
    expect(actual.staticOpenMaps().has(105050000)).toBe(true);
  });
});

/* ------------------------------------------------------------------ v1.44（第一批評分 3～3.5，使用者選「先修再審」）：指定等級的代號、指定武器、結論連結與防呆、連到計算機、article:show */

const realArticle = (job: number, from: number, to: number) => JSON.parse(fs.readFileSync(`${ROOT}src/data/job-articles/${job}-${from}-${to}.json`, "utf8")) as JobArticle;

/** 預設角色在這一級打這隻怪：對答案用，不經過文章的程式 */
function killsDirect(job: number, level: number, skillId: number, monster: Monster, targets?: number) {
  const group = defaultState(data, job, level, null).groups[0];
  const result = computeGroup(data, { job, skillId, skillLevel: group.levels[skillId], monsterId: monster.id, ...(targets === undefined ? {} : { targets }) }, group, monster);
  if (!result.ok || !result.vs) throw new Error("算不出來");
  return result.vs.kills.avg;
}

describe("代號指定等級：{{hits:怪物id@等級#武器id}}、{{hitsOne:怪物id@等級#武器id}}", () => {
  const monk = buildCalcTable({ job: 230, from: 31, to: 50, data });
  const monkey = byName("天使猴");
  const umbrella = data.gear.weapons.find(weapon => weapon.n === "黃色雨傘")!.id;

  it("僧侶：hits 是範圍 3 隻、hitsOne 是打 1 隻，用那一級的預設角色跟傷害計算機對得上", () => {
    expect(fillTokens(`{{hits:${monkey.id}@45#${umbrella}}}`, monk, data)).toBe(String(killsDirect(230, 45, HEAL, monkey, 3)));
    expect(fillTokens(`{{hitsOne:${monkey.id}@45#${umbrella}}}`, monk, data)).toBe(String(killsDirect(230, 45, HEAL, monkey, 1)));
  });
  it("不帶等級的 {{hitsOne:id}} 就是表上「打 1 隻」那一欄；中段那一級拿表上那把，帶不帶 @ 都一樣", () => {
    const row = monk.rows.find(entry => entry.id === monkey.id)!;
    expect(fillTokens(`{{hitsOne:${monkey.id}}}`, monk, data)).toBe(String(row.hitsOne));
    expect(fillTokens(`{{hits:${monkey.id}@${monk.midLevel}#${umbrella}}}`, monk, data)).toBe(String(row.hits));
    expect(fillTokens(`{{hitsOne:${monkey.id}@${monk.midLevel}#${umbrella}}}`, monk, data)).toBe(String(row.hitsOne));
  });
  it("表上沒有的怪也可以指定等級（只要算得出來）：別的段會打的怪不用為了引用塞進表", () => {
    const table = buildCalcTable({ job: 110, from: 31, to: 50, data });
    const offTable = data.monsters.find(monster => !monster.un && monster.hp > 0 && monster.lv === 30 && !table.rows.some(row => row.id === monster.id))!;
    expect(fillTokens(`{{hits:${offTable.id}@40#${table.assumptions.weapon!.id}}}`, table, data)).toMatch(/^\d+$/);
  });
  it("等級超出文章範圍、怪不存在、僧侶打不是不死系、單體職業用 hitsOne、沒給資料都丟錯", () => {
    expect(() => fillTokens(`{{hits:${monkey.id}@51#${umbrella}}}`, monk, data)).toThrow(/31～50/);
    expect(() => fillTokens(`{{hits:${monkey.id}@30#${umbrella}}}`, monk, data)).toThrow(/31～50/);
    expect(() => fillTokens(`{{hits:999@40#${umbrella}}}`, monk, data)).toThrow(/999/);
    expect(() => fillTokens(`{{hits:${byName("黑肥肥").id}@40#${umbrella}}}`, monk, data)).toThrow(/代號/);
    const fighter = buildCalcTable({ job: 110, from: 31, to: 50, data });
    const axe = fighter.assumptions.weapon!.id;
    expect(() => fillTokens(`{{hitsOne:${fighter.rows[0].id}@40#${axe}}}`, fighter, data)).toThrow(/代號/);
    expect(() => fillTokens(`{{hitsOne:${fighter.rows[0].id}}}`, fighter, data)).toThrow(/代號/);
    expect(() => fillTokens(`{{hits:${monkey.id}@45#${umbrella}}}`, monk)).toThrow(/代號/);
    expect(() => fillTokens(`{{hitLv:${monkey.id}@45}}`, monk, data)).toThrow(/代號/);
  });
  it("resolveArticle 也換得掉；validateArticle 把超出範圍的等級報出來", () => {
    const article = { ...realArticle(230, 31, 50), intro: `打 {{hits:${monkey.id}@45#${umbrella}}} 下` };
    expect(resolveArticle(article, monk, data).intro).toBe(`打 ${killsDirect(230, 45, HEAL, monkey, 3)} 下`);
    const errors = validateArticle({ ...article, intro: `打 {{hits:${monkey.id}@60#${umbrella}}} 下` }, { job: 230, from: 31, to: 50, data, openMaps }).join("\n");
    expect(errors).toMatch(/intro.*31～50/);
  });
});

describe("assumes 也比對文字用到的資料代號（資料一變就下架）", () => {
  const monkey = byName("天使猴");
  const umbrella = data.gear.weapons.find(weapon => weapon.n === "黃色雨傘")!.id;
  const ctx = { job: 230, from: 31, to: 50, data, openMaps };
  const table = buildCalcTable({ job: 230, from: 31, to: 50, data });
  const base = () => {
    const article: JobArticle = { ...validCleric(), intro: `打 {{hits:${monkey.id}@45#${umbrella}}} 下，單打 {{hitsOne:${monkey.id}@45#${umbrella}}} 下` };
    article.assumes = articleAssumes(article, table, data);
    return article;
  };
  it("articleAssumes 列出文章用到的每一個代號；沒用到就不多一包，跟 tableAssumes 一樣", () => {
    expect(base().assumes.pinned).toEqual({ [`hits:${monkey.id}@45#${umbrella}`]: killsDirect(230, 45, HEAL, monkey, 3), [`hitsOne:${monkey.id}@45#${umbrella}`]: killsDirect(230, 45, HEAL, monkey, 1) });
    expect(articleAssumes(validCleric(), table, data)).toEqual(tableAssumes(table));
  });
  it("對得上沒有錯；數字變了、沒貼、多貼都擋（這裡不看先後，一變就擋）", () => {
    expect(validateArticle(base(), ctx)).toEqual([]);
    const changed = base();
    changed.assumes.pinned![`hits:${monkey.id}@45#${umbrella}`]! += 1;
    expect(validateArticle(changed, ctx).join("\n")).toMatch(/assumes\.pinned.*文字要重看/);
    const missing = base();
    delete missing.assumes.pinned;
    expect(validateArticle(missing, ctx).join("\n")).toMatch(/assumes\.pinned/);
    const extra = base();
    extra.assumes.pinned![`hits:${monkey.id}@40#${umbrella}`] = 1;
    expect(validateArticle(extra, ctx).join("\n")).toMatch(/assumes\.pinned/);
  });
});

/** 過新規則的結論：31～50 全包到 */
const goodAnswer = (extra: Partial<JobArticle["answer"][number]> = {}): JobArticle["answer"] => [
  { text: "31～40 等去{{map:105050200}}。", tag: "tw", from: 31, to: 40, ...extra },
  { text: "41～50 等去{{map:107000403}}。", tag: "tw", from: 41, to: 50 },
];
const strictCtx = { job: 230, from: 31, to: 50, data, openMaps };

describe("結論防呆：從第一條起涵蓋每個等級、每條字數上限", () => {
  const check = (answer: unknown) => validateArticle({ ...realArticle(230, 31, 50), answer }, strictCtx).filter(error => error.startsWith("answer")).join("\n");

  it("涵蓋整段、等級有寫進文字就過", () => {
    expect(check(goodAnswer())).toBe("");
    expect(check([...goodAnswer(), { text: "群體治癒先點滿。", tag: "tw" }])).toBe("");
  });
  it("第一條不從範圍開頭起擋；中間漏等級擋，並講出漏哪幾級", () => {
    expect(check([{ text: "沒寫等級的一句。", tag: "tw" }, ...goodAnswer()])).toMatch(/第一條/);
    expect(check([{ text: "35～40 等", tag: "tw", from: 35, to: 40 }, { text: "41～50 等", tag: "tw", from: 41, to: 50 }])).toMatch(/第一條/);
    expect(check([{ text: "31～40 等", tag: "tw", from: 31, to: 40 }, { text: "43～50 等", tag: "tw", from: 43, to: 50 }])).toMatch(/41.*42/);
  });
  it("from、to 要成對、在範圍內；文字裡要看得到這段等級（玩家看不到欄位）", () => {
    expect(check([{ text: "31 等", tag: "tw", from: 31 }, { text: "二", tag: "tw" }])).toMatch(/from、to/);
    expect(check([{ text: "31～60 等", tag: "tw", from: 31, to: 60 }, { text: "二", tag: "tw" }])).toMatch(/31～50/);
    expect(check([{ text: "去螞蟻洞", tag: "tw", from: 31, to: 50 }, { text: "二", tag: "tw" }])).toMatch(/31～50/);
    expect(check([{ text: "31～49 等", tag: "tw", from: 31, to: 49 }, { text: "只有 50 等", tag: "tw", from: 50, to: 50 }])).toBe("");
  });
  it("每條 70 字內，換完代號才算", () => {
    expect(ANSWER_MAX).toBe(70);
    const pad = (length: number) => "字".repeat(length);
    const head = "31～50 等";
    expect(check([{ text: `${head}${pad(70 - head.length)}`, tag: "tw", from: 31, to: 50 }, { text: "二", tag: "tw" }])).toBe("");
    expect(check([{ text: `${head}${pad(71 - head.length)}`, tag: "tw", from: 31, to: 50 }, { text: "二", tag: "tw" }])).toMatch(/70 字/);
    // {{mob:天使猴}} 原文 11 字、換完 3 字
    expect(check([{ text: `${head}${pad(70 - head.length - 3)}{{mob:天使猴}}`, tag: "tw", from: 31, to: 50 }, { text: "二", tag: "tw" }])).toBe("");
  });
});

describe("結論帶地圖連結：go", () => {
  const check = (extra: Record<string, unknown>) => validateArticle({ ...realArticle(230, 31, 50), answer: goodAnswer(extra as never) }, strictCtx).filter(error => error.startsWith("answer")).join("\n");

  it("地圖存在且開放就過", () => {
    expect(check({ go: 105050200 })).toBe("");
  });
  it("地圖不存在、型別錯、尚未開放都擋", () => {
    expect(check({ go: 999 })).toMatch(/地圖 999/);
    expect(check({ go: "105050000" })).toMatch(/go/);
    const closed = validateArticle({ ...realArticle(230, 31, 50), answer: goodAnswer({ go: 105050200 }) }, { ...strictCtx, openMaps: new Set<number>() }).join("\n");
    expect(closed).toMatch(/answer.*尚未開放/);
  });
  it("畫面：結論框裡有「帶我去 XX」，連結跟步驟卡同一種；沒寫 go 的條不出連結", () => {
    const table = buildCalcTable({ job: 230, from: 31, to: 50, data });
    const article = resolveArticle({ ...realArticle(230, 31, 50), answer: goodAnswer({ go: 105050200 }) }, table, data);
    const html = renderToString(JobArticleView({ jobName: "僧侶", rangeLabel: "31～50 等", path: "/guides/priest-31-50", jobPath: "/jobs/230", article, table, monsters: new Map(), maps: data.maps, dataNote: "", jsonLd: [] })).replace(/<!-- -->/g, "");
    const box = html.slice(html.indexOf("先講結論"), html.indexOf("</ol>"));
    expect(box).toContain('href="/go?to=105050200"');
    expect(box).toContain(`帶我去${data.maps["105050200"].zh}`);
    expect(box.match(/\/go\?to=/g)).toHaveLength(1);
  });
});

describe("連到傷害計算機帶職業、等級", () => {
  it("parseDamageLink：職業要是真的、等級夾在職業範圍；缺職業、亂寫都不作用", () => {
    const only = (level: number | null) => ({ job: 110, level, weapon: null, skill: null, targets: null, stats: null });
    expect(parseDamageLink("?job=110&level=40")).toEqual(only(40));
    expect(parseDamageLink("?job=110")).toEqual(only(null));
    expect(parseDamageLink("?job=110&level=5")).toEqual(only(30));
    expect(parseDamageLink("?job=110&level=abc")).toEqual(only(null));
    expect(parseDamageLink("?level=40")).toBeNull();
    expect(parseDamageLink("?job=999&level=40")).toBeNull();
    expect(parseDamageLink("?job=0&level=40")).toBeNull();
    expect(parseDamageLink("?mob=100100")).toBeNull();
    expect(parseDamageLink("")).toBeNull();
  });
  it("linkStartLevel：連結帶的職業就用連結的等級，換了職業、沒帶等級照使用者存的", () => {
    const link = (level: number | null) => ({ job: 110, level, weapon: null, skill: null, targets: null, stats: null });
    expect(linkStartLevel(110, 77, link(40))).toBe(40);
    expect(linkStartLevel(230, 77, link(40))).toBe(77);
    expect(linkStartLevel(110, 77, link(null))).toBe(77);
    expect(linkStartLevel(110, 77, null)).toBe(77);
  });
  it("文章表下的連結帶職業、中段等級、表上的武器、招式、隻數", () => {
    expect(damageLinkHref(230, 40)).toBe("/plan/damage?job=230&level=40");
    const table = buildCalcTable({ job: 230, from: 31, to: 50, data });
    const article = resolveArticle(realArticle(230, 31, 50), table, data);
    const html = renderToString(JobArticleView({ jobName: "僧侶", rangeLabel: "31～50 等", path: "/guides/priest-31-50", jobPath: "/jobs/230", article, table, monsters: new Map(), maps: data.maps, dataNote: "", jsonLd: [] }));
    expect(html).toContain(`href="/plan/damage?job=230&amp;level=40&amp;weapon=${table.assumptions.weapon!.id}&amp;skill=${HEAL}&amp;targets=3"`);
    expect(html).not.toContain('href="/plan/damage"');
  });
  it("假設行不講計算機的「下面『技能等級』」：文章頁下面沒有這個欄位", () => {
    const table = buildCalcTable({ job: 110, from: 31, to: 50, data });
    expect(table.assumptions.notes.join("")).toContain("沒點");
    expect(assumptionLines(table).join("\n")).not.toContain("技能等級」改");
  });
});

describe("article:show：換完代號的完整文字", () => {
  const monkey = byName("天使猴");
  const umbrella = data.gear.weapons.find(weapon => weapon.n === "黃色雨傘")!.id;
  const article = () => ({ ...realArticle(230, 31, 50), answer: goodAnswer({ go: 105050200 }), intro: `打 {{hits:${monkey.id}@45#${umbrella}}} 下` });
  const show = (input: JobArticle) => articleShowText({ job: 230, from: 31, to: 50, article: input, data, openMaps });

  it("結論、步驟、段落、表、假設、來源都在，代號都換掉", () => {
    const text = show(article());
    const table = buildCalcTable({ job: 230, from: 31, to: 50, data, gear: article().gear });
    expect(text.slice(0, text.indexOf("== 防呆 =="))).not.toContain("{{");
    expect(text).toContain("31～40 等去螞蟻洞Ⅲ。");
    expect(text).toContain(`帶我去${data.maps["105050200"].zh}`);
    expect(text).toContain(`打 ${killsDirect(230, 45, HEAL, monkey, 3)} 下`);
    expect(text).toContain(`${article().steps[0].from}～${article().steps[0].to}`);
    expect(text).toContain(article().sections[0].heading);
    for (const row of table.rows) expect(text).toContain(row.name);
    for (const line of assumptionLines(table)) expect(text).toContain(line);
    expect(text).toContain(article().sources[0].url);
  });
  it("印出該貼的 assumes（含指定等級），也列防呆", () => {
    const text = show(article());
    expect(text).toContain(`hits:${monkey.id}@45#${umbrella}`);
    expect(text).toContain("防呆");
    expect(show(realArticle(230, 31, 50))).toContain("全部通過");
  });
  it("代號換不掉不會整支掛掉：那一格寫錯在哪，寫手看得到", () => {
    expect(show({ ...article(), intro: `{{hits:999@40#${umbrella}}}` })).toContain("代號錯");
  });
  it("指令接好了", () => {
    const pkg = JSON.parse(fs.readFileSync(`${ROOT}package.json`, "utf8"));
    expect(pkg.scripts["article:show"]).toBe("node scripts/job-article-show.mjs");
    expect(fs.existsSync(`${ROOT}scripts/job-article-show.mjs`)).toBe(true);
  });
});

/* ------------------------------------------------------------------ v1.44 第二輪審查：文字寫哪把就算哪把、會變的數字進 assumes、結論跟步驟對得上、連到計算機表跟畫面同一個數字 */

const FIVE = [110, 230, 310, 410, 420];
const fiveCtx = (job: number, over: Partial<CalcData> = {}, maps = openMaps) => ({ job, from: 31, to: 50, data: { ...data, ...over }, openMaps: maps });
const errorsOf = (job: number, over: Partial<CalcData> = {}, maps = openMaps, change: (article: JobArticle) => void = () => {}) => {
  const article = realArticle(job, 31, 50);
  change(article);
  return validateArticle(article, fiveCtx(job, over, maps)).join("\n");
};
const gearWith = (name: string, patch: Record<string, unknown> | null): Partial<CalcData> => ({
  gear: { ...data.gear, weapons: patch ? data.gear.weapons.map(weapon => (weapon.n === name ? { ...weapon, ...patch } : weapon)) : data.gear.weapons.filter(weapon => weapon.n !== name) },
});
const mobWith = (name: string, patch: Partial<Monster> | ((monster: Monster) => Partial<Monster>)): Partial<CalcData> => ({
  monsters: data.monsters.map(monster => (monster.n === name ? { ...monster, ...(typeof patch === "function" ? patch(monster) : patch) } : monster)),
});
const weaponId = (name: string) => data.gear.weapons.find(weapon => weapon.n === name)!.id;

describe("代號指定武器：{{hits:怪物id@等級#武器id}} 算的是文字寫的那把", () => {
  const table = buildCalcTable({ job: 410, from: 31, to: 50, data });
  const pig = byName("黑肥肥");
  const fist = weaponId("鋰礦鬥拳");

  it("跟直接照那把武器算的一樣，不是那一級的預設武器", () => {
    const base = defaultState(data, 410, 39, null);
    const group = { ...base.groups[0], weaponId: fist, weaponAtk: null };
    const direct = computeGroup(data, { job: 410, skillId: base.shared.skillId, skillLevel: base.shared.skillLevel, monsterId: pig.id }, group, pig);
    expect(fillTokens(`{{hits:${pig.id}@39#${fist}}}`, table, data)).toBe(String(direct.ok && direct.vs!.kills.avg));
  });
  it("沒寫武器、武器不存在、等級還拿不到、能力值穿不上都丟錯", () => {
    expect(() => fillTokens(`{{hits:${pig.id}@39}}`, table, data)).toThrow(/#武器/);
    expect(() => fillTokens(`{{hits:${pig.id}@39#999}}`, table, data)).toThrow(/999/);
    expect(() => fillTokens(`{{hits:${pig.id}@31#${weaponId("赤紅護腕")}}}`, table, data)).toThrow(/拿不到/);
    const heavy = { ...data, ...gearWith("鋰礦鬥拳", { req: { DEX: 999 } }) };
    expect(() => fillTokens(`{{hits:${pig.id}@39#${fist}}}`, table, heavy)).toThrow(/穿不上/);
  });
  it("statCap：文字寫敏捷停 60，多的點數算回主屬性，下數照這套配點", () => {
    const capped = buildCalcTable({ job: 410, from: 31, to: 50, data, statCap: { DEX: 60 } });
    const base = defaultState(data, 410, 45, null);
    const stats = base.groups[0].stats;
    const moved = stats.DEX - 60;
    expect(moved).toBeGreaterThan(0);
    const group = { ...base.groups[0], weaponId: fist, weaponAtk: null, stats: { ...stats, DEX: 60, LUK: stats.LUK + moved } };
    const mob = byName("猴子");
    const direct = computeGroup(data, { job: 410, skillId: base.shared.skillId, skillLevel: base.shared.skillLevel, monsterId: mob.id }, group, mob);
    expect(fillTokens(`{{hits:${mob.id}@45#${fist}}}`, capped, data)).toBe(String(direct.ok && direct.vs!.kills.avg));
  });
  it("{{acc:等級#武器}} 算那一級拿那把的命中（精準技能照武器）", () => {
    const sword = weaponId("高原之劍");
    const fighter = buildCalcTable({ job: 110, from: 31, to: 50, data });
    const group = { ...defaultState(data, 110, 40, null).groups[0], weaponId: sword };
    expect(fillTokens(`{{acc:40#${sword}}}`, fighter, data)).toBe(String(characterAccuracy(data, 110, group).value));
  });
  it("{{exp:怪}}、{{spawn:怪@地圖}}、{{weapon:武器}}、{{req:武器:能力}}、{{price:武器}}、{{map:地圖}} 換成資料裡的值；查不到丟錯", () => {
    expect(fillTokens(`{{exp:${pig.id}}}`, table, data)).toBe(String(pig.exp));
    expect(fillTokens(`{{spawn:${pig.id}@101040001}}`, table, data)).toBe(String(pig.sp!.find(([map]) => map === 101040001)![1]));
    expect(() => fillTokens(`{{spawn:${pig.id}@100000000}}`, table, data)).toThrow(/刷/);
    expect(fillTokens(`{{weapon:${fist}}}`, table, data)).toBe("鋰礦鬥拳");
    expect(() => fillTokens("{{weapon:999}}", table, data)).toThrow(/999/);
    expect(fillTokens(`{{req:${fist}:DEX}}`, table, data)).toBe("60");
    expect(() => fillTokens(`{{req:${fist}:INT}}`, table, data)).toThrow(/需求/);
    expect(fillTokens(`{{price:${weaponId("火焰之弓")}}}`, table, data)).toBe("25 萬");
    expect(fillTokens(`{{price:${weaponId("暴風弓")}}}`, table, data)).toBe("37.5 萬");
    expect(fillTokens("{{map:101040001}}", table, data)).toBe("黑肥肥領土");
    expect(() => fillTokens("{{map:999}}", table, data)).toThrow(/999/);
  });
});

describe("審查列的實例：資料一變，文字寫死的前提不會繼續上線", () => {
  it("文章主推的武器變動", () => {
    expect(errorsOf(410, gearWith("鋰礦鬥拳", { atk: 15 }))).toMatch(/assumes/);
    expect(errorsOf(420, gearWith("水晶刃", { atk: 30 }))).toMatch(/assumes/);
    expect(errorsOf(420, gearWith("水晶刃", null))).toMatch(/999|水晶刃|武器/);
    expect(errorsOf(110, gearWith("高原之劍", { atk: 40 }))).toMatch(/assumes/);
    expect(errorsOf(310, gearWith("火焰之弓", { atk: 40 }))).toMatch(/assumes/);
  });
  it("俠盜主推的下數變動（一下死不寫死）", () => {
    expect(errorsOf(420, mobWith("黑肥肥", { hp: 1500 }))).toMatch(/assumes/);
    expect(JSON.stringify(realArticle(420, 31, 50).answer)).not.toMatch(/一下死/);
  });
  it("換圖理由靠的經驗、刷怪數變動", () => {
    expect(errorsOf(230, mobWith("小幽靈", { exp: 20 }))).toMatch(/assumes.*exp/);
    expect(errorsOf(110, mobWith("火肥肥", { exp: 200 }))).toMatch(/assumes.*exp/);
    expect(errorsOf(420, mobWith("風獨眼獸", { exp: 20 }))).toMatch(/assumes.*exp/);
    expect(errorsOf(420, mobWith("風獨眼獸", monster => ({ sp: monster.sp!.map(([map, count, rate]) => [map, Math.floor(count / 3), rate] as [number, number, number]) })))).toMatch(/assumes.*spawn/);
  });
  it("經驗比較的句子沒進 assumes 就擋（新文章寫了也跑不掉）", () => {
    const line = "{{mob:黑肥肥}}按一次的經驗贏{{mob:天使猴}}。";
    const pig = byName("黑肥肥");
    const monkey = byName("天使猴");
    const without = (article: JobArticle) => {
      article.intro = line;
      article.assumes.relies = Object.fromEntries(Object.entries(article.assumes.relies ?? {}).filter(([key]) => key !== `exp:${pig.id}` && key !== `exp:${monkey.id}`));
    };
    expect(errorsOf(410, {}, openMaps, without)).toMatch(/intro.*exp/);
    expect(
      errorsOf(410, {}, openMaps, article => {
        without(article);
        article.assumes.relies = { ...article.assumes.relies, [`exp:${pig.id}`]: pig.exp, [`exp:${monkey.id}`]: monkey.exp };
      }),
    ).not.toMatch(/intro.*exp/);
    expect(errorsOf(410, {}, openMaps, article => { article.sections[0].items![0] = { text: "這張圖 30 隻。", tag: "game" }; })).toMatch(/spawn/);
  });
  it("relies 寫的當下是多少，現在不一樣就擋；認不得的鍵也擋", () => {
    expect(errorsOf(230, {}, openMaps, article => { article.assumes.relies = { ...article.assumes.relies, "exp:3230101": 1 }; })).toMatch(/assumes\.relies/);
    expect(errorsOf(230, {}, openMaps, article => { article.assumes.relies = { ...article.assumes.relies, "亂寫:1": 1 }; })).toMatch(/assumes\.relies/);
  });
  it("命中寫死的地方走代號：精準之劍數值一變就擋", () => {
    const skills = new Map(data.skills);
    const mastery = [...skills.values()].find(skill => skill.n === "精準之劍")!;
    skills.set(mastery.id, { ...mastery, levels: mastery.levels!.map((row, index) => (index === 3 ? { ...row, x: 99 } : row)) });
    expect(errorsOf(110, { skills })).toMatch(/assumes/);
  });
});

describe("結論跟步驟對得上", () => {
  it("go 不在攻略練功段就擋（同系列的圖可以，螞蟻洞Ⅲ跟螞蟻洞Ⅰ）", () => {
    expect(errorsOf(110, {}, openMaps, article => { article.answer[0].go = 100000000; })).toMatch(/answer\[0\]\.go.*練功段/);
    expect(errorsOf(420, {}, openMaps, article => { article.answer[2].go = 105070200; })).toMatch(/answer\[2\]\.go.*練功段/);
    expect(errorsOf(230)).not.toMatch(/\.go/);
    expect(realArticle(230, 31, 50).answer[0].go).toBe(105050200);
  });
  it("go 要是同一段的主推步驟；結論帶去一張、步驟帶去另一張就擋", () => {
    expect(errorsOf(110, {}, openMaps, article => { article.answer[0].go = 106000110; })).toMatch(/answer\[0\]\.go.*步驟/);
  });
  it("主推步驟要涵蓋整段：只有備案的等級擋，講出缺哪幾級", () => {
    expect(errorsOf(420, {}, openMaps, article => { article.steps = article.steps.filter(step => step.alt || step.to < 47); })).toMatch(/steps.*主推.*4[0-9]/);
  });
  it("全部文章都走新規則，沒有名單可以躲", () => {
    expect(errorsOf(110, {}, openMaps, article => { article.answer[0].from = 40; article.answer[0].to = 41; })).toMatch(/answer/);
    expect(errorsOf(110, {}, openMaps, article => { article.answer[1].text = `35～40：${"字".repeat(80)}`; })).toMatch(/70 字/);
  });
  it("僧侶 31～70 結論主推非不死系就擋；標 alt 才能當備案", () => {
    const pig = { text: "31～36：去{{map:101040001}}打{{mob:黑肥肥}}，按魔力爪。", go: 101040001 };
    expect(errorsOf(230, {}, openMaps, article => { Object.assign(article.answer[0], pig); })).toMatch(/answer\[0\].*不死系/);
    expect(errorsOf(230, {}, openMaps, article => { Object.assign(article.answer[0], pig, { alt: true }); })).not.toMatch(/answer\[0\].*不死系/);
    expect(errorsOf(230, {}, openMaps, article => { article.answer[0].text = "31～36：去{{map:101040001}}按魔力爪。"; delete article.answer[0].go; })).toMatch(/answer\[0\].*不死系/);
  });
  it("step 的怪要真的刷在那張圖", () => {
    expect(errorsOf(110, {}, openMaps, article => { article.steps[0].mobs = [byName("天使猴").id]; })).toMatch(/steps\[0\].*天使猴.*沒有刷/);
  });
});

describe("內文的圖名、武器名走代號，關掉、拿掉就擋", () => {
  it("直接打字的完整圖名、武器名擋；來源標題不管", () => {
    expect(errorsOf(110, {}, openMaps, article => { article.intro = "去黑肥肥領土Ⅱ"; })).toMatch(/intro.*\{\{map:/);
    expect(errorsOf(110, {}, openMaps, article => { article.intro = "拿高原之劍"; })).toMatch(/intro.*\{\{weapon:/);
    expect(errorsOf(110, {}, openMaps, article => { article.sources[0].label = "玩家討論：高原之劍、黑肥肥領土Ⅱ"; })).not.toMatch(/sources/);
  });
  it("內文提到的圖關掉了就擋", () => {
    const without = (map: number) => new Set([...openMaps].filter(id => id !== map));
    expect(errorsOf(230, {}, without(103000104))).toMatch(/尚未開放/);
    expect(errorsOf(110, {}, without(101030105))).toMatch(/尚未開放/);
    expect(errorsOf(110, {}, without(107000400))).toMatch(/尚未開放/);
  });
});

describe("連到計算機：開出來的就是表上那組", () => {
  it("parseDamageLink 讀武器、技能、隻數；亂寫不作用", () => {
    expect(parseDamageLink("?job=230&level=40&weapon=1302016&skill=2301002&targets=3")).toEqual({ job: 230, level: 40, weapon: 1302016, skill: 2301002, targets: 3, stats: null });
    expect(parseDamageLink("?job=110&level=40")).toEqual({ job: 110, level: 40, weapon: null, skill: null, targets: null, stats: null });
    expect(parseDamageLink("?job=110&weapon=abc&skill=-1&targets=0")).toEqual({ job: 110, level: null, weapon: null, skill: null, targets: null, stats: null });
  });
  it("手改網址的隻數不是 1～5 的整數當沒帶，不然存檔讀回來會壞、畫面改不動", () => {
    for (const bad of ["999", "6", "2.5", "abc"]) expect(parseDamageLink(`?job=230&skill=${HEAL}&targets=${bad}`)!.targets, bad).toBeNull();
    expect(parseDamageLink(`?job=230&skill=${HEAL}&targets=5`)!.targets).toBe(5);
    const state = applyDamageLink(defaultState(data, 230, 40, null), data, parseDamageLink(`?job=230&skill=${HEAL}&targets=999`));
    expect(parseState(JSON.stringify(state))).not.toBeNull();
  });
  it("別的職業才能拿的武器當沒帶：狂戰士連結帶短杖不會變成算不出來", () => {
    const state = defaultState(data, 110, 40, null);
    expect(applyDamageLink(state, data, parseDamageLink("?job=110&weapon=1372005"))).toBe(state);
  });
  it("5 篇：連結開的計算機，每隻怪的下數都跟表一樣", () => {
    for (const job of FIVE) {
      const article = realArticle(job, 31, 50);
      const table = buildCalcTable({ job, from: 31, to: 50, data, gear: article.gear });
      const link = parseDamageLink(articleDamageHref(table).split("?")[1])!;
      const state = applyDamageLink(defaultState(data, job, link.level!, null), data, link);
      expect(state.groups[0].weaponId, String(job)).toBe(table.assumptions.weapon!.id);
      expect(state.shared.skillId, String(job)).toBe(table.assumptions.skill.id);
      for (const row of table.rows) {
        const monster = data.monsters.find(entry => entry.id === row.id)!;
        const result = computeGroup(data, { ...state.shared, monsterId: row.id }, state.groups[0], monster);
        expect(result.ok && result.vs!.kills.avg, `${job} ${row.name}`).toBe(row.hits);
      }
    }
  }, 120_000);
  it("僧侶的連結帶群體治癒、範圍 3 隻，怪換成不死系", () => {
    const table = buildCalcTable({ job: 230, from: 31, to: 50, data });
    expect(articleDamageHref(table)).toContain(`skill=${HEAL}`);
    expect(articleDamageHref(table)).toContain("targets=3");
    const state = applyDamageLink(defaultState(data, 230, 40, null), data, parseDamageLink(articleDamageHref(table).split("?")[1])!);
    expect(state.shared.targets).toBe(3);
    expect(data.monsters.find(monster => monster.id === state.shared.monsterId)!.und).toBeTruthy();
  });
  it("連結帶的職業不是現在的職業、武器或技能不存在就不動", () => {
    const state = defaultState(data, 410, 40, null);
    expect(applyDamageLink(state, data, { job: 110, level: 40, weapon: 1402006, skill: null, targets: null, stats: null })).toBe(state);
    expect(applyDamageLink(state, data, { job: 410, level: 40, weapon: 999, skill: 999, targets: null, stats: null })).toEqual(state);
    expect(applyDamageLink(state, data, null)).toBe(state);
  });
  it("計算機跟著網址走（站內點連結也讀得到），頁面有 Suspense；不寫回角色", () => {
    const source = fs.readFileSync(`${ROOT}src/app/plan/damage/DamageCalculator.tsx`, "utf8");
    expect(source).toContain("useSearchParams");
    expect(source).not.toContain("window.location.search");
    expect(source).not.toMatch(/localStorage|saveProfile|setProfile/);
    expect(fs.readFileSync(`${ROOT}src/app/plan/damage/page.tsx`, "utf8")).toContain("<Suspense");
  });
  it("頁面：連結文字講開出來的是這組、可以改；結論的帶我去不在字中間斷行", () => {
    const table = buildCalcTable({ job: 230, from: 31, to: 50, data });
    const article = resolveArticle(realArticle(230, 31, 50), table, data);
    const html = renderToString(JobArticleView({ jobName: "僧侶", rangeLabel: "31～50 等", path: "/guides/priest-31-50", jobPath: "/jobs/230", article, table, monsters: new Map(), maps: data.maps, dataNote: "", jsonLd: [] })).replace(/<!-- -->/g, "");
    expect(html).toContain("開計算機改成自己的數值");
    expect(html).not.toContain("用自己的數值算一次");
    const box = html.slice(html.indexOf("先講結論"), html.indexOf("</ol>"));
    expect(box).toMatch(/inline-block[^>]*>帶我去/);
  });
});

/* ------------------------------------------------------------------ v1.49 Google Discover：新網址、大圖、結構化資料、寫手與聲明、放圖 */

const FULL_IMAGES = { hero: { w: 1536, h: 864 }, author: { w: 96, h: 96 }, steps: { "105050000": { w: 240, h: 135 } } };
const ldOf = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(match => JSON.parse(match[1]) as Record<string, unknown>);

describe("網址：/guides/<英文職業>-<起>-<迄>", () => {
  it("全部職業都有 slug、不重複、都是小寫英文", () => {
    const ids = [...JOB_OPTIONS.map(job => job.id), ...ALL_JOBS, 232];
    for (const id of ids) expect(JOB_SLUGS[id], String(id)).toMatch(/^[a-z]+(-[a-z]+)*$/);
    const slugs = Object.values(JOB_SLUGS);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it("拍板的幾個", () => {
    expect(JOB_SLUGS).toMatchObject({ 110: "berserker", 230: "priest", 231: "high-priest", 232: "bishop", 310: "hunter", 410: "assassin", 420: "bandit" });
    expect(articlePath(110, 31, 50)).toBe("/guides/berserker-31-50");
    expect(articleHeroPath("priest-31-50")).toBe("/assets/guides/priest-31-50/hero.jpg");
  });
  it("沒有 slug 的職業直接丟錯，不會做出 undefined-31-50", () => {
    expect(() => articlePath(999, 31, 50)).toThrow(/999/);
  });
  it("舊路由整支搬走了", () => {
    expect(fs.existsSync(`${ROOT}src/app/jobs/[id]/[range]`)).toBe(false);
    expect(fs.existsSync(`${ROOT}src/app/guides/[slug]/page.tsx`)).toBe(true);
  });
  it("畫面的職業頁連結是傳進來的，不是從文章網址切", () => {
    const html = renderToString(JobArticleView({ jobName: "僧侶", rangeLabel: "31～50 等", path: "/guides/priest-31-50", jobPath: "/jobs/230", article: validCleric(), table: buildCalcTable({ job: 230, from: 31, to: 50, data }), monsters: new Map(), maps: data.maps, dataNote: "", jsonLd: [] }));
    expect(html).toMatch(/href="\/jobs\/230"[^>]*>僧侶/);
    expect(html).not.toContain('href="/guides"');
    expect(fs.readFileSync(`${ROOT}src/components/JobArticleView.tsx`, "utf8")).not.toContain("path.slice");
  });
});

describe("Discover 規格", () => {
  const params = { params: Promise.resolve({ slug: "priest-31-50" }) };
  beforeEach(() => {
    mockArticles.keys = [{ job: 230, from: 31, to: 50 }];
    mockArticles.article = validCleric();
    mockArticles.images = { "priest-31-50": FULL_IMAGES };
  });

  it("全站 robots 開大圖預覽", () => {
    expect(SITE_ROBOTS).toMatchObject({ index: true, follow: true, "max-image-preview": "large" });
    expect(fs.readFileSync(`${ROOT}src/app/layout.tsx`, "utf8")).toContain("robots: SITE_ROBOTS");
  });
  it("og、twitter 都用該篇主圖（絕對網址），article 型別、日期", async () => {
    const { generateMetadata } = await import("@/app/guides/[slug]/page");
    const meta = await generateMetadata(params);
    const hero = "https://maplehelper.tw/assets/guides/priest-31-50/hero.jpg";
    expect(meta.openGraph).toMatchObject({ type: "article", publishedTime: "2026-11-04T00:00:00+08:00", modifiedTime: "2026-11-04T00:00:00+08:00", images: [{ url: hero, width: 1536, height: 864, alt: "僧侶在螞蟻洞Ⅰ面對殭屍菇菇" }] });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", title: "僧侶 31～50 等怎麼練", images: [hero] });
  });
  it("還沒有主圖時退回全站預覽圖，不指到不存在的檔案", async () => {
    mockArticles.images = {};
    const { generateMetadata, default: Page } = await import("@/app/guides/[slug]/page");
    const meta = await generateMetadata(params);
    expect(JSON.stringify(meta)).not.toContain("hero.jpg");
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", images: ["/og.jpg"] });
    const html = renderToString(await Page(params));
    expect(html).not.toContain("hero.jpg");
    expect(html).not.toContain("hero.webp");
  });
  it("Article JSON-LD：作者跟發布者是站，不是虛構寫手；放在 body，不進 head", async () => {
    const { default: Page } = await import("@/app/guides/[slug]/page");
    const html = renderToString(await Page(params));
    const ld = ldOf(html).find(entry => entry["@type"] === "Article")!;
    const org = { "@type": "Organization", name: "楓谷幫手", url: "https://maplehelper.tw" };
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      headline: "僧侶 31～50 等怎麼練",
      description: "僧侶 31 到 50 等先打殭屍菇菇，再打天使猴。",
      image: ["https://maplehelper.tw/assets/guides/priest-31-50/hero.jpg"],
      datePublished: "2026-11-04T00:00:00+08:00",
      dateModified: "2026-11-04T00:00:00+08:00",
      author: org,
      publisher: org,
      mainEntityOfPage: { "@type": "WebPage", "@id": "https://maplehelper.tw/guides/priest-31-50" },
    });
    expect(JSON.stringify(ld)).not.toContain("毒舌奶媽");
    expect(ldOf(html).find(entry => entry["@type"] === "WebPage")).toMatchObject({ dateModified: "2026-11-04T00:00:00+08:00" });
    expect(fs.readFileSync(`${ROOT}src/app/guides/[slug]/page.tsx`, "utf8")).not.toContain("staticModified");
  });
  it("articleLd 內容裡的 < 不會把 script 關掉（SeoPage 換掉）", async () => {
    const { SeoPage } = await import("@/components/SeoPage");
    const ld = articleLd({ headline: "</script>", description: "d", path: "/guides/x", images: [], published: "2026-11-04", modified: "2026-11-04" });
    expect(renderToString(SeoPage({ trail: [], title: "t", jsonLd: [ld], children: null }))).not.toContain('"headline":"</script>');
  });
  it("網站地圖：lastmod 讀文章的 updated，有主圖才列圖", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const entry = () => sitemap().find(row => row.url === "https://maplehelper.tw/guides/priest-31-50")!;
    mockArticles.article = { ...validCleric(), updated: "2026-12-01" };
    expect(entry().lastModified).toBe("2026-12-01");
    expect(entry().images).toEqual(["https://maplehelper.tw/assets/guides/priest-31-50/hero.jpg"]);
    mockArticles.images = {};
    expect(entry().images).toBeUndefined();
  });
});

describe("文章新的必填欄位：日期、寫手、主圖替代文字", () => {
  const ctx = { job: 230, from: 31, to: 50, data, openMaps };
  const broken = (change: (article: JobArticle) => void) => {
    const article = validCleric();
    change(article);
    return validateArticle(article, ctx).join("\n");
  };
  it("published、updated 要是真的日期，更新不能早於發布", () => {
    expect(broken(article => { delete (article as Partial<JobArticle>).published; })).toMatch(/published/);
    expect(broken(article => { delete (article as Partial<JobArticle>).updated; })).toMatch(/updated/);
    expect(broken(article => { article.published = "2026-13-40"; })).toMatch(/published/);
    expect(broken(article => { article.updated = "2026-02-30"; })).toMatch(/updated/);
    expect(broken(article => { article.updated = "2026-11-03"; })).toMatch(/updated.*published/);
  });
  it("日期不能是未來（手誤寫錯年月），今天算今天（台灣時間，CI 在 UTC 上跑）", () => {
    vi.useFakeTimers();
    try {
      // 台灣 11/05 01:00，UTC 還是 11/04
      vi.setSystemTime(new Date("2026-11-04T17:00:00Z"));
      expect(broken(article => { article.published = "2026-11-05"; article.updated = "2026-11-05"; })).not.toMatch(/未來/);
      expect(broken(article => { article.updated = "2026-11-06"; })).toMatch(/updated.*未來/);
      expect(broken(article => { article.published = "2027-11-04"; article.updated = "2027-11-04"; })).toMatch(/published.*未來/);
    } finally {
      vi.useRealTimers();
    }
  });
  it("內文不准有真實品牌、站名，也不准講私服；來源網址不算", () => {
    for (const word of ["楓錄", "巴哈", "beanfun", "Artale", "私服"]) {
      expect(broken(article => { article.sections[0].items![0].text += word; }), word).toContain(`不准寫「${word}」`);
      expect(broken(article => { article.sources[0].label += word; }), word).toContain(`不准寫「${word}」`);
    }
    expect(broken(article => { article.sources.push({ label: "官方公告", url: "https://maplestoryclassic-event.beanfun.com/x" }); })).not.toMatch(/不准寫/);
  });
  it("persona 要有 name、line", () => {
    expect(broken(article => { delete (article as Partial<JobArticle>).persona; })).toMatch(/persona/);
    expect(broken(article => { article.persona = { name: "", line: "一句" }; })).toMatch(/persona/);
    expect(broken(article => { article.persona = { name: "奶媽", line: "" }; })).toMatch(/persona/);
  });
  it("heroAlt 必填，地圖跟怪要是主推步驟的", () => {
    expect(broken(article => { delete (article as Partial<JobArticle>).heroAlt; })).toMatch(/heroAlt/);
    expect(broken(article => { article.heroAlt = "僧侶站著"; })).toMatch(/heroAlt/);
    expect(broken(article => { article.heroAlt = "僧侶在{{map:107000403}}面對{{mob:殭屍菇菇}}"; })).toMatch(/heroAlt/);
    expect(broken(article => { article.steps[0].alt = true; })).toMatch(/heroAlt/);
  });
  it("步驟可以標站上計算、遊戲資料；官方公告不行", () => {
    expect(TAG_LABEL.calc).toBe("站上計算");
    expect(broken(article => { article.steps[0].tag = "calc"; })).not.toMatch(/tag/);
    expect(broken(article => { article.steps[0].tag = "game"; })).not.toMatch(/tag/);
    expect(broken(article => { (article.steps[0] as { tag: string }).tag = "official"; })).toMatch(/tag/);
  });
  it("步驟標遊戲資料時，刷怪隻數一樣要走代號", () => {
    expect(broken(article => { article.steps[0].tag = "game"; article.steps[0].text = "這張圖 30 隻。"; })).toMatch(/spawn/);
  });
  it("article:show 看得到日期、寫手、替代文字、網址", () => {
    const text = articleShowText({ job: 230, from: 31, to: 50, article: validCleric(), data, openMaps });
    expect(text).toContain("/guides/priest-31-50");
    expect(text).toContain("2026-11-04");
    expect(text).toContain("毒舌奶媽");
    expect(text).toContain("僧侶在螞蟻洞Ⅰ面對殭屍菇菇");
  });
});

describe("署名區塊跟放圖", () => {
  const table = () => buildCalcTable({ job: 230, from: 31, to: 50, data });
  const props = (images?: ReturnType<typeof articleImages>) => ({ jobName: "僧侶", rangeLabel: "31～50 等", path: "/guides/priest-31-50", jobPath: "/jobs/230", article: resolveArticle(validCleric(), table(), data), table: table(), monsters: new Map(data.monsters.map(monster => [monster.id, monster])), maps: data.maps, dataNote: "", jsonLd: [], images });
  const full = () => articleImages({ "priest-31-50": FULL_IMAGES }, "priest-31-50");
  const clean = (html: string) => html.replace(/<!-- -->/g, "");

  it("署名：站名、發布更新日期、寫手、兩句聲明照寫", () => {
    const raw = renderToString(JobArticleView(props()));
    const html = clean(raw).replace(/<[^>]+>/g, "");
    expect(raw).toMatch(/dateTime="2026-11-04"/i);
    for (const text of ["楓谷幫手", "發布 2026-11-04", "更新 2026-11-04", "本篇寫手：毒舌奶媽", "專講僧侶怎麼用治癒打不死系。", "寫手是站上虛構的角色，數字和來源都查得到。", "文章由 AI 協助整理，計算數字由站上算出，玩家回報都有標明。主圖和路線卡背景由 AI 繪製。"]) expect(html).toContain(text);
  });
  it("順序：主圖、署名、結論", () => {
    const html = clean(renderToString(JobArticleView(props(full()))));
    const order = ["hero.webp", "本篇寫手", "先講結論"].map(text => html.indexOf(text));
    expect(order.every(index => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
  it("主圖：整欄 16:9、優先載入、不 lazy、帶尺寸跟替代文字", () => {
    const hero = /<img[^>]*hero\.webp[^>]*>/.exec(renderToString(JobArticleView(props(full()))))![0];
    expect(hero).toMatch(/fetchPriority="high"/i);
    expect(hero).not.toContain("lazy");
    expect(hero).toContain('width="1536"');
    expect(hero).toContain('height="864"');
    expect(hero).toContain('alt="僧侶在螞蟻洞Ⅰ面對殭屍菇菇"');
    expect(hero).toMatch(/aspect-video/);
    expect(hero).toMatch(/w-full/);
  });
  it("路線卡圖：右側繞文字、lazy、帶尺寸、不糊，替代文字程式組", () => {
    const step = /<img[^>]*105050000\.webp[^>]*>/.exec(renderToString(JobArticleView(props(full()))))![0];
    expect(step).toContain('src="/assets/guides/priest-31-50/105050000.webp"');
    expect(step).toContain('loading="lazy"');
    expect(step).toContain('width="240"');
    expect(step).toContain('height="135"');
    expect(step).toContain('alt="僧侶在螞蟻洞Ⅰ打殭屍菇菇"');
    expect(step).toMatch(/float-right/);
    expect(step).toMatch(/w-\[42%\]/);
    expect(step).toMatch(/rounded/);
    expect(step).toMatch(/image-rendering:pixelated/);
    expect(stepImageAlt("僧侶", "螞蟻洞Ⅰ", "殭屍菇菇")).toBe("僧侶在螞蟻洞Ⅰ打殭屍菇菇");
  });
  it("同一張圖連寫兩步只放第一步，頁面不會連兩張一樣的圖", () => {
    const article = resolveArticle(validCleric(), table(), data);
    const twice = { ...article, steps: [article.steps[0], { ...article.steps[0], from: 45, to: 50 }] };
    const html = renderToString(JobArticleView({ ...props(full()), article: twice }));
    expect(html.match(/105050000\.webp/g)).toHaveLength(1);
  });
  it("標籤跟前面的字隔空白不用 margin：換行到行首才不會內縮", () => {
    const source = fs.readFileSync(`${ROOT}src/components/JobArticleView.tsx`, "utf8");
    expect(source).not.toMatch(/ml-1(\.5)? /);
  });
  it("清單裡沒有的圖不畫（不靠 onerror 藏圖）", () => {
    const html = renderToString(JobArticleView(props(articleImages({ "priest-31-50": { hero: FULL_IMAGES.hero } }, "priest-31-50"))));
    expect(html).toContain("hero.webp");
    expect(html).not.toContain("author.webp");
    expect(html).not.toContain("105050000.webp");
    expect(renderToString(JobArticleView(props()))).not.toContain("/assets/guides/");
    expect(fs.readFileSync(`${ROOT}src/components/JobArticleView.tsx`, "utf8")).not.toContain("onError");
  });
});

describe("圖片防呆 articleImageProblems", () => {
  const article = () => validCleric();
  const entries = () => [{ job: 230, from: 31, to: 50, article: article() }];
  const manifest = () => ({ "priest-31-50": { hero: { w: 1536, h: 864 }, author: { w: 96, h: 96 }, steps: { "105050000": { w: 240, h: 135 }, "107000403": { w: 240, h: 135 } } } }) as ArticleImageManifest;
  const all = () => true;

  it("全部都有就過", () => {
    expect(articleImageProblems(entries(), manifest(), all)).toEqual([]);
  });
  it("清單缺 hero、author、主推步驟的圖都擋；備案步驟不用", () => {
    expect(articleImageProblems(entries(), {}, all).join()).toMatch(/priest-31-50.*清單/);
    const noHero = manifest();
    delete noHero["priest-31-50"].hero;
    expect(articleImageProblems(entries(), noHero, all).join()).toMatch(/hero/);
    const noAuthor = manifest();
    delete noAuthor["priest-31-50"].author;
    expect(articleImageProblems(entries(), noAuthor, all).join()).toMatch(/author/);
    const noStep = manifest();
    delete noStep["priest-31-50"].steps!["107000403"];
    expect(articleImageProblems(entries(), noStep, all).join()).toMatch(/107000403/);
    const alt = article();
    alt.steps[1].alt = true;
    expect(articleImageProblems([{ job: 230, from: 31, to: 50, article: alt }], noStep, all)).toEqual([]);
  });
  it("清單列的檔案要真的存在（hero.webp、hero.jpg 都要）", () => {
    for (const name of ["hero.jpg", "hero.webp", "author.webp", "105050000.webp"]) {
      expect(articleImageProblems(entries(), manifest(), file => !file.endsWith(name)).join()).toContain(name);
    }
  });
  it("主圖寬至少 1200、比例 16:9", () => {
    const narrow = manifest();
    narrow["priest-31-50"].hero = { w: 1024, h: 576 };
    expect(articleImageProblems(entries(), narrow, all).join()).toMatch(/1200/);
    const square = manifest();
    square["priest-31-50"].hero = { w: 1200, h: 1200 };
    expect(articleImageProblems(entries(), square, all).join()).toMatch(/16:9/);
  });
  it("清單裡有文章沒有的 slug 也報（改過網址、舊圖留著）", () => {
    expect(articleImageProblems(entries(), { ...manifest(), "priest-51-70": { hero: { w: 1536, h: 864 } } }, all).join()).toMatch(/priest-51-70/);
  });
});
