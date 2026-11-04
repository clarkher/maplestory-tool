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
import { dataSyncedText } from "@/lib/format";
import { BOSS_SPAWN_MAX } from "@/lib/now-plan";
import { computeGroup, defaultState, HEAL_ASSUMPTION, type CalcData } from "@/lib/damage-view";
import type { GearData } from "@/lib/gear";
import {
  articleEligible,
  articleGuides,
  articlePath,
  articleRanges,
  assumptionLines,
  buildCalcTable,
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
  type JobArticle,
} from "@/lib/job-article";
import { undeadOnlyStage } from "@/lib/job-rules";
import type { GuideCommon, GuideJob, MapRecord, Meta, Monster, Skill, TrainingRow } from "@/lib/types";

// 頁面、網站地圖、llms.txt 讀的文章清單換成這裡的假資料；掃真檔那段用 importActual
const mockArticles = vi.hoisted(() => ({
  keys: [] as Array<{ job: number; from: number; to: number }>,
  article: undefined as unknown,
}));
vi.mock("@/lib/static-data", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/static-data")>()),
  staticJobArticleKeys: () => mockArticles.keys,
  staticJobArticleRanges: (job: number) => mockArticles.keys.filter(key => key.job === job),
  staticJobArticle: () => mockArticles.article,
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
  it("網址跟檔名：/jobs/230/31-50、230-31-50.json", () => {
    expect(articlePath(230, 31, 50)).toBe("/jobs/230/31-50");
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
    const resolved = resolveArticle(validCleric(), table);
    expect(JSON.stringify(resolved)).not.toContain("{{");
    expect(resolved.answer[0].text).toContain(String(row.hits));
  });
});

/** 一篇合格的僧侶 31～50：全部欄位都用真資料填，每個防呆測試改壞一個地方 */
function validCleric(): JobArticle {
  const monkey = byName("天使猴").id;
  const zombie = byName("殭屍菇菇").id;
  return {
    title: "僧侶 31～50 等怎麼練",
    description: "僧侶 31 到 50 等先打{{mob:殭屍菇菇}}，再打{{mob:天使猴}}。",
    answer: [
      { text: `{{mob:天使猴}}打 {{hits:${monkey}}} 下、{{hitLv:${monkey}}} 等不 MISS`, tag: "calc" },
      { text: "40 等把群體治癒點滿", tag: "tw" },
    ],
    intro: "僧侶這段靠群體治癒打不死系。",
    steps: [
      { from: 31, to: 35, kind: "party", map: 105050000, mobs: [zombie], title: "螞蟻洞Ⅰ：{{mob:殭屍菇菇}}", text: "魔防低。", tag: "tw" },
      { from: 40, to: 50, kind: "party", map: 107000403, mobs: [monkey], title: "猴子沼澤地Ⅲ：{{mob:天使猴}}", text: "主線。", tag: "tw" },
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
      return validateArticle(article, { job: 231, from: 71, to: 90, data, openMaps }).join("\n");
    };
    expect(priest(secondOnly.map!)).not.toMatch(/攻略/);
  });
  it("尚未開放不准當推薦：地圖不在已開放清單，或等級重疊的 notOpenYet 寫了這張圖", () => {
    expect(broken(article => { article.steps[0].map = 105050000; }, { ...ctx, openMaps: new Set([107000403]) })).toMatch(/尚未開放/);
    const stale = { ...guides, 230: { ...guides[230]!, notOpenYet: [{ from: 30, to: 40, place: "螞蟻洞Ⅰ 還沒開", s: [] }] } };
    expect(broken(() => {}, { ...ctx, data: { ...data, guides: stale } })).toMatch(/尚未開放/);
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
    expect(broken(() => {}, { ...ctx, job: 210 })).toMatch(/門檻/);
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
    expect(broken(article => { article.intro = "去猴子森林Ⅱ、猴子沼澤地Ⅲ、鱷魚潭"; })).toEqual("");
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
    expect(broken(article => { article.steps[0].from = 36; })).toMatch(/範圍/);
  });
  it("來源等級只能是講好的那幾種；步驟不能標站上計算", () => {
    expect(broken(article => { (article.steps[0] as { tag: string }).tag = "calc"; })).toMatch(/tag/);
    expect(broken(article => { (article.answer[0] as { tag?: string }).tag = "亂寫"; })).toMatch(/tag/);
    expect(broken(article => { (article.sections[0].items![0] as { tag?: string }).tag = "亂寫"; })).toMatch(/tag/);
  });
  it("每一條都要標來源等級（段落、條列也是）；遊戲資料、官方公告有自己的標籤", () => {
    expect(broken(article => { delete (article.sections[0].items![0] as { tag?: string }).tag; })).toMatch(/items\[0\].*tag/);
    expect(broken(article => { delete (article.sections[0].paragraphs![0] as { tag?: string }).tag; })).toMatch(/paragraphs\[0\].*tag/);
    expect(TAG_LABEL.game).toBe("遊戲資料");
    expect(TAG_LABEL.official).toBe("官方公告");
    expect(broken(article => { (article.steps[0] as { tag: string }).tag = "game"; })).toMatch(/tag/);
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
    article.steps = [{ from: 31, to: 35, kind: "solo", map: assassin[0].map!, mobs: assassin[0].mobs, title: "圖", text: "字", tag: "tw" }];
    article.answer = [{ text: "一", tag: "tw" }, { text: "二", tag: "tw" }];
    article.sources = [{ label: "來源", url: assassin[0].s[0] }];
    article.description = "刺客。";
    article.steps[0].title = "圖";
    article.sections = [];
    article.assumes = tableAssumes(buildCalcTable({ job: 410, from: 31, to: 50, data }));
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
  const params = (range: string) => ({ params: Promise.resolve({ id: "230", range }) });
  beforeEach(() => {
    mockArticles.keys = [key];
    mockArticles.article = validCleric();
  });

  it("只出有檔案的範圍；沒有檔案的範圍 404", async () => {
    const { default: Page, dynamicParams, generateStaticParams } = await import("@/app/jobs/[id]/[range]/page");
    expect(dynamicParams).toBe(false);
    expect(generateStaticParams()).toEqual([{ id: "230", range: "31-50" }]);
    mockArticles.article = undefined;
    await expect(Page(params("31-50"))).rejects.toThrow();
  });

  it("標題、描述、canonical、openGraph", async () => {
    const { generateMetadata } = await import("@/app/jobs/[id]/[range]/page");
    const meta = await generateMetadata(params("31-50"));
    expect(meta.title).toBe("僧侶 31～50 等怎麼練");
    expect(meta.description).toBe("僧侶 31 到 50 等先打殭屍菇菇，再打天使猴。");
    expect(meta.alternates?.canonical).toBe("/jobs/230/31-50");
    expect(meta.openGraph?.url).toBe("/jobs/230/31-50");
    expect(meta.openGraph?.title).toContain("僧侶 31～50 等怎麼練");
    // 頁面的 openGraph 會整包蓋掉 layout：分享要有預覽圖
    expect(meta.openGraph).toMatchObject({ siteName: "楓谷幫手", type: "website", locale: "zh_TW", images: [{ url: "/og.jpg" }] });
  });

  it("畫面：結論、步驟、計算表、假設、來源標籤、來源清單、連結都在；代號都換掉了", async () => {
    const { default: Page } = await import("@/app/jobs/[id]/[range]/page");
    const html = renderToString(await Page(params("31-50")));
    const table = buildCalcTable({ job: 230, from: 31, to: 50, data });
    expect(html).not.toContain("{{");
    expect(html).toContain("先講結論");
    // 表上的數字是新資料算的：寫同步時間（跟頁尾同一個），不寫上游的產生時間，也不給玩家看 GMT+8
    const meta = read<Meta>("meta.json");
    expect(html.replace(/<!-- -->/g, "")).toContain(`依遊戲資料 ${meta.gameVersion}（${dataSyncedText(meta).slice(0, 10)}）計算`);
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
    expect(html).toContain('href="/plan/damage"');
    expect(html).toContain('href="/plan/train"');
    expect(html).toContain('href="https://forum.gamer.com.tw/C.php?bsn=85994&amp;snA=1291"');
    // 結構化資料在 article 外的 body 裡（SeoPage 放的），不是 head
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('"@type":"WebPage"');
    expect(html).toContain("https://maplehelper.tw/jobs/230/31-50");
    // 不准有 emoji
    expect(html).not.toMatch(/[\u2300-\u23FF\u25A0-\u25FF\u2600-\u27BF]|[\u{1F300}-\u{10FFFF}]/u);
  });

  it("文章裡代號換不掉，整頁建不起來（不會把代號原文放上線）", async () => {
    const { default: Page } = await import("@/app/jobs/[id]/[range]/page");
    const bad = validCleric();
    bad.intro = "{{hits:999999999}}";
    mockArticles.article = bad;
    await expect(Page(params("31-50"))).rejects.toThrow(/999999999/);
  });

  it("手機：站上算的數字排在最前面、第一欄固定、有往右滑的提示", async () => {
    const { JobArticleTable } = await import("@/components/JobArticleView");
    const table = buildCalcTable({ job: 230, from: 31, to: 50, data });
    const html = renderToString(JobArticleTable({ table }));
    const head = html.slice(html.indexOf("<thead"), html.indexOf("</thead>"));
    const order = ["打 1 隻", "範圍 3 隻", "幾等不 MISS", "等級", "HP", "魔防", "經驗"].map(text => head.indexOf(text));
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
    expect(shown).toContain('href="/jobs/230/31-50"');
    expect(shown).not.toContain('href="/jobs/230/51-70"');
    mockArticles.keys = [];
    const hidden = renderToString(await JobPage({ params: Promise.resolve({ id: "230" }) }));
    expect(hidden).not.toContain("分等級攻略");
  });

  it("網站地圖列這些頁、沒有文章就不列；llms.txt 不多開一區（規格沒拍板）", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const { GET } = await import("@/app/llms.txt/route");
    const urls = sitemap().map(entry => entry.url);
    expect(urls).toContain("https://maplehelper.tw/jobs/230/31-50");
    expect(await GET().text()).not.toContain("/jobs/230/31-50");
    mockArticles.keys = [];
    expect(sitemap().map(entry => entry.url).some(url => /\/jobs\/\d+\/\d+-\d+/.test(url))).toBe(false);
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
    const html = renderToString(JobArticleView({ jobName: "僧侶", rangeLabel: "31～50 等", path: "/jobs/230/31-50", article, table: buildCalcTable({ job: 230, from: 31, to: 50, data }), monsters: new Map(), maps: {}, dataNote: "", jsonLd: [] }));
    const box = html.slice(html.indexOf("先講結論"), html.indexOf("</ol>"));
    expect(box).toContain("社群整理");
    expect(box).not.toContain("--maple-wash");
    expect(box).toContain("bg-[color:var(--paper)]");
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
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];

  it("檔名都是 <職業>-<起>-<迄>.json，而且是拍板的範圍", () => {
    for (const file of files) {
      const key = parseArticleFile(file);
      expect(key, file).not.toBeNull();
      expect(articleRanges(key!.job), file).toContainEqual({ from: key!.from, to: key!.to });
    }
  });

  it("每一篇都過 validateArticle，也換得掉代號", async () => {
    const actual = await vi.importActual<typeof import("@/lib/static-data")>("@/lib/static-data");
    expect(actual.staticJobArticleKeys().length).toBe(files.length);
    for (const { job, from, to } of actual.staticJobArticleKeys()) {
      const article = actual.staticJobArticle(job, from, to);
      expect(article, `${job}-${from}-${to}`).toBeDefined();
      expect(validateArticle(article, { job, from, to, data, openMaps }), `${job}-${from}-${to}`).toEqual([]);
      expect(() => resolveArticle(article!, buildCalcTable({ job, from, to, data }))).not.toThrow();
    }
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
