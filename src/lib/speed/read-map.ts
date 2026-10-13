// src/lib/speed/read-map.ts
import { rgbAt, type Frame } from "./frame";
import { bbox, grid, inkMask, type Mask } from "./ink";
import { rankText, type Ranked, type SpeedNames } from "./names";

type Area = { x0: number; x1: number; y0: number; y1: number };

const isOrange = (r: number, g: number, b: number) => r > 200 && g > 130 && g < 210 && b < 90;

/**
 * 小地圖右上角的橘色「地圖」按鈕：畫面左上三成裡的橘色連通塊，左右相鄰（6px 內）、上下重疊的併在一起，
 * 寬至少是高的 2.5 倍才算（視窗標題列的楓葉圖示是方的）。基準截圖 x 82–118、y 39–50。
 */
export function findMapButton(frame: Frame): Area | null {
  const w = Math.floor(frame.width * 0.3);
  const h = Math.floor(frame.height * 0.3);
  const seen = new Uint8Array(w * h);
  const blobs: Area[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (seen[y * w + x] || !isOrange(...rgbAt(frame, x, y))) continue;
      const blob = { x0: x, x1: x + 1, y0: y, y1: y + 1 };
      const stack = [y * w + x];
      seen[y * w + x] = 1;
      while (stack.length) {
        const k = stack.pop()!;
        const cx = k % w;
        const cy = (k - cx) / w;
        blob.x0 = Math.min(blob.x0, cx);
        blob.x1 = Math.max(blob.x1, cx + 1);
        blob.y0 = Math.min(blob.y0, cy);
        blob.y1 = Math.max(blob.y1, cy + 1);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx] || !isOrange(...rgbAt(frame, nx, ny))) continue;
          seen[ny * w + nx] = 1;
          stack.push(ny * w + nx);
        }
      }
      blobs.push(blob);
    }
  }
  blobs.sort((a, b) => a.x0 - b.x0);
  const merged: Area[] = [];
  for (const blob of blobs) {
    const near = merged.find(group => blob.x0 - group.x1 <= 6 && blob.x1 >= group.x0 - 6 && blob.y0 < group.y1 && blob.y1 > group.y0);
    if (near) {
      near.x0 = Math.min(near.x0, blob.x0);
      near.x1 = Math.max(near.x1, blob.x1);
      near.y0 = Math.min(near.y0, blob.y0);
      near.y1 = Math.max(near.y1, blob.y1);
    } else merged.push({ ...blob });
  }
  return merged.find(group => group.y1 - group.y0 >= 6 && (group.x1 - group.x0) >= 2.5 * (group.y1 - group.y0)) ?? null;
}

export type TitleReading = { signature: string; street: Ranked[]; name: Ranked[] };

/** 一行字縮成 4×cols 的黑白格子，當成這行字的「長相」：同一個視窗大小下同一張圖每次都一樣 */
function shape(mask: Mask, cols: number): string {
  const box = bbox(mask);
  if (!box) return "";
  return Array.from(grid(mask, box, cols, 4), value => (value > 0.4 ? "1" : "0")).join("");
}

/**
 * 按鈕下面兩行：街道名、地圖名（基準：按鈕下緣往下 11～25px、27～41px，左從按鈕左緣往左 35px 到按鈕右緣；照按鈕高等比例）。
 * signature：兩行的長相，拿來記「這個長相是哪張圖」跟偵測換圖。小地圖收起來（沒有字）回 null。
 */
export function readTitle(frame: Frame, names: SpeedNames): TitleReading | null {
  const button = findMapButton(frame);
  if (!button) return null;
  const bh = button.y1 - button.y0;
  const x = button.x0 - 3.2 * bh;
  const w = button.x1 - x;
  const streetMask = inkMask(frame, { x, y: button.y1 + 1.0 * bh, w, h: 1.27 * bh }, true, 0.99);
  const nameMask = inkMask(frame, { x, y: button.y1 + 2.45 * bh, w, h: 1.28 * bh }, true, 0.99);
  if (!streetMask || !nameMask) return null;
  const signature = `${shape(streetMask, 16)}:${shape(nameMask, 32)}`;
  if (!signature.includes("1")) return null;
  return { signature, street: rankText(streetMask, names.titles, names.gh), name: rankText(nameMask, names.titles, names.gh) };
}

export type MapGuess = { mapId: number | null; confident: boolean; choices: number[] };

/** 自動認的門檻：最像的那張（街道＋地圖名兩個差加起來）要夠像，而且跟下一張不同名的差夠多 */
const MAX_D = 0.16;
const MIN_GAP = 0.012;

/**
 * 標題 → 地圖 id。先看記過的（玩家點選過的長相）；再拿每張有中文名的地圖「街道差＋地圖名差」排。
 * 同一個「街道｜名字」有好幾個 id 時，取有練功資料的那張，都沒有取 id 小的。
 */
export function resolveMap(
  title: TitleReading,
  maps: Record<string, { zh: string; st: string }>,
  trainingIds: Set<number>,
  memory: Record<string, number>,
): MapGuess {
  const remembered = memory[title.signature];
  if (remembered !== undefined) return { mapId: remembered, confident: true, choices: [] };
  const streetD = new Map(title.street.map(row => [row.text, row.d]));
  const nameD = new Map(title.name.map(row => [row.text, row.d]));
  const byKey = new Map<string, { id: number; d: number; trained: boolean }>();
  for (const [key, record] of Object.entries(maps)) {
    if (!record.zh) continue;
    const a = streetD.get(record.st);
    const b = nameD.get(record.zh);
    if (a === undefined || b === undefined) continue;
    const id = Number(key);
    const pair = `${record.st}|${record.zh}`;
    const trained = trainingIds.has(id);
    const old = byKey.get(pair);
    if (!old || (trained && !old.trained) || (trained === old.trained && id < old.id)) byKey.set(pair, { id, d: a + b, trained });
  }
  const ranked = [...byKey.values()].sort((p, q) => p.d - q.d);
  if (!ranked.length) return { mapId: null, confident: false, choices: [] };
  const [best, next] = ranked;
  const confident = best.d <= MAX_D && (!next || next.d - best.d >= MIN_GAP);
  return { mapId: confident ? best.id : null, confident, choices: ranked.slice(0, 5).map(row => row.id) };
}
