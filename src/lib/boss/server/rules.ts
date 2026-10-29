// src/lib/boss/server/rules.ts
// 野王計時的伺服器端檢查規則（純函式，不碰資料庫）
import { EXPIRE_MS } from "../state";
import { BOSSES, SERVERS, type BossEvent, type ServerKey } from "../types";

/** 同一個位址一分鐘最多寫幾次 */
export const BOSS_WRITES_PER_MIN = 30;
/** 房間沒動靜多久後不再接受（24 小時） */
export const ROOM_TTL_MS = 24 * 3600_000;
/** 多久內有出現過算「在線」 */
export const ONLINE_MS = 120_000;
/** 回收間隔至少要有幾筆才採用 */
export const MIN_REPORT_SAMPLES = 20;
/** 同一個位址 10 分鐘內最多開幾間房間 */
export const ROOM_CREATES_PER_10MIN = 5;

const FUTURE_SLACK_MS = 5 * 60_000;
const ID_RE = /^[A-Za-z0-9-]{1,40}$/;
const BOSS_IDS = new Set(BOSSES.map(b => b.id));
const SERVER_KEYS = new Set<string>(SERVERS.map(s => s.key));

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && ID_RE.test(v);
const isServer = (v: unknown): v is ServerKey => typeof v === "string" && SERVER_KEYS.has(v);
const isBoss = (v: unknown): v is number => typeof v === "number" && BOSS_IDS.has(v);

/** 檢查單筆事件；回傳只含已知欄位的新物件，不合格回 null */
export function checkEvent(raw: unknown, now: number): BossEvent | null {
  if (!isObj(raw)) return null;
  const { id, server, boss, ch, kind, at, target } = raw;
  if (!isId(id) || !isServer(server) || !isBoss(boss)) return null;
  if (typeof ch !== "number" || !Number.isInteger(ch) || ch < 1 || ch > 60) return null;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  if (at < now - EXPIRE_MS || at > now + FUTURE_SLACK_MS) return null;
  if (kind === "kill" || kind === "empty") return { id, server, boss, ch, kind, at };
  if (kind === "retract") {
    if (!isId(target)) return null;
    return { id, server, boss, ch, kind, target, at };
  }
  return null;
}

/** 批次：1～100 筆，任一筆不合就整批 null */
export function checkEventBatch(raw: unknown, now: number): BossEvent[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 100) return null;
  const out: BossEvent[] = [];
  for (const item of raw) {
    const e = checkEvent(item, now);
    if (!e) return null;
    out.push(e);
  }
  return out;
}

/** 回收間隔回報：seconds 為 600～21600 的整數 */
export function checkInterval(raw: unknown): { server: ServerKey; boss: number; seconds: number } | null {
  if (!isObj(raw)) return null;
  const { server, boss, seconds } = raw;
  if (!isServer(server) || !isBoss(boss)) return null;
  if (typeof seconds !== "number" || !Number.isInteger(seconds) || seconds < 600 || seconds > 21600) return null;
  return { server, boss, seconds };
}
