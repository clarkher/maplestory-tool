/**
 * 首頁「現在做這些」的排法：主推去哪、先解哪些任務、哪些是長線。
 * 規則：docs/superpowers/specs/2026-10-05-now-plan-design.md。全部是純函式，測試在 __tests__/now-plan.test.ts。
 */
import { jobFit, type JobFit } from "./job-rules";
import { JOB_LINES, advancementLevel, baseJob, stageJob } from "./jobs";
import { jobLineage, planTraining, questEligible } from "./planner";
import { boatNote, findRoute, suggestStart, victoriaReach } from "./route";
import {
  VERIFIED_RANK, groupQuests, isIslandBand, isIslandMap, levelFraction, longRunQuests, mustDoIndex, onIsland, prepMaterials, questReachable, shortName, spawnIndex,
  trainingForBand, type Band, type Material,
} from "./route-planner";
import type {
  GuideCommon, GuideJob, GuideMustDo, GuidePq, GuideTrain, MapRecord, Monster, PortalEdge, Quest, QuestNpc, QuestReward, TrainingRow,
} from "./types";

/** 同一道具累計、或單一任務同一隻怪要打到這個數量以上，就算長線（告示牌 999 隻、詛咒娃娃 2,300 個） */
export const LONG_RUN_MIN = 200;

/* ------------------------------------------------------------------ 實際等級 */

/**
 * 任務實際上幾等才做得動。遊戲資料有 67 個給經驗的任務沒有等級門檻（例如鱷魚王 18 萬經驗），
 * 只看門檻會推給 Lv.7 的初心者。取下列最高者：門檻；攻略建議等級（有寫就信攻略）；
 * 沒攻略時「要打的怪」與「要交道具的最低等掉落怪」的等級 −5；前置任務的實際等級。
 */
export function effectiveLevels(quests: Quest[], monsters: Monster[], common: GuideCommon): Map<string, number> {
  const recs = mustDoIndex(common);
  const index = new Map(monsters.map(monster => [monster.id, monster]));
  const droppers = new Map<number, number[]>();
  for (const monster of monsters) {
    for (const item of monster.drops) {
      const list = droppers.get(item);
      if (list) list.push(monster.id);
      else droppers.set(item, [monster.id]);
    }
  }
  const byId = new Map(quests.map(quest => [quest.id, quest]));
  const memo = new Map<string, number>();

  function levelOf(quest: Quest, visiting: Set<string>): number {
    const known = memo.get(quest.id);
    if (known !== undefined) return known;
    if (visiting.has(quest.id)) return 0;
    visiting.add(quest.id);
    const recLevel = recs.get(quest.id)?.lv.match(/\d+/);
    const mobLevel = Math.max(0, ...(quest.needMobs ?? []).map(mob => index.get(mob.id)?.lv ?? 0));
    const itemLevel = Math.max(0, ...(quest.needItems ?? []).map(item => {
      const levels = (droppers.get(item.id) ?? []).map(id => index.get(id)?.lv ?? 0).filter(level => level > 0);
      return levels.length ? Math.min(...levels) : 0;
    }));
    const fromMobs = Math.max(mobLevel, itemLevel);
    const pres = (quest.pre ?? []).map(id => byId.get(id)).filter((pre): pre is Quest => Boolean(pre));
    const fromPre = Math.max(0, ...pres.map(pre => levelOf(pre, visiting)));
    const value = Math.max(quest.minLv ?? 0, recLevel ? Number(recLevel[0]) : fromMobs > 0 ? fromMobs - 5 : 0, fromPre);
    memo.set(quest.id, value);
    return value;
  }

  for (const quest of quests) levelOf(quest, new Set());
  return memo;
}

/* ------------------------------------------------------------------ 先解 */

export type NowQuest = {
  key: string;
  title: string;
  /** 現在做得到的那幾段 */
  quests: Quest[];
  /** 整條任務線幾段；現在做得到的是第幾到第幾段（1 起算） */
  totalParts: number;
  firstPart: number;
  lastPart: number;
  /** 這次列出的是第幾段（1 起算、由小到大）；一定連在一起（lineRun 不跳段） */
  positions: number[];
  exp: number;
  /** 「約幾級」：先解用現在等級換算；升級路線的必解用接得到那條線的等級（見 bandQuests） */
  fraction: number;
  /** 關鍵獎勵標籤（研究檔 reward.label）；列出的段裡有給那個獎勵的那一段才有（rewardInParts） */
  reward?: string;
  /** 放圖用的獎勵道具 id；沒有 reward、或對不到這個職業拿得到的就不放 */
  rewardItem?: number;
  rec?: GuideMustDo;
  npc?: QuestNpc;
};

const JOB_FLAG: Record<number, number> = { 0: 1, 100: 2, 200: 4, 300: 8, 400: 16, 500: 32 };

/** 任務獎勵的 job 欄位是職業旗標（劍士 2、法師 4、弓箭手 8、盜賊 16、海盜 32），不是職業代碼 */
export function rewardFitsJob(reward: Pick<QuestReward, "job">, job: number): boolean {
  if (reward.job === undefined) return true;
  return (reward.job & (JOB_FLAG[baseJob(job)] ?? 1)) !== 0;
}

function rewardItemFor(rec: GuideMustDo | undefined, quests: Quest[], job: number): number | undefined {
  const wanted = rec?.reward?.items ?? [];
  if (!wanted.length) return undefined;
  const given = quests.flatMap(quest => quest.rewardItems ?? []).filter(item => wanted.includes(item.id));
  return given.find(item => rewardFitsJob(item, job))?.id ?? (wanted.length === 1 ? wanted[0] : undefined);
}

/** 寫「30+」「10 起」這種開放式建議等級的任務，過了最大數字這麼多級也算過期（2026-10-05 final review P7 裁定） */
const OPEN_ENDED_SPAN = 40;

/**
 * 攻略建議等級的上限，過了上限 +5 就不推（Lv35 手套推給 Lv.82 沒意義）。
 * 「15–25」取 25；寫「30+」「10 起」的取最大的數字 +40；其他取最大的數字 +15。
 * 永久有用的獎勵（冒險家的戒指，reward.permanent）不管上限，nowQuests 那邊另外放行。
 */
export function recUpperLevel(rec: GuideMustDo | undefined): number | undefined {
  if (!rec) return undefined;
  const text = rec.lv.replace(/（[^）]*）/g, "");
  const range = text.match(/^\s*(\d+)\s*[–~～-]\s*(\d+)/);
  if (range) return Number(range[2]);
  const numbers = text.match(/\d+/g)?.map(Number) ?? [];
  if (!numbers.length) return undefined;
  return Math.max(...numbers) + (/[+＋]|起/.test(text) ? OPEN_ENDED_SPAN : 15);
}

/** 攻略建議等級過期了沒（過了上限 +5）；永久有用的獎勵不過期 */
function recExpired(rec: GuideMustDo | undefined, level: number): boolean {
  const upper = recUpperLevel(rec);
  return upper !== undefined && level > upper + 5 && !rec?.reward?.permanent;
}

/** 先解「留下」的門檻：用現在等級換算，經驗約幾級 */
const WORTH_LEVELS = 0.25;
/** 玩家推薦的任務，經驗到這麼多級就留下 */
const WORTH_LEVELS_RECOMMENDED = 0.08;

/**
 * 值不值得列（先解與長線同一條規則）：有關鍵獎勵；經驗 ≥ 0.25 級；玩家推薦且經驗 ≥ 0.08 級。
 * recs 是這一列涵蓋的任務各自的攻略推薦（沒有推薦就是 undefined）。
 * reward：這一列算不算有關鍵獎勵——先解、必解的列要列到給獎勵的那一段才算（rewardInParts）；長線照舊看推薦有沒有獎勵。
 */
function worthListing(fraction: number, recs: Array<GuideMustDo | undefined>, reward = recs.some(rec => Boolean(rec?.reward?.label))): boolean {
  const recommended = recs.some(rec => Boolean(rec));
  return reward || fraction >= WORTH_LEVELS || (recommended && fraction >= WORTH_LEVELS_RECOMMENDED);
}

/**
 * 這一列列出的段有沒有給關鍵獎勵的那一段（round 4 後續 C）：獎勵道具（研究檔 reward.items）對得到那一段的獎勵；
 * 研究檔沒寫道具（例：伊卡路斯的披風）才看推薦的那個任務（rec.q）。寫了道具、這個職業的線卻沒有給它的那一段
 * （麥吉的舊戰劍：給劍的那段不收初心者）就不算。沒列到就不寫獎勵、不排到有獎勵的前面、不靠獎勵留下（阿勒斯第 1 段不會掛隨機耳環）。
 * parts 是這一列列出的段（只會是這個職業的線上的任務）。
 */
function rewardInParts(rec: GuideMustDo | undefined, parts: Quest[]): boolean {
  if (!rec?.reward?.label) return false;
  const wanted = rec.reward.items ?? [];
  const gives = (quest: Quest) => (wanted.length ? (quest.rewardItems ?? []).some(item => wanted.includes(item.id)) : quest.id === rec.q);
  return parts.some(gives);
}

function isLongKill(quest: Quest, min = LONG_RUN_MIN): boolean {
  return (quest.needMobs ?? []).some(mob => (mob.c ?? 0) >= min);
}

/** 起始 NPC 站在楓之島（離島後回不去，這種任務離島後不列、也不給「去」） */
function npcOnIsland(quest: Quest): boolean {
  return quest.sNpc?.map !== undefined && isIslandMap(quest.sNpc.map);
}

/** 起始 NPC 站在楓之島以外（維多利亞島那邊） */
function npcOffIsland(quest: Quest): boolean {
  return quest.sNpc?.map !== undefined && !isIslandMap(quest.sNpc.map);
}

/**
 * 還在楓之島、還不能轉職的初心者（法師 8 等就能離島轉職，所以是 8 等前）：維多利亞島的任務先不列
 * （離島前去不了，P3「離島後不列島上的任務」的反面）
 */
export function islandOnly(job: number, level: number): boolean {
  return onIsland(job, level) && level < advancementLevel(200);
}

type QuestLines = {
  stage: number;
  lineage: Set<number>;
  recs: Map<string, GuideMustDo>;
  /** 這個職業做得到的全部任務（不看等級）：拿來算「第幾段／共幾段」 */
  forJob: Quest[];
  lineOf: Map<string, string>;
  /** 一條線的全部任務，照實際等級排好 */
  lines: Map<string, Quest[]>;
  /**
   * 切任務線時算長線那種的段，只看自己這條線（round 4 後續 B）：這段要打同一隻怪 200 隻以上，
   * 或這條線到這段為止（含）同一道具累計 200 個以上。別條線也要交同一道具不算（冒險家的戒指第 17 段的樹枝），
   * 所有任務加總的長線區塊另外算（longRunNow）
   */
  long: Set<string>;
};

/**
 * questLines 的快取：畫面跟真資料檢查傳的都是同一份任務、攻略、地圖、實際等級（物件不變），每一轉只算一次。
 * 任何一份換了（例：單元測試每次給新的）就整個重算。
 */
let linesCache: {
  quests: Quest[];
  common: GuideCommon;
  maps: Record<string, Pick<MapRecord, "zh">>;
  effective: Map<string, number>;
  byStage: Map<number, QuestLines>;
} | undefined;

/**
 * 先解跟升級路線的必解共用的任務線：一筆攻略推薦（mustDo）就是一條線（`rec:任務 id`），
 * 即使它涵蓋的幾段前置串不起來（例：伊卡路斯任務鏈）；沒有推薦的照前置任務分（groupQuests）。
 * 所以前置有推薦、自己沒有的任務是另一條線，不會掛上別的任務的「為什麼」。
 * 回傳的陣列跟 Map 是共用的快取，呼叫端不能改。
 */
function questLines(stage: number, quests: Quest[], common: GuideCommon, maps: Record<string, Pick<MapRecord, "zh">>, effective: Map<string, number>): QuestLines {
  if (!linesCache || linesCache.quests !== quests || linesCache.common !== common || linesCache.maps !== maps || linesCache.effective !== effective) {
    linesCache = { quests, common, maps, effective, byStage: new Map() };
  }
  const cached = linesCache.byStage.get(stage);
  if (cached) return cached;
  const lineage = new Set(jobLineage(stage));
  const recs = mustDoIndex(common);
  const levelOf = (quest: Quest) => effective.get(quest.id) ?? quest.minLv ?? 0;
  const forJob = quests.filter(quest =>
    (!quest.jobs?.length || quest.jobs.some(code => lineage.has(code)))
    && quest.cat !== "組隊任務"
    && questReachable(quest, maps));
  const lineOf = new Map<string, string>();
  for (const group of groupQuests(forJob)) {
    for (const quest of group.quests) {
      const rec = recs.get(quest.id);
      lineOf.set(quest.id, rec ? `rec:${rec.q}` : group.key);
    }
  }
  const lines = new Map<string, Quest[]>();
  for (const quest of forJob) {
    const key = lineOf.get(quest.id) as string;
    lines.set(key, [...(lines.get(key) ?? []), quest]);
  }
  for (const members of lines.values()) members.sort((a, b) => levelOf(a) - levelOf(b) || a.id.localeCompare(b.id));
  // 長線那種的段只看自己這條線：要打同一隻怪 200 隻以上，或這條線到這段為止（含）同一道具累計 200 個以上
  const long = new Set<string>();
  for (const members of lines.values()) {
    const totals = new Map<number, number>();
    for (const quest of members) {
      for (const item of quest.needItems ?? []) totals.set(item.id, (totals.get(item.id) ?? 0) + (item.c ?? 1));
      if (isLongKill(quest) || (quest.needItems ?? []).some(item => (totals.get(item.id) ?? 0) >= LONG_RUN_MIN)) long.add(quest.id);
    }
  }
  const value = { stage, lineage, recs, forJob, lineOf, lines, long };
  linesCache.byStage.set(stage, value);
  return value;
}

/**
 * 測試用：指定職業階段（stage）下某條任務線（questLines 的 key）真正的完整順序，給真資料常駐檢查獨立驗證
 * 不跳段、NPC 是第一段的——不能拿 lineItems 自己算出來的 positions／firstPart／npc 比對自己（round4-rereview M1）。
 */
export function lineFor(
  stage: number,
  key: string,
  quests: Quest[],
  common: GuideCommon,
  maps: Record<string, Pick<MapRecord, "zh">>,
  effective: Map<string, number>,
): Quest[] | undefined {
  return questLines(stage, quests, common, maps, effective).lines.get(key);
}

/**
 * 現在接得到、做得動的任務（先解的候選）：職業、等級上下限、實際等級 ≤ 現在等級；
 * 離開楓之島後不算島上的，還在島上、8 等前不算維多利亞島的（islandOnly）
 */
function doableNow(shared: QuestLines, level: number, effective: Map<string, number>, island: boolean, onlyIsland: boolean): Quest[] {
  return shared.forJob.filter(quest =>
    questEligible(quest, { level, job: shared.stage }, shared.lineage)
    && (effective.get(quest.id) ?? quest.minLv ?? 0) <= level
    && (island || !npcOnIsland(quest))
    && (!onlyIsland || !npcOffIsland(quest)));
}

/**
 * 一條線這次列哪幾段（先解跟升級路線的必解共用）：從 doable 判定為真的那一段開始，照線的順序往下，碰到做不到的
 * （接不到、過期、自己這條線的長線那種）就停，不跳段——遊戲裡要一段一段解，中間那段沒解、後面的接不到
 * （round 4：湯寶寶原本寫「第 1、2、4、5 段」，跳過要收大量材料的第 3 段）。
 * 0 經驗的段也是一段（內拉的夢 → 潘喜的紅色毛球：從內拉那段開始，帶我去也是去找內拉）。
 * 現在的規則是從線的第一段開始（呼叫端先確認第一段做得到才呼叫這裡，round 4 後續 2）：先解、升級路線的必解都一樣；
 * 只有「你在這」那一段、先解已經列過的線例外，接在先解那串的下一段（bandQuests runOf）。這一行的 NPC、帶我去都用列出的第一段（lineItems）。
 */
export function lineRun(line: Quest[], doable: (quest: Quest) => boolean): Quest[] {
  const start = line.findIndex(doable);
  if (start < 0) return [];
  let end = start + 1;
  while (end < line.length && doable(line[end])) end += 1;
  return line.slice(start, end);
}

/**
 * 把做得到的任務照任務線收成一行一行：每條線列 lineRun 那幾段（不跳段；runOf 可以另外定，見先解的從第一段開始、bandQuests 你在的這段），
 * 標題（有推薦用推薦的名字）、第幾段／共幾段（整條線）、經驗、約幾級（用 levelFor 回傳的等級換算；拿到的是列出的那幾段）。
 * 值不值得（worthListing）用列出的那幾段算、過期由呼叫端決定要不要套；關鍵獎勵要列到給它的那一段才算（rewardInParts，
 * 沒列到就不寫獎勵、不放獎勵圖、不排到前面）；這一行的 NPC 跟帶我去用列出的第一段。
 */
function lineItems(
  shared: QuestLines,
  doable: (quest: Quest) => boolean,
  levelFor: (parts: Quest[]) => number,
  toNext: number[],
  job: number,
  keep: (rec: GuideMustDo | undefined, fraction: number, reward: boolean) => boolean,
  runOf: (key: string, line: Quest[]) => Quest[],
): Array<{ item: NowQuest; score: number }> {
  const { forJob, lineOf, lines, recs } = shared;
  // 有做得到的任務的線，照任務資料裡各線第一個做得到的任務排（同分時照這個先後）
  const keys = new Set<string>();
  for (const quest of forJob) if (doable(quest)) keys.add(lineOf.get(quest.id) as string);
  const scored: Array<{ item: NowQuest; score: number }> = [];
  for (const key of keys) {
    const line = lines.get(key) as Quest[];
    const parts = runOf(key, line);
    if (!parts.length) continue;
    const rec = parts.map(quest => recs.get(quest.id)).find((value): value is GuideMustDo => Boolean(value));
    const exp = parts.reduce((sum, quest) => sum + (quest.exp ?? 0), 0);
    const fraction = levelFraction(exp, levelFor(parts), toNext);
    const reward = rewardInParts(rec, parts);
    if (!keep(rec, fraction, reward)) continue;
    const first = line.indexOf(parts[0]) + 1;
    const positions = parts.map((_, index) => first + index);
    const title = rec
      ? rec.name.replace(/（[^（）]*）\s*$/, "")
      : key.startsWith("line:") ? key.slice(5) : [...parts].sort((a, b) => (b.exp ?? 0) - (a.exp ?? 0))[0].n;
    scored.push({
      item: {
        key,
        title,
        quests: parts,
        totalParts: line.length,
        firstPart: first,
        lastPart: positions[positions.length - 1],
        positions,
        exp,
        fraction,
        reward: reward ? rec?.reward?.label : undefined,
        rewardItem: reward ? rewardItemFor(rec, parts, job) : undefined,
        rec,
        npc: parts[0].sNpc,
      },
      score: fraction + (rec ? 0.2 : 0),
    });
  }
  // 有關鍵獎勵的一律排在沒有的前面；同一組裡比約幾級（玩家推薦加 0.2）
  return scored.sort((a, b) => Number(Boolean(b.item.reward)) - Number(Boolean(a.item.reward)) || b.score - a.score);
}

export function nowQuests(args: {
  level: number;
  job: number;
  quests: Quest[];
  monsters: Monster[];
  common: GuideCommon;
  maps: Record<string, Pick<MapRecord, "zh">>;
  effective: Map<string, number>;
  limit?: number;
}): NowQuest[] {
  // 不設上限：關鍵獎勵任務可能超過 5 個，一個都不能藏；畫面先顯示 5 條、其餘展開（TodoList）
  // monsters 留在參數裡（跟長線、必解同一包參數）；切任務線的長線那種只看自己這條線，用不到怪物資料
  const { level, job, quests, common, maps, effective, limit } = args;
  const shared = questLines(stageJob(job, level), quests, common, maps, effective);
  const candidates = doableNow(shared, level, effective, onIsland(job, level), islandOnly(job, level));
  // 做得到＝現在接得到、做得動、不是（自己這條線的）長線那種；0 經驗的段也算（它是步驟，值不值得由整段經驗決定）
  const doable = new Set(candidates.filter(quest => !shared.long.has(quest.id)).map(quest => quest.id));
  const inRun = (quest: Quest) => doable.has(quest.id);
  // 先解一定從第一段開始（round 4 後續）：第一段現在做不到（長線那種、過了等級上限、接不到）就不列，不會寫「第 3 段」
  const fromStart = (_key: string, line: Quest[]) => (inRun(line[0]) ? lineRun(line, inRun) : []);
  const keep = (rec: GuideMustDo | undefined, fraction: number, reward: boolean) => !recExpired(rec, level) && worthListing(fraction, [rec], reward);
  const sorted = lineItems(shared, inRun, () => level, common.expTable.toNext, job, keep, fromStart);
  return (limit === undefined ? sorted : sorted.slice(0, limit)).map(entry => entry.item);
}

/**
 * 「第幾段／共 N 段」（先解跟升級路線的必解同一個寫法）：列出的段一定連在一起（lineRun 不跳段），
 * 寫「第 a–b 段」，一段寫「第 a 段」。整條線只有一段時不寫。
 */
export function partsText(item: Pick<NowQuest, "positions" | "totalParts">): string | null {
  if (item.totalParts <= 1 || !item.positions.length) return null;
  const first = Math.min(...item.positions);
  const last = Math.max(...item.positions);
  return `第 ${first === last ? first : `${first}–${last}`} 段／共 ${item.totalParts} 段`;
}

/** 升級路線的必解一行：先解的一行，加上這條線在這段最早幾等能接 */
export type BandQuest = NowQuest & { level: number };

/** 研究裡的建議等級是文字（「15 起接，25／35／40 各解一段」），取第一個數字 */
function recommendedLevel(rec: GuideMustDo | undefined): number | undefined {
  const match = rec?.lv.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

/**
 * 升級路線某一段的必解：有段在這段解鎖的任務線（門檻等級，沒有門檻用攻略建議等級），規則跟先解同一套——
 * 同一條任務線、同一個標題、長線那種拿掉、同一條值不值得的門檻、不跳段；第幾段／共幾段算整條線。
 * 每一列從那條線的第一段開始（round 4 後續 2），列到這段為止解鎖、不是長線那種的段，那一串要列到這段解鎖的段才列在這段——
 * 不會只寫「伊卡路斯 第 3–4 段」、前面兩段在哪裡都看不到。
 * 長線那種跟先解同一個判斷，只看自己這條線（QuestLines.long，round 4 後續 B）：兩邊拿掉的段一樣、經驗是同一個數字，
 * 別條線也要交同一道具不會切斷這條線（冒險家的戒指整條）；詛咒娃娃那條累計到 200 個的那段起不列。
 * 關鍵獎勵要列到給它的那一段才算（rewardInParts，round 4 後續 C）。
 * 約幾級用接得到那條線的等級算（這段列出的第一段的實際等級）：你在的這段跟之前的段取它跟你現在的等級較高的
 * （現在就做得到的就是現在等級，跟先解同一個數字），之後的段取它跟那段起點較高的——法師 8 看 20 等的任務不會寫約 4.1 級。
 * 離開楓之島之後，NPC 站在島上的任務不列；還在島上、8 等前，NPC 站在維多利亞島那邊的不列（islandOnly）。
 * active（你在的這段，round 4）：同一頁上同一條線也不跳段、不算兩次——
 * - 先解列過的線：只接在先解那串的下一段（伊卡路斯先解第 1–3 段、這段解鎖第 3–4 段 → 必解只剩第 4 段）；
 *   下一段做不到（長線那種、不在這段解鎖）就不列，不會先解第 1–3 段、必解跳到第 5 段
 * - 先解沒列的線（現在做得到的那串不值得列）：跟其他段一樣從第一段開始列（伊卡路斯 第 1–4 段）
 * 一段都不剩的線不列；值不值得用列出的那一串算。
 */
export function bandQuests(args: {
  band: Band;
  level: number;
  job: number;
  quests: Quest[];
  monsters: Monster[];
  common: GuideCommon;
  maps: Record<string, Pick<MapRecord, "zh">>;
  effective: Map<string, number>;
  limit?: number;
  /** 你在的這段（跟升級路線的 activeBandIndex 同一段） */
  active?: boolean;
}): BandQuest[] {
  const { band, level, job, quests, monsters, common, maps, effective, limit = 4, active = false } = args;
  const shared = questLines(isIslandBand(band) ? 0 : stageJob(job, band.from), quests, common, maps, effective);
  const island = onIsland(job, level);
  const onlyIsland = islandOnly(job, level);
  // 解鎖等級：門檻，沒有門檻用攻略建議等級；一條線後面的段不會比前面的段早解鎖，取到這段為止最高的
  // （round 4：惡靈森林 50 等才接得到，後面幾段沒有門檻、攻略寫 45，原本 40–50 那段會從第 2 段開始列）。都沒有的照舊不列在任何一段
  const lineUnlock = new Map<string, number>();
  for (const line of shared.lines.values()) {
    let highest = 0;
    for (const quest of line) {
      const own = quest.minLv ?? recommendedLevel(shared.recs.get(quest.id));
      if (own === undefined) continue;
      highest = Math.max(highest, own);
      lineUnlock.set(quest.id, highest);
    }
  }
  const unlockOf = (quest: Quest) => lineUnlock.get(quest.id);
  const reachable = (quest: Quest) => (!quest.island || isIslandBand(band)) && (island || !npcOnIsland(quest)) && (!onlyIsland || !npcOffIsland(quest));
  // 到這段為止解鎖、去得了、不是長線那種的段（從線的第一段開始列的那一串都要是這種）
  const open = (quest: Quest) => {
    const unlock = unlockOf(quest);
    return unlock !== undefined && unlock < band.to && reachable(quest) && !shared.long.has(quest.id);
  };
  // 在這段解鎖的段：有這種段的線才列在這段
  const inRun = (quest: Quest) => open(quest) && (unlockOf(quest) as number) >= band.from;
  // 從線的第一段開始（round 4 後續 2）：第一段到不了、或那一串到不了這段解鎖的段，就不列（不會寫「伊卡路斯 第 3–4 段」）
  const fromStart = (_key: string, line: Quest[]): Quest[] => {
    if (!open(line[0])) return [];
    const run = lineRun(line, open);
    return run.some(inRun) ? run : [];
  };
  const floor = band.from > level ? band.from : level;
  const levelFor = (parts: Quest[]) => Math.max(floor, effective.get(parts[0].id) ?? parts[0].minLv ?? 0);
  const keep = (rec: GuideMustDo | undefined, fraction: number, reward: boolean) => worthListing(fraction, [rec], reward);
  // 每一列加上這條線最早幾等能接
  const withLevel = (rows: Array<{ item: NowQuest; score: number }>): BandQuest[] =>
    rows.slice(0, limit).map(({ item }) => ({ ...item, level: Math.min(...item.quests.map(quest => unlockOf(quest) ?? band.from)) }));
  if (!active) return withLevel(lineItems(shared, inRun, levelFor, common.expTable.toNext, job, keep, fromStart));

  // 你在的這段：先解列過的線接在先解那串的下一段（下一段在這段解鎖、不是長線那種才列），沒列過的線從第一段開始
  const listed = new Map(nowQuests({ level, job, quests, monsters, common, maps, effective }).map(item => [item.key, item.lastPart]));
  const runOf = (key: string, line: Quest[]): Quest[] => {
    const lastListed = listed.get(key);
    if (lastListed === undefined) return fromStart(key, line);
    return lastListed < line.length && inRun(line[lastListed]) ? lineRun(line.slice(lastListed), inRun) : [];
  };
  return withLevel(lineItems(shared, inRun, levelFor, common.expTable.toNext, job, keep, runOf));
}

/** 「先存著，Lv.N 以後要交」最多列幾種 */
const LATER_MATERIALS = 5;

/**
 * 升級路線每一段的「先存著，Lv.N 以後要交」：下一段必解的任務要交、有怪會掉的材料，量多的先、最多 5 種。
 * 這頁已經列的任務（先解、這一段的必解）不算——下一段的列也從線的第一段開始，會帶到這段已經列的段，
 * 那些材料現在就要交，不是「以後要交」（round 4 後續 3：狂戰士 33 原本多列伊卡路斯第 1–2 段的樹枝、綠液球）。
 */
export function laterMaterials(args: { next: Array<Pick<NowQuest, "quests">>; listed: Array<Pick<NowQuest, "quests">>; monsters: Monster[] }): Material[] {
  const shown = new Set(args.listed.flatMap(item => item.quests.map(quest => quest.id)));
  return prepMaterials(args.next.flatMap(item => item.quests).filter(quest => !shown.has(quest.id)), args.monsters)
    .filter(material => material.droppers.length)
    .sort((a, b) => b.c - a.c)
    .slice(0, LATER_MATERIALS);
}

/**
 * 先解列的「帶我去」終點：NPC 站的圖走得到就去那裡；站在隱藏地圖（例：海盜教官卡伊琳的訓練場）
 * 就帶去那張圖的回城點（航海室），按鈕要寫出那張圖的名字（viaReturn）。都走不到就不給按鈕。
 */
export function npcGoTarget(
  npcMap: number | undefined,
  maps: Record<string, Pick<MapRecord, "zh" | "ret">>,
  routable: Set<number>,
): { map: number; viaReturn: boolean } | undefined {
  if (npcMap === undefined) return undefined;
  if (routable.has(npcMap)) return { map: npcMap, viaReturn: false };
  const back = maps[String(npcMap)]?.ret;
  return back !== undefined && routable.has(back) ? { map: back, viaReturn: true } : undefined;
}

/* ------------------------------------------------------------------ 長線 */

export type LongRunTask = { kind: "item" | "kill"; id: number; n: string; c: number; quests: string[]; exp: number; droppers: number[] };

/**
 * 首頁的長線：先解候選裡要打／收 200 以上的那些，所以跟先解用同一套「現在接得到」——
 * 職業、等級上下限、實際等級 ≤ 現在等級、起始 NPC 在開放地圖、不是組隊任務、攻略建議等級沒過期；
 * 也用同一條值不值得的門檻（有關鍵獎勵、經驗 ≥ 0.25 級、玩家推薦且 ≥ 0.08 級），Lv.82 不會再看到石面怪人 ×300。
 * 還在楓之島的不列（島上沒有長線任務，離島後回不去）。
 * 先解已經列的任務不算（round 4 後續 2）：每一條長線的數量、經驗拿掉那些任務重算，剩下不到 200 的就不列——同一個任務不會同時在先解跟長線。
 */
export function longRunNow(args: {
  level: number;
  job: number;
  quests: Quest[];
  monsters: Monster[];
  common: GuideCommon;
  maps: Record<string, Pick<MapRecord, "zh">>;
  effective: Map<string, number>;
}): LongRunTask[] {
  const { level, job, quests, monsters, common, maps, effective } = args;
  if (onIsland(job, level)) return [];
  const stage = stageJob(job, level);
  const lineage = new Set(jobLineage(stage));
  const recs = mustDoIndex(common);
  const listed = new Set(nowQuests(args).flatMap(item => item.quests.map(quest => quest.id)));
  const candidates = quests.filter(quest =>
    quest.cat !== "組隊任務"
    && !listed.has(quest.id)
    && questReachable(quest, maps)
    && questEligible(quest, { level, job: stage }, lineage)
    && (effective.get(quest.id) ?? quest.minLv ?? 0) <= level
    && !recExpired(recs.get(quest.id), level));
  const toNext = common.expTable.toNext;
  return longRunTasks(candidates, monsters)
    .filter(entry => worthListing(levelFraction(entry.exp, level, toNext), entry.quests.map(id => recs.get(id))));
}

/** 長線：同一道具累計 200 個以上（例：詛咒娃娃）；單一任務同一隻怪要打 200 隻以上（例：告示牌 999 隻） */
export function longRunTasks(quests: Quest[], monsters: Monster[], min = LONG_RUN_MIN): LongRunTask[] {
  const items = longRunQuests(quests, monsters, min).map((entry): LongRunTask => ({
    kind: "item", id: entry.id, n: entry.n, c: entry.c, quests: entry.quests, exp: entry.exp, droppers: entry.droppers,
  }));
  const kills = new Map<number, LongRunTask>();
  for (const quest of quests) {
    for (const mob of quest.needMobs ?? []) {
      if ((mob.c ?? 0) < min) continue;
      const entry: LongRunTask = kills.get(mob.id) ?? { kind: "kill", id: mob.id, n: mob.n, c: 0, quests: [], exp: 0, droppers: [mob.id] };
      entry.c += mob.c ?? 0;
      if (!entry.quests.includes(quest.id)) {
        entry.quests.push(quest.id);
        entry.exp += quest.exp ?? 0;
      }
      kills.set(mob.id, entry);
    }
  }
  return [...items, ...kills.values()].sort((a, b) => b.c - a.c);
}

/* ------------------------------------------------------------------ 主推大卡 */

/** 刷怪點這麼少的是王圖（巴洛古整張圖 1 隻），不進練功推薦（主推卡、升級路線的遊戲資料替代都用這個） */
export const BOSS_SPAWN_MAX = 3;
/** 從最近城鎮要走這麼多張圖以上，排序打七折 */
const FAR_HOPS = 8;
/** 攻略圖比參考等級（現在等級與能練的最高圖取小）低這麼多級以上算過期，排在遊戲資料後面 */
const STALE_GAP = 10;
/** 現在等級比能練的最高圖高這麼多級以上才加封頂提示 */
const CEILING_GAP = 10;
/** 主推圖跟能練的最高圖差這麼多級以內，封頂提示才說「這張已經是你能去最好的」 */
const BEST_GAP = 5;
/**
 * 能練的最高圖 ≤ 你的等級 + 這麼多級才算練得動（跟遊戲資料的等級適配一樣：同級到高 5 級），排在過期攻略前面；
 * 比這個還高就排最後、不當備案（只有它一張圖時才會變主推）
 */
const CAP_REACH = 5;

export type TrainOption = {
  map: number;
  title: string;
  party: boolean;
  source: "guide" | "data";
  guide?: GuideTrain;
  row?: TrainingRow;
  /** [怪物 id, 刷怪點數]，多的在前 */
  mobs: Array<[number, number]>;
  fit: JobFit;
  /** 這張圖的等級：練功資料的平均等級，沒有就取出怪的最高等級；都不知道就沒有 */
  level?: number;
  /** 從最近城鎮走幾張圖；沒有代表城鎮走不到（不給「帶我去」） */
  hops?: number;
  town?: number;
  /** 出發的城鎮跟維多利亞島的城鎮之間沒有傳送門（黃金海灘），要自己搭船或搭車過去（route.ts boatNote 的 region） */
  boat?: boolean;
};

/**
 * 封頂提示。level：能練的最高圖的地圖等級（拿來比較）；top：那張圖上最高等的怪幾等（畫面上寫的數字，
 * 跟卡上的怪「骷髏指揮官 Lv73」同一種寫法，不會寫「最高到 Lv.71」旁邊卻擺 Lv73 的怪）；
 * best＝主推圖已經是能去最好的（跟最高圖差 5 級以內）。
 */
export type Ceiling = { level: number; top: number; best: boolean };

/** 封頂提示的文字（用戶 10/05 定的寫法，最好的版本中間用逗號） */
export function ceilingText(ceiling: Ceiling): string {
  return ceiling.best
    ? `目前開放的練功圖最高到 Lv.${ceiling.top}，這張已經是你能去最好的。`
    : `目前開放的練功圖最高到 Lv.${ceiling.top}。`;
}

export type Instructor = { job: number; line: string; npcId: number; npcName: string; map: number; level: number };

export type MainPick =
  | { kind: "advance"; instructors: Instructor[] }
  /** job：寫這個範圍的攻略職業（可能是一轉） */
  | { kind: "pq"; pq: GuidePq; window: [number, number]; job: number; alt?: TrainOption }
  | { kind: "map"; option: TrainOption; alt?: TrainOption; ceiling?: Ceiling };

/** 備案前綴：主推單人、備案組隊才寫「有隊友：」；其他（主推組隊、兩張都單人）寫「人多時：」 */
export function altPrefix(main: TrainOption, alt: TrainOption): string {
  return !main.party && alt.party ? "有隊友：" : "人多時：";
}

/** 「帶我去」要有從城鎮走得到的路線（跟 /go 同一個條件），不然點進去只會看到「找不到可以走過去的起點」 */
export function canGo(option: TrainOption): boolean {
  return option.hops !== undefined;
}

/**
 * 轉職教官站的地圖（遊戲資料裡教官任務的起訖地圖）。
 * 海盜教官卡伊琳站在隱藏的訓練場，帶去她回城的鯨魚號航海室。
 */
export const INSTRUCTOR_MAPS: Record<number, number> = {
  100: 102000003, // 勇士聖殿
  200: 101000003, // 魔法森林圖書館
  300: 100000201, // 弓箭手培訓中心
  400: 103000003, // 墮落城市酒吧
  500: 120000101, // 鯨魚號航海室
};

/** 轉職卡標題：8–9 等只有法師能轉（其他職業 10 等），不寫「可以轉職了」騙想當劍士的人 */
export function advanceTitle(level: number): string {
  return `Lv.${level}・${level < 10 ? "可以轉法師了" : "可以轉職了"}`;
}

export function instructors(): Instructor[] {
  return JOB_LINES.map(line => ({
    job: line.base,
    line: line.line,
    npcId: line.npcId,
    npcName: line.npcName,
    map: INSTRUCTOR_MAPS[line.base],
    level: advancementLevel(line.base),
  }));
}

/**
 * 等級在這個職業的組隊任務範圍內就主推組隊；同時落在兩個範圍，選起始等級高的（比較貼近現在）。
 * job 是寫這個範圍的攻略職業：二轉玩家用到一轉攻略的範圍時（俠盜 30 等用盜賊的 21–30），卡片要寫「盜賊玩家推薦」。
 */
export function pqFor(common: GuideCommon, job: number, level: number): { pq: GuidePq; window: [number, number]; job: number } | undefined {
  const keys = pqKeys(job, level);
  const hits = (common.pq ?? []).flatMap(pq => {
    const key = keys.find(code => pq.byJob[String(code)]);
    const window = key === undefined ? undefined : pq.byJob[String(key)];
    return key !== undefined && window && level >= window[0] && level <= window[1] ? [{ pq, window, job: key }] : [];
  });
  return hits.sort((a, b) => b.window[0] - a.window[0])[0];
}

/** 組隊任務範圍要看哪幾個職業的攻略：這個等級實際那一轉，再加一轉（二轉玩家也用得到一轉攻略的範圍） */
function pqKeys(job: number, level: number): number[] {
  return [...new Set([stageJob(job, level), baseJob(job)])].filter(code => code > 0);
}

/** 組隊任務剛過遊戲上限後，主推卡多寫一行的那幾級（上限 +1 到 +5） */
const PQ_CLOSED_SPAN = 5;

/**
 * 組隊任務剛過遊戲的等級上限：這個職業本來有它的範圍、現在沒有組隊任務可打、等級在上限 +1～+5 → 回傳那個組隊任務跟上限
 * （狂戰士 31 等：超綠只開放到 30 等）。只看遊戲任務有上限的（第一次同行 30）；月妙沒有上限，不會出現。
 */
export function pqJustClosed(
  common: GuideCommon,
  job: number,
  level: number,
  quests: Array<Pick<Quest, "id" | "maxLv">>,
): { pq: GuidePq; maxLv: number } | undefined {
  if (pqFor(common, job, level)) return undefined;
  const keys = pqKeys(job, level);
  for (const pq of common.pq ?? []) {
    if (!pq.quest || !keys.some(code => pq.byJob[String(code)])) continue;
    const maxLv = quests.find(quest => quest.id === pq.quest)?.maxLv;
    if (maxLv !== undefined && level > maxLv && level <= maxLv + PQ_CLOSED_SPAN) return { pq, maxLv };
  }
  return undefined;
}

export function pqClosedText(closed: { pq: GuidePq; maxLv: number }): string {
  return `${closed.pq.name}只開放到 ${closed.maxLv} 等。`;
}

/** 攻略圖的怪：段落自己點名、這張圖真的有出的排前面（刷怪點多的先），其他照刷怪點數接在後面——卡上的怪才對得上理由 */
export function namedMobsFirst(mobs: Array<[number, number]>, named: number[]): Array<[number, number]> {
  const wanted = new Set(named);
  return [...mobs.filter(([id]) => wanted.has(id)), ...mobs.filter(([id]) => !wanted.has(id))];
}

/**
 * 從最近的城鎮走到這張圖：幾張圖、哪個城鎮、那個城鎮要不要自己搭船或搭車（跟 /go 同一套）。
 * 城鎮走不到就是空的，不給「帶我去」。
 */
export function townRoute(
  map: number,
  graph: Record<string, PortalEdge[]>,
  maps: Record<string, MapRecord>,
  nearestTown: Record<string, [number, number]>,
  island = false,
): { town?: number; hops?: number; boat?: boolean } {
  const town = suggestStart(graph, maps, nearestTown, map);
  if (!town) return {};
  const route = findRoute(graph, town, map);
  return route.ok ? { town, hops: route.hops, boat: boatNote(town, victoriaReach(graph), island) === "region" } : {};
}

/** 攻略段落的排序：跨 15 級以上的排後面 → 單人優先 → 台服實測優先 → 越窄越前面 */
function byGuidePreference(a: GuideTrain, b: GuideTrain): number {
  // 「跨 15 級以上」含 15
  const wide = (segment: GuideTrain) => Number(segment.to - segment.from >= 15);
  return wide(a) - wide(b)
    || Number(a.kind === "party") - Number(b.kind === "party")
    || VERIFIED_RANK[a.v] - VERIFIED_RANK[b.v]
    || (a.to - a.from) - (b.to - b.from);
}

/**
 * 主推大卡。一套設計（final review F1／F4／I1）：
 * - 能練的最高圖（cap）：通過職業規則、不是王圖、走得到、有城鎮路線的練功圖裡等級最高的。
 * - 參考等級＝現在等級與 cap 取小；攻略圖的等級比參考等級低 10 級以上算過期。
 * - 排序：沒過期的攻略圖 → 遊戲資料（城鎮走不到的不推）→ cap 那張圖 → 過期的攻略圖。高等級遊戲資料排不出來時
 *   主推就是 cap 圖、過期攻略當備案（多升一級主推不會從 Lv.71 掉到 Lv.49）。cap 圖 ≤ 你的等級 + 5 才這樣排；
 *   比這個還高（冰雷 50 看 Lv.67）就排最後，也不當備案。
 *   同一張圖只列一次，備案不會跟主推同一張。
 * - 封頂提示：現在等級比 cap 高 10 級以上才出；主推圖跟 cap 差 5 級以內才說「這張已經是你能去最好的」。
 */
export function mainPick(args: {
  level: number;
  job: number;
  /** 這個等級實際那一轉的攻略 */
  guide?: GuideJob;
  common: GuideCommon;
  training: TrainingRow[];
  monsters: Monster[];
  maps: Record<string, MapRecord>;
  graph: Record<string, PortalEdge[]>;
  nearestTown: Record<string, [number, number]>;
}): MainPick | undefined {
  const { level, job, guide, common, monsters, maps, graph, nearestTown } = args;
  if (job === 0 && level >= 8) return { kind: "advance", instructors: instructors() };

  const stage = stageJob(job, level);
  const index = new Map(monsters.map(monster => [monster.id, monster]));
  const spawns = spawnIndex(monsters);
  const island = onIsland(job, level);
  const reachable = (map: number) => isIslandMap(map) === island && Boolean(maps[String(map)]?.zh);
  const training = args.training.filter(row => reachable(row.m) && row.sp > BOSS_SPAWN_MAX);
  const rows = new Map(training.map(row => [row.m, row]));
  const anyRow = new Map(args.training.map(row => [row.m, row]));
  const mobsOf = (map: number): Array<[number, number]> => spawns.get(map) ?? [];
  const fitOf = (map: number) => jobFit(stage, level, mobsOf(map), index);
  const routes = new Map<number, { town?: number; hops?: number; boat?: boolean }>();
  const route = (map: number) => {
    if (!routes.has(map)) routes.set(map, townRoute(map, graph, maps, nearestTown, island));
    return routes.get(map) as { town?: number; hops?: number; boat?: boolean };
  };
  // 這張圖上最高等的怪幾等（卡上的怪、封頂提示都用這個寫法）
  const topMobLevel = (map: number): number | undefined => {
    const levels = mobsOf(map).map(([id]) => index.get(id)?.lv ?? 0).filter(value => value > 0);
    return levels.length ? Math.max(...levels) : undefined;
  };
  // 地圖等級：練功資料的平均等級；沒有練功資料就取出怪的最高等級；都沒有就是不知道
  const levelOf = (map: number): number | undefined => anyRow.get(map)?.lv ?? topMobLevel(map);

  // 能練的最高圖：由高往低找（同等級先看效率高的），碰到第一張有城鎮路線的就停，不用每張都算路線
  const capRow = training
    .filter(row => fitOf(row.m).ok)
    .sort((a, b) => b.lv - a.lv || b.eff - a.eff)
    .find(row => route(row.m).hops !== undefined);
  const cap = capRow?.lv;
  const reference = cap === undefined ? level : Math.min(level, cap);
  const isStale = (map: number) => {
    const mapLevel = levelOf(map);
    return mapLevel !== undefined && mapLevel <= reference - STALE_GAP;
  };

  const fresh: TrainOption[] = [];
  const stale: TrainOption[] = [];
  const segments = guide ? trainingForBand({ from: level, to: level + 1 }, guide.train) : [];
  for (const segment of [...segments].sort(byGuidePreference)) {
    if (segment.pq || segment.map === null || !reachable(segment.map)) continue;
    const map = segment.map;
    const fit = fitOf(map);
    if (!fit.ok) continue;
    const option: TrainOption = {
      map,
      title: maps[String(map)]?.zh ?? shortName(segment.name),
      party: segment.kind === "party",
      source: "guide",
      guide: segment,
      row: rows.get(map),
      mobs: namedMobsFirst(mobsOf(map), segment.mobs),
      fit,
      level: levelOf(map),
      ...route(map),
    };
    (isStale(map) ? stale : fresh).push(option);
  }

  // 遊戲資料：攻略已經寫到的圖不重複；城鎮走不到的不推（帶我去會找不到起點）；走 8 張圖以上打七折
  const guideMaps = new Set([...fresh, ...stale].map(option => option.map));
  const data: Array<{ option: TrainOption; score: number }> = [];
  for (const pick of planTraining({ level, job: stage }, training, index, 40)) {
    if (data.length >= 8) break;
    const map = pick.row.m;
    if (guideMaps.has(map)) continue;
    const fit = fitOf(map);
    if (!fit.ok) continue;
    const found = route(map);
    if (found.hops === undefined) continue;
    const far = found.hops >= FAR_HOPS ? 0.7 : 1;
    data.push({
      option: {
        map,
        title: maps[String(map)]?.zh ?? String(map),
        party: false,
        source: "data",
        row: pick.row,
        mobs: mobsOf(map),
        fit,
        level: pick.row.lv,
        ...found,
      },
      score: pick.score * fit.factor * far,
    });
  }
  data.sort((a, b) => b.score - a.score);

  const capOption: TrainOption[] = capRow ? [{
    map: capRow.m,
    title: maps[String(capRow.m)]?.zh ?? String(capRow.m),
    party: false,
    source: "data",
    row: capRow,
    mobs: mobsOf(capRow.m),
    fit: fitOf(capRow.m),
    level: capRow.lv,
    ...route(capRow.m),
  }] : [];
  // 能練的最高圖排在過期攻略前面：多升一級，主推不會從 Lv.71 掉回 Lv.49 的舊攻略圖。
  // 只在你練得動時（最高圖 ≤ 你的等級 + CAP_REACH）才往前排；比這個還高時（冰雷 50 看 Lv.67）排最後，
  // 而且不當備案（下面 altPool 拿掉它）；只有它一張圖時才會變主推
  const capFirst = capRow !== undefined && capRow.lv <= level + CAP_REACH;
  const ordered = [...fresh, ...data.map(entry => entry.option), ...(capFirst ? capOption : []), ...stale, ...(capFirst ? [] : capOption)];
  const options: TrainOption[] = [];
  for (const option of ordered) {
    if (!options.some(existing => existing.map === option.map)) options.push(option);
  }
  // 備案（人多時／有隊友）不比你高超過 5 級（跟能練的最高圖同一個門檻，法師 8 不會看到 Lv.15 的圖）；都太高就不給備案。
  // 太高的能練的最高圖也因此不會變成備案
  const altPool = (list: TrainOption[]) => list.filter(option => option.level !== undefined && option.level <= level + CAP_REACH);

  const pq = pqFor(common, job, level);
  if (pq) {
    const pool = altPool(options);
    return { kind: "pq", ...pq, alt: pool.find(option => !option.party) ?? pool[0] };
  }

  const main = options[0];
  if (!main) return undefined;
  const others = altPool(options.slice(1));
  const alt = others.find(option => option.party !== main.party) ?? others[0];
  // 封頂提示：比較用地圖等級，畫面上寫那張圖最高等的怪（跟卡上的怪同一種寫法）
  const ceiling = capRow !== undefined && cap !== undefined && level - cap >= CEILING_GAP
    ? { level: cap, top: topMobLevel(capRow.m) ?? cap, best: main.level !== undefined && main.level >= cap - BEST_GAP }
    : undefined;
  return { kind: "map", option: main, alt, ceiling };
}
