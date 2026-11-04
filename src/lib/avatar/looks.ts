/**
 * 紙娃娃的「鎖定」跟「上一套」：全是純函式，不碰 DOM、不碰 storage（UI 把字串存進 sessionStorage）。
 * 鎖定：hair、face、skin 加上 12 個裝備格，存成「hair,cap」這種字串；鎖只看格子、不看哪一件。
 * 上一套：JSON 字串陣列，每筆是 outfitQuery（動作、表情、翻面歸預設，全預設＝""），最多 30 筆。
 * 兩種字串都可能壞掉或是舊版格式（重新整理後從 storage 讀回來）：一律當作沒有，絕不丟錯。
 */
import { SLOT_ORDER, outfitQuery, parseOutfit } from "./outfit";
import type { Outfit } from "./outfit";
import type { AvatarData, SlotKey } from "./types";

export type LockKey = "hair" | "face" | "skin" | SlotKey;

/** 存成字串的固定順序：hair、face、skin，再照網址 w 的 SLOT_ORDER */
const LOCK_ORDER: LockKey[] = ["hair", "face", "skin", ...SLOT_ORDER];
const LOCK_KEYS: ReadonlySet<string> = new Set(LOCK_ORDER);

/** 最多記幾套 */
const MAX_LOOKS = 30;

// ---------- 鎖定 ----------

/** 「hair,cap」→ 集合；認不得的丟掉，空字串＝空集合 */
export function parseLocks(text: string): Set<LockKey> {
  if (typeof text !== "string") return new Set();
  return new Set(text.split(",").filter((k): k is LockKey => LOCK_KEYS.has(k)));
}

/** 集合 → 字串，順序固定（hair,face,skin，再照 SLOT_ORDER），存起來才穩定 */
export function locksText(locks: ReadonlySet<LockKey>): string {
  return LOCK_ORDER.filter((k) => locks.has(k)).join(",");
}

/** 裝備格沒穿東西的鎖丟掉（那格被脫掉鎖就解開）；hair、face、skin 永遠有東西，鎖留著 */
export function liveLocks(locks: ReadonlySet<LockKey>, o: Outfit): Set<LockKey> {
  return new Set(LOCK_ORDER.filter((k) => locks.has(k) && (k === "hair" || k === "face" || k === "skin" || o.wear[k] !== undefined)));
}

/** 這一格現在是什麼：髮型、臉型、膚色、裝備的 id（裝備格沒穿是 undefined） */
const lockedValue = (o: Outfit, k: LockKey) => (k === "hair" ? o.hair : k === "face" ? o.face : k === "skin" ? o.skin : o.wear[k]);

/**
 * 換性別之後留得住的鎖：鎖住的那格值變了就解開，沒變的留著。
 * setGender 會把穿不了的上衣、褲裙換成預設、髮型臉型不合也換成預設：格子沒空（liveLocks 擋不到），但已經不是你鎖的那件。
 */
export function locksAfterGender(locks: ReadonlySet<LockKey>, before: Outfit, after: Outfit): Set<LockKey> {
  return new Set(LOCK_ORDER.filter((k) => locks.has(k) && lockedValue(before, k) === lockedValue(after, k)));
}

/**
 * 先算好的下一套（useRandomDeck）還能不能用：性別、動作、表情、翻面、鎖、鎖住的那幾件，任何一個變了就不能用。
 * 沒鎖的格子不算（隨機穿搭反正會重挑）；空格子的鎖也不算（隨機穿搭不看它）。
 */
export function deckKey(o: Outfit, locks: ReadonlySet<LockKey>): string {
  const live = liveLocks(locks, o);
  const held = [...live].map((k) => lockedValue(o, k));
  return [o.g, o.pose, o.emo, o.flip, locksText(live), held.join(".")].join("|");
}

// ---------- 上一套 ----------

/** 兩套穿得一樣：性別、膚色、髮型、臉型、每一格都一樣（不看動作、表情、翻面） */
export function sameLook(a: Outfit, b: Outfit): boolean {
  return a.g === b.g && a.skin === b.skin && a.hair === b.hair && a.face === b.face && SLOT_ORDER.every((k) => a.wear[k] === b.wear[k]);
}

/**
 * 把 current 換成 next 時要不要記上一套：穿的不一樣，而且舞台真的畫過 current（drawn＝舞台最後畫好的那套，沒畫過是 null）。
 * 圖還沒畫出來就被換掉的那套不算一步：連按隨機，上一套回到真的看過的。
 * 動作、表情、翻面換到一半不擋（sameLook 本來就不看）。性別也不看：網址沒有性別，全身男女都能穿時換性別，
 * 網址一模一樣、舞台不會重畫（不會再通知畫好了），但畫面上就是這套。
 */
export function shouldRemember(current: Outfit, next: Outfit, drawn: Outfit | null): boolean {
  return !sameLook(current, next) && drawn !== null && sameLook({ ...current, g: drawn.g }, drawn);
}

/** 讀歷史字串：不是「JSON 字串陣列」的一律當作沒有 */
function readHistory(history: string): string[] {
  try {
    const v: unknown = JSON.parse(history);
    return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : [];
  } catch {
    return [];
  }
}

/** 記下這一套（換掉它之前呼叫）；動作、表情、翻面不記，全預設存成 ""；超過 30 套丟最舊的 */
export function pushLook(history: string, o: Outfit): string {
  const query = outfitQuery({ ...o, pose: "stand", emo: "default", flip: false });
  return JSON.stringify([...readHistory(history), query].slice(-MAX_LOOKS));
}

/** 最後一筆（"" ＝全預設，不是 null）；沒有東西可回 null */
export function peekLook(history: string): string | null {
  const list = readHistory(history);
  return list.length > 0 ? list[list.length - 1] : null;
}

/** 拿掉最後一筆，回新字串 */
export function popLook(history: string): string {
  return JSON.stringify(readHistory(history).slice(0, -1));
}

/** 把存的網址還原成穿搭；動作、表情、翻面用現在的（不在歷史裡） */
export function restoreLook(query: string, current: Outfit, data: AvatarData): Outfit {
  const o = parseOutfit(new URLSearchParams(query), data);
  return { ...o, pose: current.pose, emo: current.emo, flip: current.flip };
}
