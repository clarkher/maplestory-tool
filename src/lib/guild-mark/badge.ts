import marksJson from "./marks.json";

// 公會徽章狀態：網址參數、預設、顏色規則、隨機。資料來自 marks.json（scripts/client/guild-mark.py 產出）

/** box＝各色看得到的點合起來的範圍 [x, y, 寬, 高]（17×17 裡，遊戲原位置），畫面置中用 */
export type MarkEntry = { id: number; row: number; colours: number[]; box: number[] };
export type Category = "Animal" | "Plant" | "Pattern" | "Letter" | "Etc";
type MarksData = {
  atlas: string;
  cell: number;
  backgrounds: MarkEntry[];
  marks: Record<Category, MarkEntry[]>;
  bgSwatches: string[];
  markSwatches: string[];
};
const data = marksJson as MarksData;

export const CATEGORIES: { key: Category; label: string }[] = [
  { key: "Animal", label: "動物" },
  { key: "Plant", label: "植物" },
  { key: "Pattern", label: "花紋" },
  { key: "Letter", label: "文字" },
  { key: "Etc", label: "其他" },
];

/** b＝底圖、bc＝底圖顏色、m＝圖案、mc＝圖案顏色（網址只存實際畫的顏色） */
export type Badge = { b: number; bc: number; m: number; mc: number };
export const DEFAULT_BADGE: Badge = { b: 1005, bc: 10, m: 2000, mc: 2 };

/** 「其他」最後一個：客戶端是整片幾乎全透明（alpha 17）的圖，遊戲裡就是不放圖案；格子寫字不畫圖（11/08 使用者選 A） */
export const NO_MARK_ID = 9026;

const ATLAS_W = 16;
const ATLAS_H = 144;

const bgById = new Map(data.backgrounds.map((e) => [e.id, e]));
const markById = new Map<number, { entry: MarkEntry; category: Category }>();
for (const c of CATEGORIES) for (const entry of data.marks[c.key]) markById.set(entry.id, { entry, category: c.key });

export function markEntry(id: number) {
  return markById.get(id) ?? null;
}
export function bgEntry(id: number): MarkEntry | null {
  return bgById.get(id) ?? null;
}

/** 這個圖案沒有這個顏色就用它的第一個色 */
export function shownColour(entry: MarkEntry, colour: number): number {
  return entry.colours.includes(colour) ? colour : entry.colours[0];
}

function int(v: string | null): number {
  return v !== null && /^\d+$/.test(v) ? Number(v) : NaN;
}

export function parseBadge(q: URLSearchParams): Badge {
  const b = int(q.get("b"));
  const bg = bgById.has(b) ? b : DEFAULT_BADGE.b;
  const bgE = bgById.get(bg)!;
  const bcRaw = int(q.get("bc"));
  const bc = bgE.colours.includes(bcRaw) ? bcRaw : shownColour(bgE, DEFAULT_BADGE.bc);
  const mRaw = int(q.get("m"));
  const m = markById.has(mRaw) ? mRaw : DEFAULT_BADGE.m;
  const mE = markById.get(m)!.entry;
  const mcRaw = int(q.get("mc"));
  const mc = mE.colours.includes(mcRaw) ? mcRaw : shownColour(mE, DEFAULT_BADGE.mc);
  return { b: bg, bc, m, mc };
}

export function badgeQuery(x: Badge): string {
  return `b=${x.b}&bc=${x.bc}&m=${x.m}&mc=${x.mc}`;
}

/** 換圖案：顏色照使用者要的（wanted），這個圖案沒有那色才暫時顯示第一色 */
export function pickMark(x: Badge, m: number, wanted: number): Badge {
  const e = markById.get(m)?.entry;
  return { ...x, m, mc: e ? shownColour(e, wanted) : x.mc };
}

export function randomBadge(rand: () => number = Math.random): Badge {
  const pick = <T,>(a: T[]): T => a[Math.min(a.length - 1, Math.floor(rand() * a.length))];
  const bg = pick(data.backgrounds);
  const cat = pick(CATEGORIES).key;
  const mark = pick(data.marks[cat]);
  return { b: bg.id, bc: pick(bg.colours), m: mark.id, mc: pick(mark.colours) };
}

/** 圖集裡某一格（row 列、colour 色）的 CSS；scale＝放大倍數 */
export function cellStyle(row: number, colour: number, scale: number) {
  const px = data.cell * scale;
  return {
    backgroundImage: `url(${data.atlas})`,
    backgroundSize: `${ATLAS_W * px}px ${ATLAS_H * px}px`,
    backgroundPosition: `${-(colour - 1) * px}px ${-row * px}px`,
    width: px,
    height: px,
  };
}

/**
 * 把幾個範圍（17×17 裡的 [x, y, 寬, 高]）合起來移到正中間要位移多少 px（已乘倍數、取整數，1 倍不會落在半格）。
 * 遊戲裡每格有自己的位置（有的靠上、有的靠右），畫面上置中比較好看；底圖＋圖案一起傳，兩層相對位置不變。下載照遊戲原位置，不用這個。
 */
export function centreShift(boxes: number[][], scale: number): { x: number; y: number } {
  const x0 = Math.min(...boxes.map((b) => b[0]));
  const y0 = Math.min(...boxes.map((b) => b[1]));
  const x1 = Math.max(...boxes.map((b) => b[0] + b[2]));
  const y1 = Math.max(...boxes.map((b) => b[1] + b[3]));
  return { x: Math.round(((17 - (x1 - x0)) / 2 - x0) * scale), y: Math.round(((17 - (y1 - y0)) / 2 - y0) * scale) };
}
