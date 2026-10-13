// src/lib/speed/tracker.ts
/**
 * 練功測速「一段」怎麼算（spec「一段怎麼算」）。純函式：每秒丟一張讀數進來，回新的狀態跟剛收掉的那段。
 * - 自動：經驗一動才開始（那一下不算，起點就是那一刻）；60 秒沒動就停，結束算在最後一次變動；換地圖收掉。
 * - 手動：按開始到按停止，中間不停、換圖不停；地圖記拿最多經驗的那張。
 * - 升級：上一級剩的＋新一級的；死掉（少了這級升級經驗 1% 以上）照扣；少一點點、跳兩級、等級變少都當認錯丟掉。
 * - 起點要兩張等級一樣的讀數（第一次反推等級可能剛好對錯）。
 * - 擋認錯（10/13）：讀數偶爾會把一個數字認錯（約 0.4% 會變成「一秒拿半級」），所以一張讀數比上一張多太多、
 *   或往下掉太多（超過這級升級經驗 20%）也當認錯丟掉；連續認錯太久就丟掉起點重來（進行中的那段留著，新起點接著算）。
 */
export type Mode = "auto" | "manual";
export type Sample = { at: number; exp: number; level: number; mapKey: string | null; mapId: number | null; job: number | null; party: number };
export type Segment = {
  mode: Mode;
  startedAt: number;
  endedAt: number;
  lastChangeAt: number;
  startLevel: number;
  level: number;
  exp: number;
  job: number | null;
  party: number;
  mapKey: string | null;
  gained: number;
  levelUps: number;
  deaths: number;
  byMap: Record<string, { mapId: number | null; gained: number }>;
};
export type Tracker = {
  mode: Mode;
  manualOn: boolean;
  manualStartedAt: number | null;
  last: Sample | null;
  pending: Sample | null;
  seg: Segment | null;
  /** 連續幾張對不上（認錯、跳級、太大的跳動）；接受一張就歸零 */
  misses: number;
};
export type Step = { tracker: Tracker; closed: Segment | null };

export const IDLE_MS = 60_000;
export const MIN_SAVE_MS = 5 * 60_000;
/** 往下掉要到這級升級經驗的 1% 才算死掉，再少當成認錯（雜訊）丟掉 */
const DEATH_SHARE = 0.01;
/**
 * 往下掉最多只算到這級升級經驗的 20%，再多當成認錯（跟太大的進帳一樣算一次對不上）。
 * 經典版死亡最多扣這級的 10%，留一倍空間；沒有這條，一張認錯的低讀數會被當成死亡永久扣掉，
 * 回到正確讀數那一下的進帳又被上限擋掉，扣掉的補不回來。
 */
export const MAX_DEATH_SHARE = 0.2;
/**
 * 一張讀數最多只能比上一張多「這級升級經驗的 10%」（隔越久放越寬：每 10 秒多一份）；超過當成認錯。
 * 注意：真的單次大額進帳（打王、任務獎勵，超過一級 10%）也會被當認錯丟掉，
 * 連續對不上自癒、重新起算後也不補算——是「丟掉」，不會重複算。
 */
export const MAX_STEP_SHARE = 0.1;
/** 隔多久放寬一份上限（每 10 秒多一份 MAX_STEP_SHARE） */
const STEP_RELAX_MS = 10_000;
/** 連續這麼多張對不上（認錯、跳級、太大的跳動、掉太多），就丟掉起點重來（見 MAX_STEP_SHARE 的說明） */
export const MISS_LIMIT = 10;

export function createTracker(mode: Mode): Tracker {
  return { mode, manualOn: false, manualStartedAt: null, last: null, pending: null, seg: null, misses: 0 };
}

type Gain = { gain: number; levelUp: boolean; death: boolean };

/** 這級升級要多少經驗；表裡沒有這級就當 0 */
function levelNeed(toNext: number[], level: number): number {
  return toNext[level] ?? 0;
}

function gainBetween(prev: Sample, next: Sample, toNext: number[]): Gain | null {
  if (next.level === prev.level) {
    const diff = next.exp - prev.exp;
    if (diff >= 0) return { gain: diff, levelUp: false, death: false };
    const need = levelNeed(toNext, prev.level);
    return -diff >= need * DEATH_SHARE && -diff <= need * MAX_DEATH_SHARE ? { gain: diff, levelUp: false, death: true } : null;
  }
  if (next.level === prev.level + 1) return { gain: Math.max(0, levelNeed(toNext, prev.level) - prev.exp) + next.exp, levelUp: true, death: false };
  return null;
}

function newSegment(mode: Mode, from: Sample, at: number): Segment {
  return {
    mode, startedAt: at, endedAt: at, lastChangeAt: at, startLevel: from.level, level: from.level, exp: from.exp,
    job: from.job, party: from.party, mapKey: from.mapKey, gained: 0, levelUps: 0, deaths: 0, byMap: {},
  };
}

function withSample(seg: Segment, sample: Sample, gain: Gain | null): Segment {
  // 一開始讀不到地圖的那段，看到第一個有地圖的就補上
  const next: Segment = { ...seg, level: sample.level, exp: sample.exp, job: sample.job ?? seg.job, party: Math.max(seg.party, sample.party), mapKey: seg.mapKey ?? sample.mapKey };
  if (!gain || gain.gain === 0) return next;
  // 讀不到地圖的那一張，經驗照算，但不記到哪張圖
  const key = sample.mapKey;
  const slot = key ? seg.byMap[key] ?? { mapId: sample.mapId, gained: 0 } : null;
  return {
    ...next,
    gained: seg.gained + gain.gain,
    levelUps: seg.levelUps + (gain.levelUp ? 1 : 0),
    deaths: seg.deaths + (gain.death ? 1 : 0),
    lastChangeAt: sample.at,
    endedAt: seg.mode === "auto" ? sample.at : seg.endedAt,
    byMap: key && slot ? { ...seg.byMap, [key]: { mapId: slot.mapId ?? sample.mapId, gained: slot.gained + gain.gain } } : seg.byMap,
  };
}

export function feed(t: Tracker, sample: Sample, toNext: number[]): Step {
  if (!t.last) {
    if (t.pending && t.pending.level === sample.level) {
      const seg = t.mode === "manual" && t.manualOn && !t.seg ? newSegment("manual", sample, t.manualStartedAt ?? sample.at) : t.seg;
      return { tracker: { ...t, last: sample, pending: null, seg, misses: 0 }, closed: null };
    }
    return { tracker: { ...t, pending: sample }, closed: null };
  }
  const gain = gainBetween(t.last, sample, toNext);
  const limit = MAX_STEP_SHARE * levelNeed(toNext, t.last.level) * Math.max(1, (sample.at - t.last.at) / STEP_RELAX_MS);
  if (!gain || gain.gain > limit) {
    const misses = t.misses + 1;
    // 認錯太久：丟掉起點，這張當候選，下一張同等級的再當新起點；進行中的那段留著
    if (misses >= MISS_LIMIT) return { tracker: { ...t, last: null, pending: sample, misses: 0 }, closed: null };
    return { tracker: { ...t, misses }, closed: null };
  }
  let seg = t.seg;
  let closed: Segment | null = null;
  if (t.mode === "auto") {
    if (seg && sample.mapKey && seg.mapKey && sample.mapKey !== seg.mapKey) {
      closed = seg;
      seg = null;
    }
    if (!seg) {
      if (gain.gain > 0) seg = newSegment("auto", sample, sample.at);
    } else seg = withSample(seg, sample, gain);
  } else if (t.manualOn) {
    seg = withSample(seg ?? newSegment("manual", t.last, t.manualStartedAt ?? sample.at), sample, gain);
  }
  return { tracker: { ...t, last: sample, seg, misses: 0 }, closed };
}

export function tick(t: Tracker, now: number): Step {
  if (t.mode !== "auto" || !t.seg || now - t.seg.lastChangeAt < IDLE_MS) return { tracker: t, closed: null };
  return { tracker: { ...t, seg: null }, closed: { ...t.seg, endedAt: t.seg.lastChangeAt } };
}

export function startManual(t: Tracker, now: number): Tracker {
  const seg = t.last ? newSegment("manual", t.last, now) : null;
  return { ...t, manualOn: true, manualStartedAt: now, seg };
}

export function stopManual(t: Tracker, now: number): Step {
  return { tracker: { ...t, manualOn: false, manualStartedAt: null, seg: null }, closed: t.seg ? { ...t.seg, endedAt: now } : null };
}

export function switchMode(t: Tracker, mode: Mode, now: number): Step {
  const closed = t.seg ? { ...t.seg, endedAt: t.seg.mode === "auto" ? t.seg.lastChangeAt : now } : null;
  return { tracker: { ...createTracker(mode), last: t.last, pending: t.pending, misses: 0 }, closed };
}

/** 這段多長：自動算到最後一次變動；手動算到按停止（進行中算到最後一次讀數由畫面自己用現在時間算） */
export function durationMs(seg: Segment): number {
  return (seg.mode === "auto" ? seg.lastChangeAt : seg.endedAt) - seg.startedAt;
}

/** 畫面上的 10 分鐘經驗：拿到的 ÷（最後一次變動 − 開始），不到 30 秒或還沒拿到不算 */
export function tenMinuteExp(seg: Segment): number | null {
  const ms = seg.lastChangeAt - seg.startedAt;
  return ms >= 30_000 && seg.gained > 0 ? Math.round((seg.gained / ms) * 600_000) : null;
}

export function minutesToLevel(seg: Segment, toNext: number[]): number | null {
  const per10 = tenMinuteExp(seg);
  const need = levelNeed(toNext, seg.level) - seg.exp;
  return per10 && need > 0 ? (need / per10) * 10 : null;
}

/** 這段算在哪張圖：拿最多經驗的那張（自動模式一段只有一張）；一張圖的經驗都沒記到（讀不到地圖）就是 null */
export function mainMap(seg: Segment): { key: string | null; mapId: number | null } {
  let best: { key: string; mapId: number | null; gained: number } | null = null;
  for (const [key, slot] of Object.entries(seg.byMap)) if (!best || slot.gained > best.gained) best = { key, mapId: slot.mapId, gained: slot.gained };
  return best ? { key: best.key, mapId: best.mapId } : { key: null, mapId: null };
}

export function shouldSave(seg: Segment): boolean {
  return durationMs(seg) >= MIN_SAVE_MS && seg.gained > 0;
}

/** 給讀畫面用的等級提示：知道現在幾等就給這級跟下一級 */
export function levelHints(t: Tracker): number[] {
  return t.last ? [t.last.level, t.last.level + 1] : [];
}
