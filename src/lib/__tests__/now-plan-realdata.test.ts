/**
 * 真資料常駐檢查：直接讀 public/data，把首頁會出現的每個組合（29 職＋初心者 × Lv.1–120，只算 consistentJob 認可的）
 * 跑一次主推、先解、長線、升級路線每一段的必解，確認不會出現 final review 抓到的那幾種錯（含多升一級主推圖就掉一大截的接縫、任務線跳段）。每天資料自動更新後也跑（.github/workflows/data-refresh.yml），
 * 上游資料變了把畫面弄壞時，自動合併會停下來。
 *
 * 用法：npx vitest run src/lib/__tests__/now-plan-realdata.test.ts
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { COMMON_ROUTE } from "@/lib/guide-data";
import { JOB_OPTIONS, consistentJob, jobOption, stageJob } from "@/lib/jobs";
import {
  bandQuests, canGo, effectiveLevels, laterMaterials, lineFor, longRunNow, mainPick, nowQuests, townRoute,
  type BandQuest, type LongRunTask, type MainPick, type NowQuest,
} from "@/lib/now-plan";
import { LEVEL_CAP } from "@/lib/profile";
import { findRoute, suggestStart } from "@/lib/route";
import { bandsFor, isIslandBand, isIslandMap, spawnIndex, type Material } from "@/lib/route-planner";
import { pickTitle, timelinePlans, type TrainRow } from "@/lib/timeline";
import type { GuideCommon, GuideJob, MapRecord, Meta, Monster, PortalEdge, Quest, TrainingRow } from "@/lib/types";

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const read = <T,>(name: string): T => JSON.parse(fs.readFileSync(`${DATA}${name}`, "utf8")) as T;

type Combo = {
  job: number;
  name: string;
  level: number;
  tag: string;
  pick?: MainPick;
  todo: NowQuest[];
  longRun: LongRunTask[];
  /** 升級路線你在的那一段：標籤、練功第一列、能用的攻略列數、是不是全被擋 */
  active: { label?: string; first?: TrainRow; usable: number; blocked: boolean };
  /** 升級路線每一段的必解（你在的那段照畫面一樣扣掉先解列過的段），activeIndex 是你在的那段 */
  mustDo: BandQuest[][];
  activeIndex: number;
  /** 每一段的「先存著，Lv.N 以後要交」（跟畫面同一個算法：下一段的必解、拿掉先解跟這段必解列過的任務） */
  later: Material[][];
};

/**
 * 主推圖等級跳動的已知例外：查過原因、不是程式錯的才放這裡，key 寫到地圖名，換了圖或等級就不算、照樣擋。
 * 弩弓手 Lv.44→45：攻略 44 起只有跨 16 級的組隊段落（鱷魚潭Ⅱ Lv.49），單人的樹林底層（Lv.33）到 44 剛好過期；
 * 45–50 才有台服實測的單人段落（危險的峽谷 Lv.37），照規格「單人優先、窄段優先」換成它。這是攻略本身的分段。
 */
const KNOWN_DROPS = new Set(["弩弓手 Lv.44→45：鱷魚潭Ⅱ→危險的峽谷"]);

let combos: Combo[] = [];
let quests: Quest[] = [];
let maps: Record<string, MapRecord> = {};
let graph: Record<string, PortalEdge[]> = {};
let nearestTown: Record<string, [number, number]> = {};
let levelCap = 100;
let effective = new Map<string, number>();
let monsterLevels = new Map<number, number>();
/** 給 lineFor 查任務線用（跟 beforeAll 建 combos 那份同一個物件，questLines 的快取才不會白做） */
let common: GuideCommon = { researchedAt: "", builtAt: "", expTable: { toNext: [], conflicts: [], v: "tw", s: [] }, mustDo: [], notWorth: [] };

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
  monsterLevels = new Map(monsters.map(monster => [monster.id, monster.lv ?? 0]));
  const training = read<TrainingRow[]>("training.json");
  common = read<GuideCommon>("guides/common.json");
  const guides = new Map<number, GuideJob>(JOB_OPTIONS.map(option => [option.id, read<GuideJob>(`guides/${option.id}.json`)]));
  effective = effectiveLevels(quests, monsters, common);
  const monsterIndex = new Map(monsters.map(monster => [monster.id, monster]));
  const spawns = spawnIndex(monsters);
  const timelineTraining = training.filter(row => !isIslandMap(row.m));
  const routes = new Map<number, boolean>();
  const canWalk = (map: number) => {
    if (!routes.has(map)) routes.set(map, townRoute(map, graph, maps, nearestTown).hops !== undefined);
    return routes.get(map) as boolean;
  };

  combos = [];
  for (const job of [0, ...JOB_OPTIONS.map(option => option.id)]) {
    for (let level = 1; level <= levelCap; level += 1) {
      if (consistentJob(job, level) !== job) continue;
      const stage = stageJob(job, level);
      const name = job === 0 ? "初心者" : jobOption(job)?.name ?? String(job);
      const pick = mainPick({ level, job, guide: stage ? guides.get(stage) : undefined, common, training, monsters, maps, graph, nearestTown });
      const bands = bandsFor(job);
      const timeline = timelinePlans({
        job, level, bands, guides, monsterIndex, spawns, maps, training: timelineTraining, pqs: common.pq ?? [], pick, canGo: canWalk,
      });
      const shared = { level, job, quests, monsters, common, maps, effective };
      const todo = nowQuests(shared);
      const mustDo = bands.map((band, index) => bandQuests({ ...shared, band, active: index === timeline.activeIndex }));
      // 畫面上下一段的必解是不帶「你在這」的那種（RouteTimeline 的 nextMustDo）
      const plain = bands.map(band => bandQuests({ ...shared, band }));
      combos.push({
        job,
        name,
        level,
        tag: `${name} Lv.${level}`,
        pick,
        todo,
        longRun: longRunNow(shared),
        active: {
          label: timeline.labels[timeline.activeIndex],
          first: timeline.plans[timeline.activeIndex].rows[0],
          usable: timeline.plans[timeline.activeIndex].usable,
          blocked: timeline.plans[timeline.activeIndex].blocked,
        },
        mustDo,
        activeIndex: timeline.activeIndex,
        later: bands.map((_, index) => (index + 1 < bands.length ? laterMaterials({ next: plain[index + 1], listed: [...todo, ...mustDo[index]], monsters }) : [])),
      });
    }
  }
  // 1,400 多個組合全部算一次，機器忙的時候會超過預設的 10 秒
}, 120_000);

describe("真資料：首頁每個組合", () => {
  it("組合數合理（資料沒讀錯）", () => {
    expect(combos.length).toBeGreaterThan(1000);
  });

  it("前端的等級上限跟資料的放行版本一致（V002：120）", () => {
    expect(levelCap).toBe(120);
    expect(LEVEL_CAP).toBe(levelCap);
  });

  it("升級經驗表涵蓋到等級上限前一級（V002：Lv.119 → 120）", () => {
    const toNext = common.expTable.toNext;
    for (let level = 1; level < levelCap; level += 1) expect(toNext[level], `Lv.${level}`).toBeGreaterThan(0);
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

  it("封頂提示寫的等級不比卡上的怪低（不會「最高到 Lv.71」旁邊擺 Lv73 的怪）", () => {
    const bad = combos.flatMap(combo => {
      if (combo.pick?.kind !== "map" || !combo.pick.ceiling) return [];
      const { ceiling, option } = combo.pick;
      const shown = option.mobs.slice(0, 2).map(([id]) => monsterLevels.get(id) ?? 0);
      return shown.some(level => level > ceiling.top) ? [`${combo.tag}：最高到 Lv.${ceiling.top}，卡上的怪 ${shown.join("、")}`] : [];
    });
    expectNone("封頂提示比卡上的怪低", bad);
  });

  it("備案（人多時／有隊友）不比玩家高超過 5 級", () => {
    const bad = combos.flatMap(combo => {
      const alt = combo.pick && combo.pick.kind !== "advance" ? combo.pick.alt : undefined;
      return alt && (alt.level === undefined || alt.level > combo.level + 5) ? [`${combo.tag}：${alt.title} Lv.${alt.level}`] : [];
    });
    expectNone("備案比玩家高超過 5 級", bad);
  });

  it("先存著（Lv.N 以後要交）的材料不會只來自這頁已經列的任務（先解、這段的必解）", () => {
    const bad = combos.flatMap(combo => combo.later.flatMap((materials, index) => {
      const listed = new Set([...combo.todo, ...combo.mustDo[index]].flatMap(item => item.quests.map(entry => entry.id)));
      return materials
        .filter(material => material.quests.every(id => listed.has(id)))
        .map(material => `${combo.tag} 第 ${index + 1} 段：${material.n} ×${material.c}`);
    }));
    expectNone("先存著列到這頁已經列的任務的材料", bad);
  });

  it("同一個任務不會同時算在先解跟長線（長線拿掉先解列過的任務重算）", () => {
    const bad = combos.flatMap(combo => {
      const listed = new Set(combo.todo.flatMap(item => item.quests.map(entry => entry.id)));
      return combo.longRun.flatMap(entry => entry.quests.filter(id => listed.has(id)).map(id => `${combo.tag}：長線「${entry.n}」算到先解的任務 ${id}`));
    });
    expectNone("先解跟長線算到同一個任務", bad);
  });

  it("長線沒有實際等級比玩家高的任務", () => {
    const bad = combos.flatMap(combo => combo.longRun.flatMap(entry =>
      entry.quests
        .filter(id => (effective.get(id) ?? 0) > combo.level)
        .map(id => `${combo.tag}：${entry.n}（任務 ${id} 實際等級 ${effective.get(id)}）`)));
    expectNone("長線有做不動的任務", bad);
  });

  it("同一個職業多升一級，主推圖的等級不會掉超過 10 級（像 Lv.88→89 從 Lv.71 掉回 Lv.49 那種）", () => {
    const bad: string[] = [];
    for (let index = 1; index < combos.length; index += 1) {
      const before = combos[index - 1];
      const after = combos[index];
      if (before.job !== after.job || after.level !== before.level + 1) continue;
      if (before.pick?.kind !== "map" || after.pick?.kind !== "map") continue;
      const from = before.pick.option;
      const to = after.pick.option;
      if (from.level === undefined || to.level === undefined || from.level - to.level <= 10) continue;
      const key = `${after.name} Lv.${before.level}→${after.level}：${from.title}→${to.title}`;
      if (!KNOWN_DROPS.has(key)) bad.push(`${key}（Lv.${from.level} → Lv.${to.level}）`);
    }
    expectNone("主推圖等級多升一級就掉超過 10 級", bad);
  });

  it("升級路線你在的那一段跟主推卡同一個答案：標籤是主推卡的標題，練功第一列是主推本身（地圖／組隊任務入口、範圍、組隊、來源）", () => {
    const bad = combos.flatMap(combo => {
      const pick = combo.pick;
      if (!pick) return [];
      const problems = [];
      if (combo.active.label !== pickTitle(pick)) problems.push(`標籤「${combo.active.label}」≠ 主推「${pickTitle(pick)}」`);
      if (pick.kind === "advance") return problems.map(problem => `${combo.tag}：${problem}`);
      const want = pick.kind === "pq"
        ? { map: pick.pq.entrance, from: pick.window[0], to: pick.window[1], party: true, source: "guide" }
        : { map: pick.option.map, from: pick.option.guide?.from, to: pick.option.guide?.to, party: pick.option.party, source: pick.option.source };
      const first = combo.active.first;
      if (!first) problems.push("練功清單是空的");
      else {
        if (first.map !== want.map) problems.push(`練功第一列是 ${first.map}，主推是 ${want.map}`);
        if (first.from !== want.from || first.to !== want.to) problems.push(`範圍 ${first.from}–${first.to}，主推 ${want.from}–${want.to}`);
        if (first.party !== want.party) problems.push(`組隊 ${first.party}，主推 ${want.party}`);
        if (first.source !== want.source) problems.push(`來源 ${first.source}，主推 ${want.source}`);
        if (first.source === "data" && first.why) problems.push("遊戲資料的列掛了攻略理由");
        // 主推那列是攻略列時，上面不能寫「這段還沒有玩家攻略」或「攻略圖不適合你的職業（見上）」
        if (first.source === "guide" && (combo.active.usable === 0 || combo.active.blocked)) problems.push("主推是攻略列，這段卻說沒有能用的攻略");
      }
      return problems.map(problem => `${combo.tag}：${problem}`);
    });
    expectNone("你在這一段跟主推卡不一樣", bad);
  });

  it("看打法連到懶人包裡那個組隊任務自己的段落（/guide#pq-月妙、超綠）", () => {
    const pqs = read<GuideCommon>("guides/common.json").pq ?? [];
    const sections = new Set(COMMON_ROUTE.flatMap(step => (step.pq ? [`/guide#pq-${step.pq}`] : [])));
    const bad = pqs.filter(pq => pq.guide !== `/guide#pq-${pq.key}` || !sections.has(pq.guide)).map(pq => `${pq.name}：${pq.guide}`);
    expectNone("看打法連不到該組隊任務的段落", bad);
  });

  it("還在楓之島、8 等前的初心者，先解沒有維多利亞島的任務（離島前去不了）", () => {
    const bad = combos.flatMap(combo => {
      if (combo.job !== 0 || combo.level >= 8) return [];
      return combo.todo
        .filter(item => item.npc?.map !== undefined && !isIslandMap(item.npc.map))
        .map(item => `${combo.tag}：${item.title}（${item.npc?.mapName ?? item.npc?.map}）`);
    });
    expectNone("島上的初心者看到維多利亞島的任務", bad);
  });

  it("先解沒有兩行同名", () => {
    const bad = combos.flatMap(combo => {
      const titles = combo.todo.map(item => item.title);
      const duplicates = [...new Set(titles.filter((title, index) => titles.indexOf(title) !== index))];
      return duplicates.length ? [`${combo.tag}：${duplicates.join("、")}`] : [];
    });
    expectNone("先解有同名的兩行", bad);
  });

  it("先解跟每一段的必解，每一列的段都連在一起（不跳段），NPC 是列出的第一段的起始 NPC", () => {
    // positions／firstPart／lastPart／npc 都是 lineItems 自己算出來的，拿來跟自己比對永遠會過（round4-rereview M1）。
    // 改成用 lineFor 查這條線真正的完整順序（跟畫面同一份 questLines 快取），重新找每個任務在線上的段號當獨立答案。
    const realPositions = (line: Quest[], parts: Quest[]): number[] => parts.map(quest => line.findIndex(entry => entry.id === quest.id) + 1);
    const check = (tag: string, where: string, item: NowQuest, stage: number): string[] => {
      const line = lineFor(stage, item.key, quests, common, maps, effective);
      if (!line) return [`${tag} ${where}「${item.title}」查不到任務線 ${item.key}`];
      const positions = realPositions(line, item.quests);
      const problems: string[] = [];
      const contiguous = positions.every(part => part > 0) && positions.every((part, index) => index === 0 || part === positions[index - 1] + 1);
      const matches = contiguous && positions[0] === item.firstPart && positions[positions.length - 1] === item.lastPart && item.lastPart <= item.totalParts;
      if (!matches) problems.push(`${tag} ${where}「${item.title}」寫第 ${item.positions.join("、")} 段，線上實際是第 ${positions.join("、")} 段（共 ${line.length} 段）`);
      const realNpc = line[positions[0] - 1]?.sNpc;
      if (item.npc?.id !== realNpc?.id || item.npc?.map !== realNpc?.map) problems.push(`${tag} ${where}「${item.title}」NPC ${item.npc?.n} ≠ 線上第一段的 ${realNpc?.n}`);
      return problems;
    };
    const bad = combos.flatMap(combo => [
      ...combo.todo.flatMap(item => check(combo.tag, "先解", item, stageJob(combo.job, combo.level))),
      ...combo.mustDo.flatMap((rows, index) => {
        const band = bandsFor(combo.job)[index];
        const stage = isIslandBand(band) ? 0 : stageJob(combo.job, band.from);
        return rows.flatMap(item => check(combo.tag, `必解第 ${index + 1} 段`, item, stage));
      }),
    ]);
    expectNone("任務線跳段或 NPC 不是第一段的", bad);
  });

  it("同一段任務不會同時列在先解跟你在的那一段的必解", () => {
    const bad = combos.flatMap(combo => {
      const listed = new Set(combo.todo.flatMap(item => item.quests.map(entry => entry.id)));
      return combo.mustDo[combo.activeIndex].flatMap(item =>
        item.quests.filter(entry => listed.has(entry.id)).map(entry => `${combo.tag}：「${item.title}」的 ${entry.n}`));
    });
    expectNone("先解跟你在的那一段的必解重複", bad);
  });

  it("先解每一列都從那條線的第一段開始（第一段現在做不到就不列，不會寫「第 3 段」）", () => {
    const bad = combos.flatMap(combo => combo.todo
      .filter(item => item.firstPart !== 1)
      .map(item => `${combo.tag}：「${item.title}」第 ${item.firstPart}–${item.lastPart} 段`));
    expectNone("先解沒從第一段開始", bad);
  });

  it("寫了關鍵獎勵的列，列出的段裡有給那個獎勵的那一段（研究檔沒寫道具的看推薦的任務）", () => {
    const check = (tag: string, where: string, item: NowQuest): string[] => {
      if (!item.reward || !item.rec?.reward) return [];
      const wanted = item.rec.reward.items ?? [];
      const gives = item.quests.some(entry => (entry.rewardItems ?? []).some(reward => wanted.includes(reward.id)));
      const fallback = !wanted.length && item.quests.some(entry => entry.id === item.rec?.q);
      return gives || fallback ? [] : [`${tag} ${where}「${item.title}」寫「${item.reward}」，列的是第 ${item.firstPart}–${item.lastPart} 段`];
    };
    const bad = combos.flatMap(combo => [
      ...combo.todo.flatMap(item => check(combo.tag, "先解", item)),
      ...combo.mustDo.flatMap((rows, index) => rows.flatMap(item => check(combo.tag, `必解第 ${index + 1} 段`, item))),
    ]);
    expectNone("獎勵標籤沒列到給獎勵的那一段", bad);
  });

  it("冒險家的戒指在先解是整條線（別條線也要交樹枝不會把它切斷）", () => {
    const rings = combos.flatMap(combo => combo.todo.filter(item => item.key === "rec:69039").map(item => ({ combo, item })));
    expect(rings.length).toBeGreaterThan(0);
    const bad = rings.filter(({ item }) => item.firstPart !== 1 || item.lastPart !== item.totalParts)
      .map(({ combo, item }) => `${combo.tag}：第 ${item.firstPart}–${item.lastPart} 段／共 ${item.totalParts} 段`);
    expectNone("戒指沒有整條", bad);
  });

  it("每一段的必解，每一列要嘛從那條線的第一段開始，要嘛接在同一條線先解那列的下一段（不會只寫「伊卡路斯 第 3–4 段」）", () => {
    const bad = combos.flatMap(combo => combo.mustDo.flatMap((rows, index) => rows.flatMap(item => {
      const todo = combo.todo.find(entry => entry.key === item.key);
      return item.firstPart === 1 || (todo && item.firstPart === todo.lastPart + 1)
        ? []
        : [`${combo.tag} 必解第 ${index + 1} 段「${item.title}」第 ${item.firstPart}–${item.lastPart} 段`];
    })));
    expectNone("必解沒從第一段開始、也不是接在先解後面", bad);
  });

  it("先解列過的線，你在的那一段的必解只接在先解那串的下一段（同一頁不跳段：不會先解第 1–16 段、必解第 18–52 段）", () => {
    const bad = combos.flatMap(combo => combo.mustDo[combo.activeIndex].flatMap(item => {
      const todo = combo.todo.find(entry => entry.key === item.key);
      return todo && item.firstPart !== todo.lastPart + 1 ? [`${combo.tag}：「${item.title}」先解第 ${todo.firstPart}–${todo.lastPart} 段、必解第 ${item.firstPart}–${item.lastPart} 段`] : [];
    }));
    expectNone("你在的那一段沒接在先解的下一段", bad);
  });
});
