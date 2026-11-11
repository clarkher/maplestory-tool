// src/lib/speed/records.ts

/**
 * 我的練功紀錄：只存在這台電腦（localStorage），不上傳。
 * 新的在前、最多 50 筆；讀寫全包 try/catch，形狀不對的那筆丟掉。
 */
export type SpeedRecord = {
  at: number;
  mapId: number | null;
  mapName: string;
  level: number;
  job: number | null;
  /** 有填角色 ID 才有；比較時優先看它 */
  charId: string | null;
  exp10: number;
  net10: number | null;
  /** 這段開始的時間（回答加倍券時用它找回這筆）；v2.06 以前的紀錄沒有 */
  segAt?: number;
  /** 這段練了幾秒（拆加倍券用）；v2.06 以前的紀錄沒有 */
  sec?: number;
  /** 加倍券：沒回答（undefined）、沒開（null）、有開（倍率＋其中幾分鐘） */
  coupon?: Coupon | null;
};

/** 加倍券（跟 view.ts、伺服器 rules.ts 的 Coupon 同一個形狀） */
export type Coupon = { mult: number; minutes: number };

const KEY = "ms-speed:records";
const MAX_RECORDS = 50;
const MAX_OTHER_MAPS = 4;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNumOrNull = (v: unknown): v is number | null => v === null || isNum(v);

function parseRecord(value: unknown): SpeedRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!isNum(v.at) || !isNumOrNull(v.mapId) || typeof v.mapName !== "string") return null;
  if (!isNum(v.level) || !isNumOrNull(v.job) || !isNum(v.exp10) || !isNumOrNull(v.net10)) return null;
  if (v.charId !== null && typeof v.charId !== "string") return null;
  const out: SpeedRecord = { at: v.at, mapId: v.mapId, mapName: v.mapName, level: v.level, job: v.job, charId: v.charId, exp10: v.exp10, net10: v.net10 };
  // 新欄位壞掉不丟整筆（比較少一點資訊而已）：當沒有
  if (isNum(v.segAt)) out.segAt = v.segAt;
  if (isNum(v.sec) && v.sec > 0) out.sec = v.sec;
  if (v.coupon === null) out.coupon = null;
  else if (isCoupon(v.coupon)) out.coupon = { mult: v.coupon.mult, minutes: v.coupon.minutes };
  return out;
}

function isCoupon(value: unknown): value is Coupon {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return isNum(v.mult) && v.mult >= 1 && isNum(v.minutes) && v.minutes > 0;
}

export function loadRecords(storage: Storage): SpeedRecord[] {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.map(parseRecord).filter((r): r is SpeedRecord => r !== null).slice(0, MAX_RECORDS);
  } catch {
    return [];
  }
}

/** 新增一筆放最前面，回傳存完的清單；瀏覽器不讓存時這次照樣回得出來，只是不會留 */
export function addRecord(storage: Storage, r: SpeedRecord): SpeedRecord[] {
  const next = [r, ...loadRecords(storage)].slice(0, MAX_RECORDS);
  try {
    storage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 隱私模式、空間滿了：不影響這次使用
  }
  return next;
}

/** 回答加倍券之後：改同一段那筆（segAt 對得上的），回傳改完的清單；找不到就原樣回 */
export function setRecordCoupon(storage: Storage, segAt: number, coupon: Coupon | null): SpeedRecord[] {
  const list = loadRecords(storage);
  if (!list.some(r => r.segAt === segAt)) return list;
  const next = list.map(r => (r.segAt === segAt ? { ...r, coupon } : r));
  try {
    storage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 存不了：這次照樣顯示
  }
  return next;
}

/**
 * 10 分鐘經驗拆成「還原值」（扣掉加倍券，回推沒開會拿多少）跟「加倍多拿的」：
 * 還原值＝經驗 ÷（沒開的分鐘＋有開的分鐘×倍率）×10，跟伺服器 realExpPer10 同一條；填的分鐘比這段長就當整段都開。
 * 沒開、沒回答、不知道這段多長（v2.06 以前的紀錄）：全部算還原值。
 */
export function splitCoupon(exp10: number, sec: number | undefined, coupon: Coupon | null | undefined): { base: number; bonus: number } {
  if (!coupon || !sec) return { base: exp10, bonus: 0 };
  const total = sec / 60;
  const on = Math.min(coupon.minutes, total);
  const base = Math.round((exp10 * total) / (total - on + on * coupon.mult));
  return { base, bonus: exp10 - base };
}

type Current = { mapId: number | null; mapName: string; exp10: number; job: number | null; charId: string | null; sec?: number; coupon?: Coupon | null };
export type CompareRow = { label: string; exp10: number; bonus: number; current: boolean };

const mapKey = (mapId: number | null, mapName: string) => (mapId !== null ? `id:${mapId}` : `name:${mapName}`);

/**
 * 「跟我之前比」：第一列是這段；其他是「同一隻角色」（有 ID 看 ID，沒 ID 看職業）
 * 在別張圖的紀錄，每張圖取最好一筆、最多 4 張。exp10 是扣掉加倍券的還原值、bonus 是加倍多拿的（splitCoupon），
 * 「最好」跟排序都照還原值（2026-11-11 使用者選 A：開了加倍券的不能贏過真的練得比較快的圖）。
 */
export function compareRows(records: SpeedRecord[], current: Current): CompareRow[] {
  const now = splitCoupon(current.exp10, current.sec, current.coupon);
  const rows: CompareRow[] = [{ label: `${current.mapName}（這段）`, exp10: now.base, bonus: now.bonus, current: true }];
  const curKey = mapKey(current.mapId, current.mapName);
  const best = new Map<string, { label: string; base: number; bonus: number }>();
  for (const r of records) {
    const same = current.charId ? r.charId === current.charId : current.job !== null && r.job === current.job;
    if (!same) continue;
    const key = mapKey(r.mapId, r.mapName);
    if (key === curKey) continue;
    const { base, bonus } = splitCoupon(r.exp10, r.sec, r.coupon);
    const prev = best.get(key);
    if (!prev || base > prev.base) best.set(key, { label: r.mapName, base, bonus });
  }
  const others = [...best.values()]
    .sort((a, b) => b.base - a.base)
    .slice(0, MAX_OTHER_MAPS)
    .map((r) => ({ label: r.label, exp10: r.base, bonus: r.bonus, current: false }));
  return [...rows, ...others];
}
