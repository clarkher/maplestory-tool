// src/lib/speed/server/rules.ts
import type { Monster, TrainingRow } from "@/lib/types";
import { backCalc, mapPartyExp, membersOf } from "../party-exp";

/** 頁面送來的一段（spec「資料庫」）；伺服器自己算 10 分鐘經驗、進不進排行、全隊打幾隻 */
export type RunPayload = {
  mapId: number | null;
  mapName: string | null;
  level: number;
  job: number | null;
  charId: string;
  isPublic: boolean;
  /** 其他隊員的等級（0～5 個）；單練是空陣列 */
  partyLevels: number[];
  /** 誰在打怪：0＝自己，i≥1＝partyLevels[i−1] */
  partyHitter: number;
  mode: "auto" | "manual";
  startedAt: string;
  durationSec: number;
  expGained: number;
  levelUps: number;
  deaths: number;
  clientVer: string;
};
export type RunRow = RunPayload & {
  expPer10: number;
  ranked: boolean;
  /** 自己＋其他隊員 */
  partySize: number;
  /** 照組隊經驗公式回推：全隊 10 分鐘打幾隻（小數一位）；沒有這張圖的練功資料、或自己吸不到經驗時 null */
  killsPer10: number | null;
};

export const RANK_MIN_SEC = 600;
export const RATE_LIMIT_PER_MIN = 6;
const LEEWAY = 3;
const MAX_OTHERS = 5;

const isInt = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

export function checkRun(body: unknown): { ok: true; run: RunPayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "格式不對" };
  const b = body as Record<string, unknown>;
  const charId = typeof b.charId === "string" ? b.charId.trim() : "";
  const length = Array.from(charId).length;
  if (length < 2 || length > 12) return { ok: false, error: "角色 ID 要 2～12 個字" };
  if (!isInt(b.level, 1, 120)) return { ok: false, error: "等級不對" };
  if (!isInt(b.durationSec, 300, 6 * 3600)) return { ok: false, error: "時間要 5 分鐘到 6 小時" };
  if (!isInt(b.expGained, 0, Number.MAX_SAFE_INTEGER)) return { ok: false, error: "經驗不對" };
  const partyLevels = b.partyLevels;
  if (!Array.isArray(partyLevels) || partyLevels.length > MAX_OTHERS) return { ok: false, error: "組隊的其他隊員最多 5 個" };
  if (!partyLevels.every(level => isInt(level, 1, 120))) return { ok: false, error: "組隊隊員的等級要 1～120" };
  if (!isInt(b.partyHitter, 0, partyLevels.length)) return { ok: false, error: "組隊裡打怪的人不對" };
  if (b.mode !== "auto" && b.mode !== "manual") return { ok: false, error: "模式不對" };
  if (typeof b.startedAt !== "string" || Number.isNaN(Date.parse(b.startedAt))) return { ok: false, error: "開始時間不對" };
  if (b.mapId !== null && !isInt(b.mapId, 0, 999_999_999)) return { ok: false, error: "地圖不對" };
  if (b.job !== null && !isInt(b.job, 0, 999)) return { ok: false, error: "職業不對" };
  return {
    ok: true,
    run: {
      mapId: b.mapId as number | null,
      mapName: typeof b.mapName === "string" ? b.mapName.slice(0, 40) : null,
      level: b.level,
      job: b.job as number | null,
      charId,
      isPublic: b.isPublic === true,
      partyLevels: partyLevels as number[],
      partyHitter: b.partyHitter,
      mode: b.mode,
      startedAt: b.startedAt,
      durationSec: b.durationSec,
      expGained: b.expGained,
      levelUps: isInt(b.levelUps, 0, 120) ? b.levelUps : 0,
      deaths: isInt(b.deaths, 0, 1000) ? b.deaths : 0,
      clientVer: typeof b.clientVer === "string" ? b.clientVer.slice(0, 20) : "",
    },
  };
}

export function expPer10(gained: number, sec: number): number {
  return Math.round((gained / sec) * 600);
}

/**
 * 這張圖 10 分鐘理論上拿得到的經驗上限（防灌假資料用，故意算寬）：
 * 每隻怪經驗 × 刷怪點 × (600 ÷ 重生秒數)，再 × 3（組隊加成、活動、經驗卷的寬限）。重生秒數 0＝預設 7 秒，最少算 5 秒。
 * 沒有練功資料的圖回 null（不擋）。
 */
export function mapCap(mapId: number, training: TrainingRow[], monsters: Monster[]): number | null {
  const row = training.find(item => item.m === mapId);
  if (!row) return null;
  const expOf = new Map(monsters.map(monster => [monster.id, monster.exp]));
  let sum = 0;
  for (const [mobId, spawns, respawn] of row.mobs) sum += (expOf.get(mobId) ?? 0) * spawns * (600 / Math.max(5, respawn || 7));
  return Math.round(sum * LEEWAY);
}

/** 全隊 10 分鐘打幾隻：用自己量到的 10 分鐘經驗，照這張圖每隻怪自己拿多少回推 */
function killsPer10Of(run: RunPayload, per10: number, row: TrainingRow, monsters: Map<number, Monster>): number | null {
  const members = membersOf(run.level, { on: run.partyLevels.length > 0, others: run.partyLevels, hitter: run.partyHitter });
  const back = backCalc(per10, mapPartyExp(row, monsters, members).perKill);
  return back ? Math.round(back.kills * 10) / 10 : null;
}

export function toRow(run: RunPayload, cap: number | null, row?: TrainingRow, monsters?: Map<number, Monster>): RunRow {
  const per10 = expPer10(run.expGained, run.durationSec);
  const ranked = run.durationSec >= RANK_MIN_SEC && run.mapId !== null && (cap === null || per10 <= cap);
  const killsPer10 = row && monsters ? killsPer10Of(run, per10, row, monsters) : null;
  return { ...run, expPer10: per10, ranked, partySize: 1 + run.partyLevels.length, killsPer10 };
}
