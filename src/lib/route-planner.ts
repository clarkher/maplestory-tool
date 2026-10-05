import { advancementLevel, stageJob } from "./jobs";
import { jobLineage, planTraining, questEligible } from "./planner";
import type { GuideCommon, GuideJob, GuideMustDo, GuideTrain, MapRecord, Monster, Quest, TrainingRow, Verified } from "./types";

type MapNames = Record<string, Pick<MapRecord, "zh">>;

/* ------------------------------------------------------------------ 等級段 */

/** 等級段，from 含、to 不含（最後一段含 100） */
export type Band = { from: number; to: number };

/**
 * 路線切成 8 段：楓之島、一轉到月妙畢業、超綠、之後每 10 級、70 以上一段。
 * 前三段跟玩家實際的分水嶺對齊（轉職、月妙 21 等上限、超綠 30 等二轉）；
 * 30 以後的攻略本身就是每 5~10 級換一張圖，用 10 級一段剛好。
 */
export function bandsFor(job: number): Band[] {
  const start = advancementLevel(job);
  return [
    { from: 1, to: start },
    { from: start, to: 21 },
    { from: 21, to: 30 },
    { from: 30, to: 40 },
    { from: 40, to: 50 },
    { from: 50, to: 60 },
    { from: 60, to: 70 },
    { from: 70, to: 100 },
  ];
}

/** 第一段是楓之島（初心者），其他段都已經轉職 */
export function isIslandBand(band: Band): boolean {
  return band.from <= 1;
}

export function bandOf(bands: Band[], level: number): Band {
  if (level <= bands[0].from) return bands[0];
  return bands.find(band => level >= band.from && level < band.to) ?? bands[bands.length - 1];
}

export const VERIFIED_RANK: Record<Verified, number> = { tw: 0, community: 1, legacy: 2 };

/** 攻略的等級區間是含頭含尾的（30–35），段落是含頭不含尾 */
function overlap(band: Band, from: number, to: number): number {
  return Math.min(band.to, to + 1) - Math.max(band.from, from);
}

/** 跟這段等級重疊的玩家推薦練功點，重疊越多、越是台服實測的排前面 */
export function trainingForBand(band: Band, train: GuideTrain[]): GuideTrain[] {
  return train
    .map(segment => ({ segment, size: overlap(band, segment.from, segment.to) }))
    .filter(entry => entry.size > 0)
    .sort((a, b) => b.size - a.size || VERIFIED_RANK[a.segment.v] - VERIFIED_RANK[b.segment.v])
    .map(entry => entry.segment);
}

/** 攻略地名常帶括號註記（會掉什麼），當段落標題時拿掉 */
export function shortName(name: string): string {
  return name.replace(/[（(][^）)]*[）)]/g, "").trim();
}

export function bandLabel(band: Band, train: GuideTrain[]): string | undefined {
  const top = trainingForBand(band, train)[0];
  return top ? shortName(top.name) || undefined : undefined;
}

/* ------------------------------------------------------------------ 去得了、接得到 */

/** 楓之島（含彩虹之地）的地圖 id 都在 200 萬以下 */
const ISLAND_MAX = 2000000;

export function isIslandMap(map: number): boolean {
  return map < ISLAND_MAX;
}

/**
 * 還沒轉職、10 等前都還在楓之島（選了職業但還沒到轉職等級也一樣）；
 * 離島之後回不去，所以其他人也不推島上的圖。
 */
export function onIsland(job: number, level: number): boolean {
  return stageJob(job, level) === 0 && level < 10;
}

/**
 * 起始 NPC 站在未開放地圖、或資料裡根本沒有位置的任務不推薦。
 * 實際例子：菇菇王國整條線（警衛隊長沒有地圖）、瑪迦提亞的羅密歐與茱麗葉——
 * 客戶端有這些任務，但玩家現在找不到人接。
 */
export function questReachable(quest: Quest, maps: MapNames): boolean {
  if (!quest.sNpc) return true;
  const map = quest.sNpc.map;
  return map !== undefined && Boolean(maps[String(map)]?.zh);
}

/* ------------------------------------------------------------------ 任務線 */

export type QuestGroup = { key: string; title: string; quests: Quest[]; exp: number };

/**
 * 把同一條任務線收成一組，免得「冒險家的戒指」九段把整個清單洗版。
 * 名稱帶【任務線】前綴的用前綴分；其餘沿著前置任務往回找到這批任務裡的源頭。
 */
export function groupQuests(quests: Quest[]): QuestGroup[] {
  const byId = new Map(quests.map(quest => [quest.id, quest]));
  const rootOf = (quest: Quest): string => {
    const line = quest.n.match(/^\[([^\]]+)\]/);
    if (line) return `line:${line[1].trim()}`;
    let current = quest;
    const seen = new Set<string>();
    while (!seen.has(current.id)) {
      seen.add(current.id);
      const previous = current.pre?.map(id => byId.get(id)).find(Boolean);
      if (!previous) break;
      current = previous;
    }
    return `chain:${current.id}`;
  };

  const groups = new Map<string, QuestGroup>();
  for (const quest of quests) {
    const key = rootOf(quest);
    const group = groups.get(key) ?? { key, title: "", quests: [], exp: 0 };
    group.quests.push(quest);
    group.exp += quest.exp ?? 0;
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.title = group.key.startsWith("line:")
      ? group.key.slice(5)
      : [...group.quests].sort((a, b) => (b.exp ?? 0) - (a.exp ?? 0))[0].n;
  }
  return [...groups.values()];
}

/* ------------------------------------------------------------------ 經驗 */

/**
 * 這筆經驗大約能升幾級（從該等級剛升上來算起）。
 * 超過一級要逐級累算：低等時一個任務就能連升好幾級，直接除會把 1,145 經驗算成 8.5 級。
 */
export function levelFraction(exp: number, level: number, toNext: number[]): number {
  if (level >= toNext.length) return 0;
  let current = Math.min(Math.max(Math.floor(level), 1), toNext.length - 1);
  let left = exp;
  let levels = 0;
  while (left > 0 && toNext[current]) {
    if (left < toNext[current]) return levels + left / toNext[current];
    left -= toNext[current];
    levels += 1;
    if (current < toNext.length - 1) current += 1;
  }
  return levels;
}

/* ------------------------------------------------------------------ 怪物與掉落索引 */

export function dropIndex(monsters: Monster[]): Map<number, Set<number>> {
  return new Map(monsters.map(monster => [monster.id, new Set(monster.drops)]));
}

/** 地圖 → [怪物, 刷怪點數] */
export function spawnIndex(monsters: Monster[]): Map<number, Array<[number, number]>> {
  const index = new Map<number, Array<[number, number]>>();
  for (const monster of monsters) {
    for (const [map, count] of monster.sp ?? []) {
      const list = index.get(map) ?? [];
      list.push([monster.id, count]);
      index.set(map, list);
    }
  }
  for (const list of index.values()) list.sort((a, b) => b[1] - a[1]);
  return index;
}

function droppersOf(itemId: number, monsters: Monster[]): number[] {
  return monsters.filter(monster => monster.drops.includes(itemId)).map(monster => monster.id).sort((a, b) => a - b);
}

/**
 * 這個任務能不能整個在這張圖完成：要打的怪都在、要交的道具都由這張圖的怪掉。
 * 只差一樣就不算——寫「順便完成」卻還得跑別張圖，等於騙人。
 */
export function questDoableAt(quest: Quest, mobsOnMap: Set<number>, drops: Map<number, Set<number>>): boolean {
  const mobs = quest.needMobs ?? [];
  const items = quest.needItems ?? [];
  if (!mobs.length && !items.length) return false;
  if (!mobs.every(mob => mobsOnMap.has(mob.id))) return false;
  return items.every(item => [...mobsOnMap].some(mob => drops.get(mob)?.has(item.id)));
}

/* ------------------------------------------------------------------ 材料 */

export type Material = { id: number; n: string; c: number; quests: string[]; droppers: number[] };

/** 把幾個任務要交的道具加總，附上哪些怪會掉。 */
export function prepMaterials(quests: Quest[], monsters: Monster[]): Material[] {
  const byItem = new Map<number, Material>();
  for (const quest of quests) {
    for (const item of quest.needItems ?? []) {
      const entry = byItem.get(item.id) ?? { id: item.id, n: item.n, c: 0, quests: [], droppers: droppersOf(item.id, monsters) };
      entry.c += item.c ?? 1;
      if (!entry.quests.includes(quest.id)) entry.quests.push(quest.id);
      byItem.set(item.id, entry);
    }
  }
  return [...byItem.values()];
}

export type LongRun = Material & { exp: number };

/** 同一道具總共要收 min 個以上的任務群（例如詛咒娃娃 100/200/400/600/1000）。 */
export function longRunQuests(quests: Quest[], monsters: Monster[], min = 200): LongRun[] {
  const totals = new Map<number, LongRun>();
  for (const material of prepMaterials(quests, monsters)) {
    const exp = quests.filter(quest => material.quests.includes(quest.id)).reduce((sum, quest) => sum + (quest.exp ?? 0), 0);
    totals.set(material.id, { ...material, exp });
  }
  return [...totals.values()].filter(entry => entry.c >= min).sort((a, b) => b.c - a.c);
}

/**
 * 拿掉長線收集的任務（同一道具總共要收 min 個以上，例如詛咒娃娃 2,300 個）。
 * 這種要刷好幾天的不能算「這趟順便完成」，它們另外列在長線區。
 */
export function withoutLongRun(quests: Quest[], monsters: Monster[], min = 200): Quest[] {
  const heavy = new Set(longRunQuests(quests, monsters, min).map(entry => entry.id));
  return quests.filter(quest => !(quest.needItems ?? []).some(item => heavy.has(item.id)));
}

/* ------------------------------------------------------------------ 必解任務 */

export type MustDoPick = { quest: Quest; level: number; fraction: number; rec?: GuideMustDo };

export type MustDoGroup = {
  key: string;
  title: string;
  picks: MustDoPick[];
  exp: number;
  /** 整組經驗等於幾級 */
  fraction: number;
  /** 最早能接的等級 */
  level: number;
  rec?: GuideMustDo;
};

/** 研究裡的建議等級是文字（「15 起接，25／35／40 各解一段」），取第一個數字 */
function recommendedLevel(rec: GuideMustDo | undefined): number | undefined {
  const match = rec?.lv.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

export function mustDoIndex(common: GuideCommon): Map<string, GuideMustDo> {
  const index = new Map<string, GuideMustDo>();
  for (const rec of common.mustDo) {
    for (const id of [rec.q, ...rec.chain]) if (!index.has(id)) index.set(id, rec);
  }
  return index;
}

/**
 * 這一段新解鎖、值得解的任務，同一條任務線收成一組。
 * 排序看「這筆經驗等於幾級」，社群公認必解的再加權——
 * 玩家推薦的理由常常不只經驗（送裝備、卷軸、前置），只看經驗會漏掉。
 */
export function mustDoForBand(
  band: Band,
  job: number,
  quests: Quest[],
  common: GuideCommon,
  maps: MapNames,
  limit = 5,
): MustDoGroup[] {
  const stage = isIslandBand(band) ? 0 : stageJob(job, band.from);
  const lineage = new Set(jobLineage(stage));
  const recs = mustDoIndex(common);
  const toNext = common.expTable.toNext;

  const picks = new Map<string, MustDoPick>();
  for (const quest of quests) {
    if (!quest.exp || !questReachable(quest, maps)) continue;
    const rec = recs.get(quest.id);
    const level = quest.minLv ?? recommendedLevel(rec);
    if (level === undefined || level < band.from || level >= band.to) continue;
    if (quest.jobs?.length && !quest.jobs.some(code => lineage.has(code))) continue;
    if (quest.island && !isIslandBand(band)) continue;
    picks.set(quest.id, { quest, level, fraction: levelFraction(quest.exp, Math.max(level, band.from), toNext), rec });
  }

  const groups: MustDoGroup[] = groupQuests([...picks.values()].map(pick => pick.quest)).map(group => {
    const members = group.quests.map(quest => picks.get(quest.id) as MustDoPick);
    return {
      key: group.key,
      title: group.title,
      picks: members.sort((a, b) => a.level - b.level || b.fraction - a.fraction),
      exp: group.exp,
      fraction: members.reduce((sum, pick) => sum + pick.fraction, 0),
      level: Math.min(...members.map(pick => pick.level)),
      rec: members.find(pick => pick.rec)?.rec,
    };
  });
  const score = (group: MustDoGroup) => group.fraction + (group.rec ? 0.15 : 0);
  return groups.sort((a, b) => score(b) - score(a)).slice(0, limit);
}

/* ------------------------------------------------------------------ 今天跑這幾趟 */

export type TripTag = "fast" | "quests" | "players" | "alt";

export function mergeTrips(candidates: Array<{ map: number; tag: TripTag }>, limit = 3): Array<{ map: number; tags: TripTag[] }> {
  const merged: Array<{ map: number; tags: TripTag[] }> = [];
  for (const candidate of candidates) {
    const existing = merged.find(entry => entry.map === candidate.map);
    if (existing) {
      if (!existing.tags.includes(candidate.tag)) existing.tags.push(candidate.tag);
    } else if (merged.length < limit) {
      merged.push({ map: candidate.map, tags: [candidate.tag] });
    }
  }
  return merged;
}

export type Trip = {
  map: number;
  tags: TripTag[];
  /** 遊戲資料的練功數字；不在練功排行裡的圖沒有 */
  row?: TrainingRow;
  mobs: Array<[number, number]>;
  /** 在這張圖就能整個完成的任務，經驗高的在前 */
  quests: Quest[];
  questExp: number;
  loot: Material[];
  /** 這張圖是玩家推薦的話，附上推薦內容 */
  guide?: GuideTrain;
};

type TripContext = {
  level: number;
  job: number;
  maps: MapNames;
  training: TrainingRow[];
  monsters: Monster[];
  quests: Quest[];
  guide?: GuideJob;
  toNext: number[];
};

/**
 * 今天去哪幾張圖。每一趟都要講得出「為什麼是它」：
 *  - fast：遊戲資料排第一的練功圖
 *  - quests：在這張圖能整個完成的任務經驗加總最高
 *  - players：這個職業這個等級，玩家攻略推薦的圖
 * 同一張圖符合多個理由就合併；只剩一趟時補一張次快的當備案。
 */
export function planTrips(context: TripContext): Trip[] {
  const { level, job, maps, monsters, quests, guide, toNext } = context;
  const stage = stageJob(job, level);
  const island = onIsland(job, level);
  const reachableMap = (map: number) => isIslandMap(map) === island && Boolean(maps[String(map)]?.zh);
  const training = context.training.filter(row => reachableMap(row.m));
  const profile = { level, job: stage };
  const monsterIndex = new Map(monsters.map(monster => [monster.id, monster]));
  const spawns = spawnIndex(monsters);
  const drops = dropIndex(monsters);
  const rows = new Map(training.map(row => [row.m, row]));

  const eligible = withoutLongRun(quests.filter(quest =>
    questEligible(quest, profile)
    && questReachable(quest, maps)
    && (quest.exp ?? 0) > 0
    && levelFraction(quest.exp ?? 0, level, toNext) >= 0.01), monsters);

  const picks = planTraining(profile, training, monsterIndex, 10);
  const players = guide
    ? trainingForBand({ from: level, to: level + 1 }, guide.train).filter(segment => segment.map && reachableMap(segment.map))
    : [];

  const candidates = new Set<number>([...picks.map(pick => pick.row.m), ...players.map(segment => segment.map as number)]);
  // 任務要打的怪常在練功排行之外的圖，也拿來比；但怪太強的圖不算
  for (const quest of eligible) {
    const needed = [
      ...(quest.needMobs ?? []).map(mob => mob.id),
      ...(quest.needItems ?? []).flatMap(item => droppersOf(item.id, monsters)),
    ];
    for (const mobId of needed) {
      for (const [map] of monsterIndex.get(mobId)?.sp ?? []) {
        const top = Math.max(...(spawns.get(map) ?? []).map(([id]) => monsterIndex.get(id)?.lv ?? 0));
        if (top <= level + 5 && reachableMap(map)) candidates.add(map);
      }
    }
  }

  const mobsOf = (map: number): Array<[number, number]> =>
    spawns.get(map) ?? rows.get(map)?.mobs.map(([id, count]) => [id, count] as [number, number]) ?? [];

  const doable = new Map<number, Quest[]>();
  for (const map of candidates) {
    const onMap = new Set(mobsOf(map).map(([id]) => id));
    doable.set(map, eligible.filter(quest => questDoableAt(quest, onMap, drops)).sort((a, b) => (b.exp ?? 0) - (a.exp ?? 0)));
  }
  const questExp = (map: number) => (doable.get(map) ?? []).reduce((sum, quest) => sum + (quest.exp ?? 0), 0);

  const order = [...candidates];
  const pickRank = new Map(picks.map((pick, index) => [pick.row.m, index]));
  const bestQuests = order
    .filter(map => questExp(map) > 0)
    .sort((a, b) => questExp(b) - questExp(a) || (pickRank.get(a) ?? 99) - (pickRank.get(b) ?? 99))[0];

  const reasons: Array<{ map: number; tag: TripTag }> = [];
  if (picks[0]) reasons.push({ map: picks[0].row.m, tag: "fast" });
  if (bestQuests !== undefined) reasons.push({ map: bestQuests, tag: "quests" });
  if (players[0]?.map) reasons.push({ map: players[0].map, tag: "players" });
  let merged = mergeTrips(reasons);
  if (merged.length < 2 && picks[1]) merged = mergeTrips([...reasons, { map: picks[1].row.m, tag: "alt" }]);

  return merged.map(({ map, tags }) => {
    const done = doable.get(map) ?? [];
    const onMap = new Set(mobsOf(map).map(([id]) => id));
    return {
      map,
      tags,
      row: rows.get(map),
      mobs: mobsOf(map),
      quests: done,
      questExp: questExp(map),
      loot: prepMaterials(done, monsters).map(material => ({
        ...material,
        droppers: material.droppers.filter(id => onMap.has(id)),
      })),
      guide: players.find(segment => segment.map === map),
    };
  });
}
