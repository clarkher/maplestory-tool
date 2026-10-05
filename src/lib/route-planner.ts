import { advancementLevel, stageJob } from "./jobs";
import { jobLineage } from "./planner";
import type { GuideCommon, GuideMustDo, GuideTrain, MapRecord, Monster, Quest, Verified } from "./types";

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
    // 只重疊一兩級的段落（例：Lv.30–41 的圖掛在 40–50 段，只重疊 40、41 兩級）是過期的攻略，不列；段長不到 3 級時門檻跟著縮
    .filter(entry => entry.size >= Math.min(3, band.to - band.from))
    .sort((a, b) => b.size - a.size || VERIFIED_RANK[a.segment.v] - VERIFIED_RANK[b.segment.v])
    .map(entry => entry.segment);
}

/**
 * 段落詳情列哪幾段攻略：照重疊排序往下列，湊滿 max 段職業能用的就停；途中碰到被職業規則擋掉的照列、寫原因
 * （火毒看得到「怪抗火」）。一段能用的都沒有時，列前 max 段被擋的，畫面下面再放遊戲資料替代。
 * 先判斷職業規則再挑，標籤跟詳情才會一致（以前先取前 3 段再判斷，能用的第 4 段會被擠掉）。
 */
export function segmentsToShow(all: GuideTrain[], blocked: (segment: GuideTrain) => boolean, max = 3): GuideTrain[] {
  const shown: GuideTrain[] = [];
  let usable = 0;
  for (const segment of all) {
    if (usable >= max) break;
    shown.push(segment);
    if (!blocked(segment)) usable += 1;
  }
  return usable ? shown : all.slice(0, max);
}

/**
 * 職業規則用哪個等級判斷：你在的這段用你現在的等級（Lv.35 僧侶看 30–40 段要用 35，不是段落起點 30），
 * 其他段用段落起點與攻略段落起點較高的那個。
 */
export function fitLevel(band: Band, segment: GuideTrain, current?: number): number {
  return current ?? Math.max(band.from, segment.from);
}

/** 攻略地名常帶括號註記（會掉什麼），當段落標題時拿掉 */
export function shortName(name: string): string {
  return name.replace(/[（(][^）)]*[）)]/g, "").trim();
}

/**
 * 每一段的標籤：取覆蓋這段最多的攻略地圖；同一張圖不在相鄰兩段重複當標籤，
 * 沒有別的圖可用時寫「同上一段」。trainOf 拿到第幾段，方便「你在的這段」用現在等級判斷職業規則。
 */
export function bandLabels(bands: Band[], trainOf: (band: Band, index: number) => GuideTrain[]): Array<string | undefined> {
  const labels: Array<string | undefined> = [];
  bands.forEach((band, index) => {
    const names = trainingForBand(band, trainOf(band, index)).map(segment => shortName(segment.name)).filter(Boolean);
    const previous = index > 0 ? labels[index - 1] : undefined;
    labels.push(names.find(name => name !== previous) ?? (names.length ? "同上一段" : undefined));
  });
  return labels;
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
 * 源頭同名、又是同一個 NPC 給的也算同一條（托德的打獵方法有兩個編號、彼此沒有前置，否則先解會列兩行同名的）。
 */
export function groupQuests(quests: Quest[]): QuestGroup[] {
  const byId = new Map(quests.map(quest => [quest.id, quest]));
  const firstRootByName = new Map<string, string>();
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
    const sameName = `${current.n}|${current.sNpc?.id ?? ""}`;
    if (!firstRootByName.has(sameName)) firstRootByName.set(sameName, current.id);
    return `chain:${firstRootByName.get(sameName)}`;
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

/* ------------------------------------------------------------------ 攻略推薦的任務 */

export function mustDoIndex(common: GuideCommon): Map<string, GuideMustDo> {
  const index = new Map<string, GuideMustDo>();
  for (const rec of common.mustDo) {
    for (const id of [rec.q, ...rec.chain]) if (!index.has(id)) index.set(id, rec);
  }
  return index;
}
