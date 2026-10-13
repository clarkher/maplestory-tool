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
/** 開始時間只收最近 7 天內、最多比伺服器現在晚 5 分鐘（電腦時鐘差一點） */
const START_MAX_AGE_MS = 7 * 24 * 3600_000;
const START_MAX_AHEAD_MS = 5 * 60_000;
/** 控制字元（含 NUL、換行）、格式字元（零寬空白、雙向控制）、單獨的代理字元：NUL 會讓 Postgres 的 text 寫入失敗，其他的會讓公開名字看起來是空白或被偽裝 */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const INVISIBLE_ALL = /[\p{Cc}\p{Cf}\p{Cs}]/gu;

const isInt = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

/** 文字欄位：先砍掉太長的（超長輸入不用整串處理），拿掉看不見的字元，再照字數（不是 UTF-16 單位）切，成對的字不會被切成半個 */
function cleanText(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string") return null;
  return Array.from(value.slice(0, maxChars * 4).replace(INVISIBLE_ALL, "")).slice(0, maxChars).join("");
}

/** now 只給測試用，平常用系統的現在 */
export function checkRun(body: unknown, now: number = Date.now()): { ok: true; run: RunPayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "格式不對" };
  const b = body as Record<string, unknown>;
  const charId = typeof b.charId === "string" ? b.charId.trim() : "";
  // 12 個字最多 48 個 UTF-16 單位；太長的不用拆字就擋掉
  if (charId.length > 48) return { ok: false, error: "角色 ID 要 2～12 個字" };
  const length = Array.from(charId).length;
  if (length < 2 || length > 12) return { ok: false, error: "角色 ID 要 2～12 個字" };
  if (INVISIBLE.test(charId)) return { ok: false, error: "角色 ID 不能有看不見的字元或換行" };
  if (!isInt(b.level, 1, 120)) return { ok: false, error: "等級不對" };
  if (!isInt(b.durationSec, 300, 6 * 3600)) return { ok: false, error: "時間要 5 分鐘到 6 小時" };
  if (!isInt(b.expGained, 0, Number.MAX_SAFE_INTEGER)) return { ok: false, error: "經驗不對" };
  const partyLevels = b.partyLevels;
  if (!Array.isArray(partyLevels) || partyLevels.length > MAX_OTHERS) return { ok: false, error: "組隊的其他隊員最多 5 個" };
  if (!partyLevels.every(level => isInt(level, 1, 120))) return { ok: false, error: "組隊隊員的等級要 1～120" };
  if (!isInt(b.partyHitter, 0, partyLevels.length)) return { ok: false, error: "組隊裡打怪的人不對" };
  if (b.mode !== "auto" && b.mode !== "manual") return { ok: false, error: "模式不對" };
  const startedMs = typeof b.startedAt === "string" ? Date.parse(b.startedAt) : Number.NaN;
  if (Number.isNaN(startedMs)) return { ok: false, error: "開始時間不對" };
  if (startedMs < now - START_MAX_AGE_MS || startedMs > now + START_MAX_AHEAD_MS) return { ok: false, error: "開始時間要在最近 7 天內" };
  if (b.mapId !== null && !isInt(b.mapId, 0, 999_999_999)) return { ok: false, error: "地圖不對" };
  if (b.job !== null && !isInt(b.job, 0, 999)) return { ok: false, error: "職業不對" };
  return {
    ok: true,
    run: {
      mapId: b.mapId as number | null,
      mapName: cleanText(b.mapName, 40) || null,
      level: b.level,
      job: b.job as number | null,
      charId,
      isPublic: b.isPublic === true,
      partyLevels: [...(partyLevels as number[])],
      partyHitter: b.partyHitter,
      mode: b.mode,
      startedAt: new Date(startedMs).toISOString(),
      durationSec: b.durationSec,
      expGained: b.expGained,
      levelUps: isInt(b.levelUps, 0, 120) ? b.levelUps : 0,
      deaths: isInt(b.deaths, 0, 1000) ? b.deaths : 0,
      clientVer: cleanText(b.clientVer, 20) ?? "",
    },
  };
}

export function expPer10(gained: number, sec: number): number {
  return Math.round((gained / sec) * 600);
}

/**
 * 這張圖 10 分鐘理論上拿得到的經驗上限（防灌假資料用，故意算寬）：
 * 每隻怪經驗 × 刷怪點 × (600 ÷ 重生秒數)，再 × 3（組隊加成、活動、經驗卷的寬限）。重生秒數 0＝預設 7 秒，最少算 5 秒。
 * 沒有練功資料的圖回 null（算不出上限，toRow 不讓它進排行）。
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
  // 沒有上限（這張圖沒有練功資料，例如亂編的地圖編號）不能進排行：不然灌多少都擋不住
  const ranked = run.durationSec >= RANK_MIN_SEC && run.mapId !== null && cap !== null && per10 <= cap;
  const killsPer10 = row && monsters ? killsPer10Of(run, per10, row, monsters) : null;
  return { ...run, expPer10: per10, ranked, partySize: 1 + run.partyLevels.length, killsPer10 };
}

/**
 * 排行一列：name 是 null 代表沒公開（畫面寫「匿名玩家」）。
 * expPer10 是這個人自己 10 分鐘拿的經驗；kills 是回推的全隊 10 分鐘打幾隻（組隊榜照它排；算不出來是 null）。
 */
export type BoardRow = {
  name: string | null;
  job: number | null;
  level: number;
  expPer10: number;
  minutes: number;
  date: string;
  /** 自己＋其他隊員；單練是 1 */
  partySize: number;
  kills: number | null;
};
