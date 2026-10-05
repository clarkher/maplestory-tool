/**
 * 升級路線每一段的練功清單與標籤（純函式）。RouteTimeline 照這個畫，真資料常駐檢查也跑同一套，
 * 所以「你在這一段的標籤＝主推卡」這種規則測得到。規則：docs/superpowers/specs/2026-10-05-now-plan-design.md「升級路線」。
 */
import { jobFit } from "./job-rules";
import { stageJob } from "./jobs";
import { BOSS_SPAWN_MAX, CEILING_GAP, type Ceiling, type MainPick } from "./now-plan";
import { planTraining } from "./planner";
import { LEVEL_CAP } from "./profile";
import { type Band, fitLevel, isIslandBand, isIslandMap, onIsland, segmentsToShow, shortName, trainingForBand } from "./route-planner";
import type { GuideJob, GuidePq, GuideTrain, MapRecord, Monster, TrainingRow, Verified } from "./types";

/** 練功清單的一列：攻略圖（同一張圖好幾段併成一列）、組隊任務、或遊戲資料的圖 */
export type TrainRow = {
  key: string;
  title: string;
  /** 這列的地圖（組隊任務是入口）；攻略沒對到地圖時是 null */
  map: number | null;
  /** 攻略的等級範圍：有涵蓋你等級的段就寫那段，沒有就寫併起來的範圍 */
  from?: number;
  to?: number;
  party: boolean;
  pq?: GuidePq;
  /** 要寫出名字的怪（攻略點名的，或遊戲資料這張圖最多的） */
  mobs: number[];
  /** 攻略理由與出處（攻略那幾列） */
  why?: string;
  v?: Verified;
  s?: string[];
  /** 被職業規則擋掉的原因（火毒的火焰之地：怪抗火） */
  warn?: string;
  source: "guide" | "data";
  /** 遊戲資料的圖清一輪的經驗 */
  exp1?: number;
  /** 「去」帶到哪；城鎮走不到、離島後的楓之島圖、被職業規則擋掉的圖就沒有 */
  go?: number;
};

export type BandPlan = {
  band: Band;
  stage: number;
  guide?: GuideJob;
  /** 攻略那幾列（你在的這段，第一列是主推卡本身，可能是遊戲資料的圖） */
  rows: TrainRow[];
  /** 攻略列裡職業能用的有幾列（含主推那列，它是攻略時） */
  usable: number;
  /** 列出來的攻略列全被職業規則擋掉（主推那列是攻略時不算被擋） */
  blocked: boolean;
  /** 沒有能用的攻略時，遊戲資料推算的替代（不含王圖、楓之島、已經列在上面的圖） */
  fallback: TrainRow[];
  /**
   * 段落的封頂提示：沒有能用的攻略、段落（你在的那段是你的等級）比能練的最高圖高 10 級以上時才有，
   * 跟主推卡同一種寫法（top 是列出來的怪最高幾等）；段落提示不說「這張已經是你能去最好的」
   */
  ceiling?: Ceiling;
};

export type TimelineInput = {
  job: number;
  level: number;
  bands: Band[];
  /** 每一轉的攻略（一轉跟二轉都要） */
  guides: Map<number, GuideJob>;
  monsterIndex: Map<number, Monster>;
  spawns: Map<number, Array<[number, number]>>;
  maps: Record<string, Pick<MapRecord, "zh">>;
  training: TrainingRow[];
  pqs: GuidePq[];
  /** 主推卡；你在的那一段照它寫標籤、排第一列 */
  pick?: MainPick;
  /** 城鎮走得到（跟主推卡的「帶我去」同一個條件） */
  canGo: (map: number) => boolean;
};

/** 主推卡的答案：地圖名、組隊任務名，轉職卡就是「轉職」 */
export function pickTitle(pick: MainPick): string {
  return pick.kind === "map" ? pick.option.title : pick.kind === "pq" ? pick.pq.name : "轉職";
}

/** 你在哪一段（滿等時是最後一段） */
export function activeBandIndex(bands: Band[], level: number): number {
  const index = bands.findIndex(band => level >= band.from && level < band.to);
  return index < 0 ? bands.length - 1 : index;
}

export function bandGuide(guides: Map<number, GuideJob>, job: number, band: Band): { stage: number; guide?: GuideJob } {
  if (isIslandBand(band)) return { stage: 0 };
  const stage = stageJob(job, band.from);
  return { stage, guide: guides.get(stage) };
}

/** 同一張圖、同一個組隊任務的攻略段落併成一列 */
function rowKey(segment: GuideTrain): string {
  if (segment.pq) return `pq:${segment.pq}`;
  return segment.map !== null ? `map:${segment.map}` : `name:${shortName(segment.name)}`;
}

/** 這段練功清單最多列幾張能用的攻略圖 */
const SHOWN_USABLE = 3;
/** 遊戲資料替代最多幾張 */
const FALLBACK_COUNT = 2;

export function bandPlan(input: TimelineInput, band: Band, active: boolean): BandPlan {
  const { job, level, guides, monsterIndex, spawns, maps, training, pqs, pick, canGo } = input;
  const { stage, guide } = bandGuide(guides, job, band);
  const island = onIsland(job, level);
  const goTo = (map: number | null) => (map !== null && canGo(map) && (island || !isIslandMap(map)) ? map : undefined);
  const mobsOn = (map: number) => (spawns.get(map) ?? []).map(([id]) => id);

  // 先判斷職業規則（你在的這段用現在等級），同一張圖併成一組，再挑要列的（湊滿 3 張能用的就停）
  const all = guide ? trainingForBand(band, guide.train) : [];
  const warnOf = (segment: GuideTrain): string | undefined => {
    if (!segment.map) return undefined;
    const fit = jobFit(stage, fitLevel(band, segment, active ? level : undefined), spawns.get(segment.map) ?? [], monsterIndex);
    return fit.ok ? undefined : fit.note ?? "這個職業不適合";
  };
  const groups: Array<{ key: string; segments: GuideTrain[] }> = [];
  for (const segment of all) {
    const key = rowKey(segment);
    const group = groups.find(entry => entry.key === key);
    if (group) group.segments.push(segment);
    else groups.push({ key, segments: [segment] });
  }
  const blockedGroup = (group: { segments: GuideTrain[] }) => group.segments.every(segment => warnOf(segment) !== undefined);
  const toRow = (group: { key: string; segments: GuideTrain[] }): TrainRow => {
    const covering = group.segments.find(segment => segment.from <= level && level <= segment.to);
    const primary = covering ?? group.segments[0];
    const pq = primary.pq ? pqs.find(entry => entry.key === primary.pq) : undefined;
    const map = pq ? pq.entrance : primary.map;
    const warn = blockedGroup(group) ? warnOf(primary) : undefined;
    return {
      key: group.key,
      title: pq?.name ?? (primary.map !== null ? maps[String(primary.map)]?.zh || shortName(primary.name) : shortName(primary.name)),
      map,
      from: covering ? covering.from : Math.min(...group.segments.map(segment => segment.from)),
      to: covering ? covering.to : Math.max(...group.segments.map(segment => segment.to)),
      party: primary.kind === "party",
      pq,
      mobs: [...new Set(group.segments.flatMap(segment => segment.mobs))],
      why: primary.why,
      v: primary.v,
      s: primary.s,
      warn,
      source: "guide",
      // 被職業規則擋掉的圖只當資訊（照列、寫原因），不給「去」（round 4，persona 第三輪三-8）
      go: warn ? undefined : goTo(map),
    };
  };
  let rows = segmentsToShow(groups, blockedGroup, SHOWN_USABLE).map(toRow);

  // 你在的這段：第一列就是主推卡本身——同一張圖／組隊任務，用主推依據的那段（範圍、組隊、理由、來源），
  // 不拿這段自己的段落重組（劍士 18 卡寫 Lv.13–30，列不能寫 13–20；卡是單人，列不能挑同一張圖的組隊段落）
  if (active && pick && pick.kind !== "advance") {
    const first = pickRow(pick, input.guides, level, goTo);
    rows = [first, ...rows.filter(entry => entry.key !== first.key)];
  }
  // 能用的攻略列（含上面主推那列）：有的話就不說「這段還沒有玩家攻略」，也不放遊戲資料替代
  const usable = rows.filter(entry => entry.source === "guide" && !entry.warn).length;

  // 遊戲資料替代：沒有能用的攻略時才放；王圖（刷怪點 3 個以下）、楓之島、上面已經列的圖都不放
  const listedMaps = new Set(rows.map(entry => entry.map));
  // 查哪個等級：你在的這段用你現在的等級（跟 warnOf／fitLevel 同一套），其他段用段落中點；
  // 中點不超過等級上限前一級（原本寫死 99，100–120 那段的中點 110 會被砍成 99，查出來整段是空的）
  const middle = active ? level : Math.min(LEVEL_CAP - 1, Math.round((band.from + band.to - 1) / 2));
  const needData = !usable && !isIslandBand(band);
  const open = training.filter(entry => !isIslandMap(entry.m) && maps[String(entry.m)]?.zh && entry.sp > BOSS_SPAWN_MAX);
  const fits = (map: number) => jobFit(stage, middle, spawns.get(map) ?? [], monsterIndex).ok;
  const pickData = (query: number) =>
    planTraining({ level: query, job: stage }, open.filter(entry => !listedMaps.has(entry.m)), monsterIndex, 8)
      .filter(entry => fits(entry.row.m))
      .slice(0, FALLBACK_COUNT);
  // 能練的最高圖（跟主推卡同一套：職業規則、不是王圖、城鎮走得到，同等級先看效率高的）
  const cap = needData ? open.filter(entry => fits(entry.m) && canGo(entry.m)).sort((a, b) => b.lv - a.lv || b.eff - a.eff)[0] : undefined;
  let picked = needData ? pickData(middle) : [];
  // 段落比所有開放的練功圖高太多（V002 的 100–120、沒有攻略的 90–100）：照中點每張圖都低太多、查出來是空的，
  // 畫面只剩一句「以下是遊戲資料推算」——改從能練的最高圖那個等級查，跟主推卡在這些等級推的圖一樣
  if (!picked.length && cap) picked = pickData(cap.lv);
  const fallback = picked.map((entry): TrainRow => ({
    key: `map:${entry.row.m}`,
    title: maps[String(entry.row.m)]?.zh ?? String(entry.row.m),
    map: entry.row.m,
    party: false,
    mobs: entry.lead ? [entry.lead.id] : mobsOn(entry.row.m).slice(0, 1),
    source: "data",
    exp1: entry.row.exp1,
    go: goTo(entry.row.m),
  }));

  // 封頂提示（規格：新地區的怪最高只到 Lv.N，100 以上的段落照實講）：門檻跟主推卡一樣（比最高圖高 10 級以上）；
  // 寫的等級取最高圖跟這段列出來的遊戲資料圖上最高等的怪，不會「最高到 Lv.73」旁邊擺 Lv75 的怪
  const topMob = (map: number | null) => Math.max(0, ...(map === null ? [] : spawns.get(map) ?? []).map(([id]) => monsterIndex.get(id)?.lv ?? 0));
  const shown = [...rows.filter(entry => entry.source === "data"), ...fallback];
  const ceiling: Ceiling | undefined = cap && middle - cap.lv >= CEILING_GAP
    ? { level: cap.lv, top: Math.max(topMob(cap.m) || cap.lv, ...shown.map(entry => topMob(entry.map))), best: false }
    : undefined;

  // 被擋：列出來的攻略列全被職業規則擋掉（主推那列是攻略時不算被擋）
  return { band, stage, guide, rows, usable, blocked: usable === 0 && rows.some(entry => entry.warn !== undefined), fallback, ceiling };
}

/**
 * 你在這一段的第一列＝主推卡本身。組隊任務：卡上的範圍（window），理由照寫這個範圍的攻略職業那段組隊段落
 * （涵蓋你等級的那段，沒有就第一段）；練功圖：主推依據的攻略段落（範圍、組隊、理由），遊戲資料的圖就標遊戲資料、不掛攻略理由。
 */
function pickRow(
  pick: Exclude<MainPick, { kind: "advance" }>,
  guides: Map<number, GuideJob>,
  level: number,
  goTo: (map: number | null) => number | undefined,
): TrainRow {
  if (pick.kind === "pq") {
    const own = (guides.get(pick.job)?.train ?? []).filter(segment => segment.pq === pick.pq.key);
    const segment = own.find(entry => entry.from <= level && level <= entry.to) ?? own[0];
    return {
      key: `pq:${pick.pq.key}`,
      title: pick.pq.name,
      map: pick.pq.entrance,
      from: pick.window[0],
      to: pick.window[1],
      party: true,
      pq: pick.pq,
      mobs: segment?.mobs ?? [],
      why: segment?.why || undefined,
      v: segment?.v,
      s: segment?.s,
      source: "guide",
      go: goTo(pick.pq.entrance),
    };
  }
  const { option } = pick;
  const segment = option.source === "guide" ? option.guide : undefined;
  return {
    key: `map:${option.map}`,
    title: option.title,
    map: option.map,
    from: segment?.from,
    to: segment?.to,
    party: option.party,
    mobs: option.mobs.map(([id]) => id),
    why: segment?.why || undefined,
    v: segment?.v,
    s: segment?.s,
    source: option.source,
    exp1: option.row?.exp1,
    go: goTo(option.map),
  };
}

/**
 * 每一段的練功清單與標籤。標籤規則：
 * - 你在的這段＝主推卡的答案（地圖名、組隊任務名、轉職卡寫「轉職」）
 * - 楓之島那段寫「楓之島」；初心者其他段寫「轉職後排給你」
 * - 其他照清單內容：能用的攻略圖第一張；攻略圖全被職業規則擋掉時寫遊戲資料替代的第一張；
 *   同一張圖不在相鄰兩段重複，沒有別的可用時寫「同上一段」；沒有攻略段落就沒有標籤（畫面寫「還沒有玩家攻略」）
 */
export function timelinePlans(input: TimelineInput): { activeIndex: number; plans: BandPlan[]; labels: Array<string | undefined> } {
  const activeIndex = activeBandIndex(input.bands, input.level);
  const plans = input.bands.map((band, index) => bandPlan(input, band, index === activeIndex));
  const labels: Array<string | undefined> = [];
  plans.forEach((plan, index) => {
    const previous = index > 0 ? labels[index - 1] : undefined;
    if (index === activeIndex && input.pick) {
      labels.push(pickTitle(input.pick));
      return;
    }
    if (isIslandBand(plan.band)) {
      labels.push("楓之島");
      return;
    }
    if (input.job === 0) {
      labels.push("轉職後排給你");
      return;
    }
    const names = plan.usable
      ? plan.rows.filter(entry => entry.source === "guide" && !entry.warn).map(entry => entry.title)
      : plan.blocked ? plan.fallback.map(entry => entry.title) : [];
    labels.push(names.find(name => name !== previous) ?? (names.length ? "同上一段" : undefined));
  });
  return { activeIndex, plans, labels };
}
