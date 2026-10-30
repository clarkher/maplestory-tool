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
};

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
  return { at: v.at, mapId: v.mapId, mapName: v.mapName, level: v.level, job: v.job, charId: v.charId, exp10: v.exp10, net10: v.net10 };
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

type Current = { mapId: number | null; mapName: string; exp10: number; job: number | null; charId: string | null };

const mapKey = (mapId: number | null, mapName: string) => (mapId !== null ? `id:${mapId}` : `name:${mapName}`);

/**
 * 「跟我之前比」：第一列是這段；其他是「同一隻角色」（有 ID 看 ID，沒 ID 看職業）
 * 在別張圖的紀錄，每張圖取最好一筆、最多 4 張，照 10 分鐘經驗由大到小。
 */
export function compareRows(records: SpeedRecord[], current: Current): { label: string; exp10: number; current: boolean }[] {
  const rows = [{ label: `${current.mapName}（這段）`, exp10: current.exp10, current: true }];
  const curKey = mapKey(current.mapId, current.mapName);
  const best = new Map<string, SpeedRecord>();
  for (const r of records) {
    const same = current.charId ? r.charId === current.charId : current.job !== null && r.job === current.job;
    if (!same) continue;
    const key = mapKey(r.mapId, r.mapName);
    if (key === curKey) continue;
    const prev = best.get(key);
    if (!prev || r.exp10 > prev.exp10) best.set(key, r);
  }
  const others = [...best.values()]
    .sort((a, b) => b.exp10 - a.exp10)
    .slice(0, MAX_OTHER_MAPS)
    .map((r) => ({ label: r.mapName, exp10: r.exp10, current: false }));
  return [...rows, ...others];
}
