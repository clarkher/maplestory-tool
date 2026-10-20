// src/lib/speed/server/rules.ts
import type { Monster, TrainingRow } from "@/lib/types";
import { backCalc, mapPartyExp, membersOf } from "../party-exp";

/** 頁面送來的一段（spec「資料庫」）；伺服器自己算 10 分鐘經驗、進不進排行、全隊打幾隻 */
export type RunPayload = {
  mapId: number | null;
  mapName: string | null;
  level: number;
  job: number | null;
  /** 角色 ID；沒填是 null（10/20 起沒填也收，排行寫匿名玩家） */
  charId: string | null;
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
  /** 10 分鐘經驗；有開加倍券的是扣掉加倍後回推的真實速度（realExpPer10） */
  expPer10: number;
  ranked: boolean;
  /** 自己＋其他隊員 */
  partySize: number;
  /** 照組隊經驗公式回推：全隊 10 分鐘打幾隻（小數一位）；沒有這張圖的練功資料、或自己吸不到經驗時 null */
  killsPer10: number | null;
  /** 加倍券倍率（兩位小數）；沒開是 null */
  couponMult: number | null;
  /** 這段裡有開加倍券的分鐘數；沒開是 null */
  couponMin: number | null;
};

/** 加倍券：倍率跟這段裡有開的分鐘數（玩家存好之後才回答，PATCH 改同一筆） */
export type Coupon = { mult: number; minutes: number };

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

/** 角色 ID：沒給、null、只有空白 → null（沒填）；有填才檢查 2～12 個字、不能有看不見的字元；不是字串的不收 */
function checkCharId(value: unknown): { ok: true; charId: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, charId: null };
  if (typeof value !== "string") return { ok: false, error: "角色 ID 要 2～12 個字" };
  const charId = value.trim();
  if (charId === "") return { ok: true, charId: null };
  // 12 個字最多 48 個 UTF-16 單位；太長的不用拆字就擋掉
  if (charId.length > 48) return { ok: false, error: "角色 ID 要 2～12 個字" };
  const length = Array.from(charId).length;
  if (length < 2 || length > 12) return { ok: false, error: "角色 ID 要 2～12 個字" };
  if (INVISIBLE.test(charId)) return { ok: false, error: "角色 ID 不能有看不見的字元或換行" };
  return { ok: true, charId };
}

/** 文字欄位：先砍掉太長的（超長輸入不用整串處理），拿掉看不見的字元，再照字數（不是 UTF-16 單位）切，成對的字不會被切成半個 */
function cleanText(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string") return null;
  return Array.from(value.slice(0, maxChars * 4).replace(INVISIBLE_ALL, "")).slice(0, maxChars).join("");
}

/** now 只給測試用，平常用系統的現在 */
export function checkRun(body: unknown, now: number = Date.now()): { ok: true; run: RunPayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "格式不對" };
  const b = body as Record<string, unknown>;
  const id = checkCharId(b.charId);
  if (!id.ok) return id;
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
      charId: id.charId,
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

/** 加倍券倍率的範圍（含兩端）；頁面可以打兩位小數，浮點誤差（1 + 0.1 ＝ 1.1000000000000001）算在範圍內 */
const COUPON_MULT_MIN = 1.1;
const COUPON_MULT_MAX = 3;
const FLOAT_SLACK = 1e-9;

/**
 * 加倍券的檢查：null＝沒開（合法）；物件要有倍率 1.10～3.00、有開的分鐘數 1～這段的分鐘數（無條件進位，905 秒最多填 16）。
 * 倍率存成兩位小數；多塞的欄位丟掉，只回新的物件。
 */
export function checkCoupon(value: unknown, durationSec: number): { ok: true; coupon: Coupon | null } | { ok: false; error: string } {
  if (value === null) return { ok: true, coupon: null };
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "加倍券格式不對" };
  const { mult, minutes } = value as Record<string, unknown>;
  if (typeof mult !== "number" || !Number.isFinite(mult) || mult < COUPON_MULT_MIN - FLOAT_SLACK || mult > COUPON_MULT_MAX + FLOAT_SLACK) {
    return { ok: false, error: "倍率要 1.10～3.00" };
  }
  if (!isInt(minutes, 1, Math.ceil(durationSec / 60))) return { ok: false, error: "加倍的分鐘數不對" };
  return { ok: true, coupon: { mult: Math.round(mult * 100) / 100, minutes } };
}

/**
 * 扣掉加倍券之後真實的 10 分鐘經驗：拿到的經驗 ÷（沒開的分鐘 + 有開的分鐘 × 倍率）× 10。
 * 分鐘用秒數 ÷ 60（小數）；填的分鐘數比這段長（無條件進位多出來的那一點）就當整段都開。沒開（null）就是原本的 expPer10。
 */
export function realExpPer10(gained: number, sec: number, coupon: Coupon | null): number {
  if (!coupon) return expPer10(gained, sec);
  const total = sec / 60;
  const on = Math.min(coupon.minutes, total);
  return Math.round((gained / (total - on + on * coupon.mult)) * 10);
}

/** 一個刷怪點多久重生一隻（秒）：0＝預設 7 秒，最少算 5 秒（經驗上限、打幾隻上限都用這個） */
const respawnSec = (respawn: number): number => Math.max(5, respawn || 7);

/**
 * 這張圖 10 分鐘理論上拿得到的經驗上限（防灌假資料用，故意算寬）：
 * 每隻怪經驗 × 刷怪點 × (600 ÷ 重生秒數)，再 × 3（組隊加成、活動、經驗卷的寬限）。重生秒數照每隻怪實際的（0＝預設 7 秒），最少算 5 秒。
 * 沒有練功資料的圖回 null（算不出上限，toRow 不讓它進排行）。
 */
export function mapCap(mapId: number, training: TrainingRow[], monsters: Monster[]): number | null {
  const row = training.find(item => item.m === mapId);
  if (!row) return null;
  const expOf = new Map(monsters.map(monster => [monster.id, monster.exp]));
  let sum = 0;
  for (const [mobId, spawns, respawn] of row.mobs) sum += (expOf.get(mobId) ?? 0) * spawns * (600 / respawnSec(respawn));
  return Math.round(sum * LEEWAY);
}

/**
 * 這張圖全隊 10 分鐘最多打得到幾隻（防灌組隊榜用，跟經驗上限一樣故意算寬）：
 * 每個刷怪點 600 秒 ÷ 重生秒數，全部加起來，再 × 3。
 * 為什麼要另外擋：組隊榜照「全隊打幾隻」排，打幾隻是用自己拿的經驗回推；自己等級很低、隊友等級很高時，
 * 自己每隻只分到一點點，經驗沒超過上限，回推出來的隻數卻可以大到這張圖不可能打得到。
 */
export function mapKillCap(row: TrainingRow): number {
  let sum = 0;
  for (const [, spawns, respawn] of row.mobs) sum += spawns * (600 / respawnSec(respawn));
  return Math.round(sum * LEEWAY);
}

/** 全隊 10 分鐘打幾隻：用自己量到的 10 分鐘經驗，照這張圖每隻怪自己拿多少回推 */
function killsPer10Of(run: RunPayload, per10: number, row: TrainingRow, monsters: Map<number, Monster>): number | null {
  const members = membersOf(run.level, { on: run.partyLevels.length > 0, others: run.partyLevels, hitter: run.partyHitter });
  const back = backCalc(per10, mapPartyExp(row, monsters, members).perKill);
  return back ? Math.round(back.kills * 10) / 10 : null;
}

/**
 * 一筆紀錄算好要存的欄位。進排行要全部成立：滿 10 分鐘、有地圖、這張圖有經驗上限而且沒超過、真的拿到經驗；
 * 組隊的另外要算得出「全隊打幾隻」（組隊榜照它排）而且沒超過這張圖打得到的隻數（mapKillCap）。
 * 有開加倍券（coupon）：10 分鐘經驗、全隊打幾隻都用扣掉加倍後的真實速度；
 * 經驗上限照量到的原始速度擋（量到的就是加倍過的，上限本來就留了經驗卷的寬限）。
 */
export function toRow(run: RunPayload, cap: number | null, row?: TrainingRow, monsters?: Map<number, Monster>, coupon: Coupon | null = null): RunRow {
  const rawPer10 = expPer10(run.expGained, run.durationSec);
  const per10 = realExpPer10(run.expGained, run.durationSec, coupon);
  const killsPer10 = row && monsters ? killsPer10Of(run, per10, row, monsters) : null;
  const party = run.partyLevels.length > 0;
  // 沒有上限（這張圖沒有練功資料，例如亂編的地圖編號）不能進排行：不然灌多少都擋不住
  const expOk = run.durationSec >= RANK_MIN_SEC && run.mapId !== null && cap !== null && rawPer10 <= cap && run.expGained > 0;
  const killsOk = !party || (row !== undefined && killsPer10 !== null && killsPer10 <= mapKillCap(row));
  return {
    ...run,
    expPer10: per10,
    ranked: expOk && killsOk,
    partySize: 1 + run.partyLevels.length,
    killsPer10,
    couponMult: coupon?.mult ?? null,
    couponMin: coupon?.minutes ?? null,
  };
}

/**
 * 排行一列：name 是 null 代表沒公開、或沒填角色 ID（畫面都寫「匿名玩家」）。
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
