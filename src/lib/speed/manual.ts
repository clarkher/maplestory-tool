// src/lib/speed/manual.ts

/**
 * 首屏手動輸入（v2.09，2026-11-11 使用者選 A）：玩家自己填「開始」「現在」的等級跟經驗（經驗也能拉 %），
 * 算 10 分鐘經驗、還要多久升級。手機不能分享畫面，只有這個；電腦分享畫面讀到的數字也會填進來、還能改。
 * 手打的數字沒辦法驗證，不進排行（使用者選），只記在這台電腦的「跟我之前比」。
 * toNext[等級]＝這一級升到下一級要的經驗（跟 data.toNext 同一份）。
 */

export type ManualRow = { level: number; exp: number };
/** 欄位裡的字（還沒驗過）＋按下去的時間（at，沒填好是 null） */
export type ManualText = { level: string; exp: string; at: number | null };
export type ManualState = { start: ManualText; now: ManualText; minutes: string };

export const EMPTY_MANUAL: ManualState = { start: { level: "", exp: "", at: null }, now: { level: "", exp: "", at: null }, minutes: "" };

const KEY = "ms-speed-manual";
const MAX_MINUTES = 24 * 60;

/** 全形數字換半形，拿掉逗號跟空白 */
function digits(text: string): string {
  return text.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/[,，\s]/g, "");
}

function maxLevel(toNext: number[]): number {
  let level = toNext.length - 1;
  while (level > 0 && !toNext[level]) level--;
  return level;
}

export function parseManualRow(
  text: { level: string; exp: string },
  toNext: number[],
): { ok: true; row: ManualRow } | { ok: false; field: "level" | "exp"; error: string } {
  const levelText = digits(text.level);
  if (!levelText) return { ok: false, field: "level", error: "等級要填" };
  const top = maxLevel(toNext);
  const level = /^\d+$/.test(levelText) ? Number(levelText) : NaN;
  if (!Number.isInteger(level) || level < 1 || level > top || !toNext[level]) return { ok: false, field: "level", error: `等級要填 1～${top}` };
  const expText = digits(text.exp);
  if (!expText) return { ok: false, field: "exp", error: "經驗要填" };
  if (!/^\d+$/.test(expText)) return { ok: false, field: "exp", error: "經驗只能填數字" };
  const exp = Number(expText);
  if (exp >= toNext[level]) return { ok: false, field: "exp", error: `Lv.${level} 經驗最多 ${toNext[level] - 1}` };
  return { ok: true, row: { level, exp } };
}

/** 拉 % 換成經驗：無條件捨去，最多到這一級要的減 1（100% 就升級了，不會停在 100%） */
export function expFromPercent(percent: number, level: number, toNext: number[]): number | null {
  const need = toNext[level];
  if (!need) return null;
  return Math.min(need - 1, Math.max(0, Math.floor((percent / 100) * need)));
}

export function parseMinutes(text: string): { ok: true; minutes: number } | { ok: false; error: string } {
  const value = digits(text);
  const minutes = /^\d+$/.test(value) ? Number(value) : NaN;
  return minutes >= 1 && minutes <= MAX_MINUTES ? { ok: true, minutes } : { ok: false, error: `分鐘要填 1～${MAX_MINUTES}` };
}

/** 兩列填好的時間差不到這麼多分鐘，就當是練完才回來一起填的：一列打字加拉 % 不會超過這麼久，練 3 分鐘以內也量不準 */
export const MIN_AUTO_MINUTES = 3;

/**
 * 練了幾分鐘照兩列填好的時間自己帶（v2.11）。兩列幾乎同時填好（練完才回來一起填）時看不出練多久，回 null 要玩家自己填
 * ——以前一律至少帶 1 分鐘，練 10 分鐘才回來填的人會看到 10 倍的 10 分鐘經驗（11/12 盤點）。
 */
export function autoMinutes(startAt: number | null, nowAt: number | null): number | null {
  if (startAt === null || nowAt === null) return null;
  const minutes = (nowAt - startAt) / 60_000;
  return minutes >= MIN_AUTO_MINUTES ? Math.round(minutes) : null;
}

/** 開始到現在拿了多少：同一級相減，跨級＝開始那級剩的＋中間整級＋現在這級的；現在比開始少回 null */
export function gainedBetween(start: ManualRow, now: ManualRow, toNext: number[]): number | null {
  if (now.level < start.level || (now.level === start.level && now.exp < start.exp)) return null;
  if (now.level === start.level) return now.exp - start.exp;
  let gained = toNext[start.level] - start.exp + now.exp;
  for (let level = start.level + 1; level < now.level; level++) gained += toNext[level] ?? 0;
  return gained;
}

export function manualResult(
  start: ManualRow,
  now: ManualRow,
  minutes: number,
  toNext: number[],
): { ok: true; gained: number; per10: number; etaMinutes: number } | { ok: false; error: string } {
  const gained = gainedBetween(start, now, toNext);
  if (gained === null) return { ok: false, error: "現在比開始還少，開始跟現在是不是填反了？" };
  if (gained === 0) return { ok: false, error: "現在的經驗跟開始一樣，還沒拿到經驗" };
  const per10 = (gained / minutes) * 10;
  return { ok: true, gained, per10, etaMinutes: ((toNext[now.level] - now.exp) / per10) * 10 };
}

type Store = Pick<Storage, "getItem" | "setItem">;

function isText(value: unknown): value is ManualText {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.level === "string" && typeof row.exp === "string" && (row.at === null || typeof row.at === "number");
}

/** 手機切出去打遊戲、回來分頁被重載也還在 */
export function readManual(store: Store): ManualState | null {
  try {
    const raw = JSON.parse(store.getItem(KEY) ?? "null") as Record<string, unknown> | null;
    if (!raw || !isText(raw.start) || !isText(raw.now) || typeof raw.minutes !== "string") return null;
    return { start: raw.start, now: raw.now, minutes: raw.minutes };
  } catch {
    return null;
  }
}

export function writeManual(store: Store, state: ManualState) {
  try {
    store.setItem(KEY, JSON.stringify(state));
  } catch {
    // 無痕、存不了：這次照樣算，只是重新整理後要重填
  }
}
