/**
 * 真資料常駐檢查：直接讀 public/data，把首頁會出現的每個組合（17 職＋初心者 × Lv.1–100，只算 consistentJob 認可的）
 * 跑一次主推、先解、長線，確認不會出現 final review 抓到的那幾種錯。每天資料自動更新後也跑（.github/workflows/data-refresh.yml），
 * 上游資料變了把畫面弄壞時，自動合併會停下來。
 *
 * 用法：npx vitest run src/lib/__tests__/now-plan-realdata.test.ts
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { JOB_OPTIONS, consistentJob, jobOption, stageJob } from "@/lib/jobs";
import { canGo, effectiveLevels, longRunNow, mainPick, nowQuests, type LongRunTask, type MainPick, type NowQuest } from "@/lib/now-plan";
import { findRoute, suggestStart } from "@/lib/route";
import type { GuideCommon, GuideJob, MapRecord, Meta, Monster, PortalEdge, Quest, TrainingRow } from "@/lib/types";

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const read = <T,>(name: string): T => JSON.parse(fs.readFileSync(`${DATA}${name}`, "utf8")) as T;

type Combo = { job: number; level: number; tag: string; pick?: MainPick; todo: NowQuest[]; longRun: LongRunTask[] };

let combos: Combo[] = [];
let quests: Quest[] = [];
let maps: Record<string, MapRecord> = {};
let graph: Record<string, PortalEdge[]> = {};
let nearestTown: Record<string, [number, number]> = {};
let levelCap = 100;
let effective = new Map<string, number>();

/** 列出前幾個出錯的組合，失敗訊息看得出是誰 */
function expectNone(label: string, bad: string[]) {
  expect(bad, `${label}：${bad.length} 個組合\n${bad.slice(0, 12).join("\n")}`).toEqual([]);
}

beforeAll(() => {
  maps = read("maps.json");
  graph = read("graph.json");
  nearestTown = read("nearest-town.json");
  quests = read("quests.json");
  levelCap = read<Meta>("meta.json").release.levelCap;
  const monsters = read<Monster[]>("monsters.json");
  const training = read<TrainingRow[]>("training.json");
  const common = read<GuideCommon>("guides/common.json");
  const guides = new Map<number, GuideJob>(JOB_OPTIONS.map(option => [option.id, read<GuideJob>(`guides/${option.id}.json`)]));
  effective = effectiveLevels(quests, monsters, common);

  combos = [];
  for (const job of [0, ...JOB_OPTIONS.map(option => option.id)]) {
    for (let level = 1; level <= levelCap; level += 1) {
      if (consistentJob(job, level) !== job) continue;
      const stage = stageJob(job, level);
      combos.push({
        job,
        level,
        tag: `${job === 0 ? "初心者" : jobOption(job)?.name} Lv.${level}`,
        pick: mainPick({ level, job, guide: stage ? guides.get(stage) : undefined, common, training, monsters, maps, graph, nearestTown }),
        todo: nowQuests({ level, job, quests, monsters, common, maps, effective }),
        longRun: longRunNow({ level, job, quests, monsters, common, maps, effective }),
      });
    }
  }
});

describe("真資料：首頁每個組合", () => {
  it("組合數合理（資料沒讀錯）", () => {
    expect(combos.length).toBeGreaterThan(1000);
  });

  it("每個組合都有主推大卡", () => {
    expectNone("沒有主推", combos.filter(combo => !combo.pick).map(combo => combo.tag));
  });

  it("推組隊任務時，範圍在遊戲任務的等級限制內", () => {
    const bad = combos.flatMap(combo => {
      const pick = combo.pick;
      if (pick?.kind !== "pq") return [];
      const quest = quests.find(entry => entry.id === pick.pq.quest);
      const [from, to] = pick.window;
      const low = quest?.minLv ?? 1;
      const high = quest?.maxLv ?? levelCap;
      return !quest || from < low || to > high || combo.level < from || combo.level > to
        ? [`${combo.tag}：${pick.pq.name} ${from}–${to}（遊戲 ${low}–${high}）`]
        : [];
    });
    expectNone("組隊任務範圍超出遊戲限制", bad);
  });

  it("主推卡給「帶我去」時，/go 真的找得到從城鎮走過去的路", () => {
    const bad = combos.flatMap(combo => {
      if (combo.pick?.kind !== "map" || !canGo(combo.pick.option)) return [];
      const target = combo.pick.option.map;
      const start = suggestStart(graph, maps, nearestTown, target);
      return start && findRoute(graph, start, target).ok ? [] : [`${combo.tag}：${combo.pick.option.title}`];
    });
    expectNone("帶我去會找不到起點", bad);
  });

  it("封頂提示不自相矛盾：有提示就比最高圖高 10 級以上；說「已經是最好的」時主推圖跟最高圖差 5 級以內", () => {
    const bad = combos.flatMap(combo => {
      if (combo.pick?.kind !== "map" || !combo.pick.ceiling) return [];
      const { ceiling, option } = combo.pick;
      const problems = [];
      if (combo.level - ceiling.level < 10) problems.push(`等級只比最高圖 Lv.${ceiling.level} 高 ${combo.level - ceiling.level}`);
      if (ceiling.best && !(option.level !== undefined && option.level >= ceiling.level - 5)) problems.push(`說最好但主推 Lv.${option.level}、最高 Lv.${ceiling.level}`);
      return problems.map(problem => `${combo.tag}：${problem}`);
    });
    expectNone("封頂提示自相矛盾", bad);
  });

  it("長線沒有實際等級比玩家高的任務", () => {
    const bad = combos.flatMap(combo => combo.longRun.flatMap(entry =>
      entry.quests
        .filter(id => (effective.get(id) ?? 0) > combo.level)
        .map(id => `${combo.tag}：${entry.n}（任務 ${id} 實際等級 ${effective.get(id)}）`)));
    expectNone("長線有做不動的任務", bad);
  });

  it("先解沒有兩行同名", () => {
    const bad = combos.flatMap(combo => {
      const titles = combo.todo.map(item => item.title);
      const duplicates = [...new Set(titles.filter((title, index) => titles.indexOf(title) !== index))];
      return duplicates.length ? [`${combo.tag}：${duplicates.join("、")}`] : [];
    });
    expectNone("先解有同名的兩行", bad);
  });
});
