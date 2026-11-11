import { clampState, parseState, type CalcState } from "./damage-view";

/**
 * 傷害計算機每個職業各記一份（2026-11-11 使用者：每個職業設定過的數值都分開存本地）。
 * 存 localStorage `ms-damage`：{ 職業代碼: 那個職業最後一次的設定 }，關掉再開、換職業再換回來都還在。
 * 這次瀏覽的設定（useVisitState 的 damage:state）照舊優先；這份是「換到這個職業、新開計算機」時拿來接上的。
 */
const KEY = "ms-damage";

type Store = Pick<Storage, "getItem" | "setItem">;

/** 每個職業讀一遍：鍵要是數字、內容要是看得懂的設定、而且真的是那個職業的；其他丟掉 */
export function parseDamageStore(raw: string | null): Record<string, CalcState> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const out: Record<string, CalcState> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const state = parseState(JSON.stringify(value));
    if (state && String(state.shared.job) === key) out[key] = state;
  }
  return out;
}

function readAll(storage: Store | null): Record<string, CalcState> {
  if (!storage) return {};
  try {
    return parseDamageStore(storage.getItem(KEY));
  } catch {
    return {};
  }
}

/** 這個職業記下的設定（等級夾回職業範圍）；沒記過回 null */
export function recallJob(storage: Store | null, job: number): CalcState | null {
  const state = readAll(storage)[String(job)];
  return state ? clampState(state) : null;
}

/** 記下這個職業的設定（別的職業的留著）；存不進去（隱私模式、空間滿了）就這次不記 */
export function rememberJob(storage: Store | null, state: CalcState): void {
  if (!storage) return;
  try {
    storage.setItem(KEY, JSON.stringify({ ...readAll(storage), [state.shared.job]: state }));
  } catch {
    // 不記也不壞：畫面照樣算
  }
}

/** 瀏覽器的 localStorage；伺服器、不讓碰的時候回 null */
export function localStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
