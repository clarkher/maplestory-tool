// src/lib/speed/read-map.ts
import { clampRect, lumOf, rgbAt, type Frame } from "./frame";
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

/** 標題那塊至少要這麼亮（亮度中位數）：標題坐在小地圖淺藍色的面板上，遊戲場景大多暗得多 */
const MIN_PANEL_LUM = 150;
/** 每行字的墨框高度要在按鈕高的這個範圍內：太矮是雜點、太高不是一行字（上限現在碰不到：兩行的框只有 1.27／1.28 個按鈕高，框的比例改了才用得上） */
const MIN_LINE_H = 0.5;
const MAX_LINE_H = 1.4;

/** 一個像素算多少墨：0.3 以下不算（背景、雜訊），0.7 以上算滿，中間線性 */
const softInk = (value: number) => Math.min(1, Math.max(0, (value - 0.3) / 0.4));

/** 墨量沿著一個方向的分布，累積到 lo～hi（比例）的位置；位置是連續的（含小數），沒有墨回 null */
function inkSpan(profile: number[], lo: number, hi: number): [number, number] | null {
  const total = profile.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  const at = (target: number) => {
    let cum = 0;
    for (let i = 0; i < profile.length; i++) {
      if (cum + profile[i] >= target) return i + (profile[i] > 0 ? (target - cum) / profile[i] : 0);
      cum += profile[i];
    }
    return profile.length;
  };
  return [at(lo * total), at(hi * total)];
}

/**
 * 一行字縮成 4×cols 的黑白格子，當成這行字的「長相」。兩個地方刻意不用「最外面那個像素」或絕對門檻：
 * - 範圍用墨量累積 2%～98% 的連續位置。最外面那個像素在門檻上下跳一格，整排格子就跟著位移（實測 ±2 的雜訊差 22 格）；
 *   累積量是好幾個像素加起來的，雜訊只讓位置動零點幾個像素。字多一個、少一個字（右緣差好幾個像素）仍然會讓格子明顯不同。
 * - 黑白的分界是「這行最濃的那格的一半」（相對的）：整張圖變亮、變暗、被壓糊一點，格子不會因為剛好壓過絕對門檻而翻轉。
 */
function shape(mask: Mask, cols: number): string {
  const columns = new Array<number>(mask.w).fill(0);
  const rows = new Array<number>(mask.h).fill(0);
  for (let y = 0; y < mask.h; y++) {
    for (let x = 0; x < mask.w; x++) {
      const ink = softInk(mask.m[y * mask.w + x]);
      columns[x] += ink;
      rows[y] += ink;
    }
  }
  const across = inkSpan(columns, 0.02, 0.98);
  const down = inkSpan(rows, 0.02, 0.98);
  if (!across || !down) return "";
  const cells = grid(mask, { x0: across[0], x1: across[1], y0: down[0], y1: down[1], n: 0 }, cols, 4);
  let peak = 0;
  for (const value of cells) peak = Math.max(peak, value);
  return Array.from(cells, value => (value > 0.5 * peak ? "1" : "0")).join("");
}

type Line = { mask: Mask; box: Area };

/**
 * 找按鈕下面的兩行標題字：街道名、地圖名（基準：按鈕下緣往下 11～25px、27～41px，左從按鈕左緣往左 35px 到按鈕右緣；照按鈕高等比例）。
 * 回的 box 是兩行字的墨框（畫面座標，右、下不含）。
 * 小地圖收起來時橘色按鈕還在，但底下是遊戲場景，所以要同時過兩關才算讀到標題：
 * 標題那塊的亮度中位數 ≥ 150（面板是淺藍色），而且每行墨框的高度在按鈕高的 0.5～1.4 倍。
 */
function locateTitle(frame: Frame): { street: Line; name: Line } | null {
  const button = findMapButton(frame);
  if (!button) return null;
  const bh = button.y1 - button.y0;
  const x = button.x0 - 3.2 * bh;
  const w = button.x1 - x;
  const whole = clampRect(frame, { x, y: button.y1 + 1.0 * bh, w, h: 2.73 * bh });
  if (!whole) return null;
  const lums: number[] = [];
  for (let yy = whole.y; yy < whole.y + whole.h; yy++) {
    for (let xx = whole.x; xx < whole.x + whole.w; xx++) lums.push(lumOf(...rgbAt(frame, xx, yy)));
  }
  lums.sort((p, q) => p - q);
  if (lums[Math.floor(lums.length / 2)] < MIN_PANEL_LUM) return null;
  const line = (top: number, height: number): Line | null => {
    const rect = { x, y: button.y1 + top * bh, w, h: height * bh };
    const at = clampRect(frame, rect);
    const mask = inkMask(frame, rect, true, 0.99);
    const box = mask && bbox(mask);
    if (!at || !mask || !box) return null;
    const h = box.y1 - box.y0;
    if (h < MIN_LINE_H * bh || h > MAX_LINE_H * bh) return null;
    return { mask, box: { x0: at.x + box.x0, x1: at.x + box.x1, y0: at.y + box.y0, y1: at.y + box.y1 } };
  };
  const street = line(1.0, 1.27);
  const name = line(2.45, 1.28);
  return street && name ? { street, name } : null;
}

/** 兩行標題字的墨框（畫面座標）；讀不到標題（沒有小地圖、收起來、字不像字）回 null。驗收跟除錯用。 */
export function titleBoxes(frame: Frame): { street: Area; name: Area } | null {
  const found = locateTitle(frame);
  return found && { street: found.street.box, name: found.name.box };
}

/**
 * 小地圖標題：街道名、地圖名各跟名單比出一串排名；signature 是兩行字的長相（192 格黑白），
 * 拿來記「這個長相是哪張圖」跟偵測換圖——它是近似值，比對用 hammingDistance，頁面要的穩定版本用 settleTitle。
 * 小地圖不見、收起來（底下是遊戲場景）、標題那塊讀不出字，都回 null。
 */
export function readTitle(frame: Frame, names: SpeedNames): TitleReading | null {
  const found = locateTitle(frame);
  if (!found) return null;
  const signature = `${shape(found.street.mask, 16)}:${shape(found.name.mask, 32)}`;
  if (!signature.includes("1")) return null;
  return {
    signature,
    street: rankText(found.street.mask, names.titles, names.gh),
    name: rankText(found.name.mask, names.titles, names.gh),
  };
}

/** 兩個簽章不一樣的格子數；長度不同（不是同一種簽章）回 Infinity */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

/**
 * 兩個簽章差這麼多格以內算「同一個長相」（記過的簽章比對、換圖候選彼此對得上都用這個）。
 * 值是量出來的：同一張畫面加 ±2 的雜訊最多差 3 格（±4 也不到 5 格）；只差一個字的相鄰地圖
 * （森林迷宮III／IV、火焰之地Ⅱ／Ⅲ…）最少差 14 格。擷取的畫面是無損的，一模一樣的畫面簽章就一模一樣，所以抓小不抓大。
 */
const SAME_BITS = 6;
/** 跟目前的 key 差在這麼多格以內：還是同一張圖，key 不動（要小於相鄰地圖最少的 14 格，不然換圖會被當成雜訊吃掉） */
const KEEP_BITS = 10;
/** 新的簽章要連續看到這麼多張畫面才換 key */
const SETTLE_FRAMES = 3;

export type TitleSettle = { key: string | null; candidate: string | null; streak: number };

/**
 * 把一張張畫面讀到的 signature 穩定成「現在在哪張圖」的 key：頁面每張畫面把 readTitle 的簽章（讀不到給 null）餵進來，
 * 拿回來的 state.key 就是餵給練功計算的 mapKey。初始狀態 { key: null, candidate: null, streak: 0 }。
 * - key 只在「同一個新長相（彼此差 ≤ 6 格）連續 3 張畫面」而且跟目前的 key 差 > 10 格時才換（第一個 key 也要 3 張）。
 * - 跟目前的 key 差 ≤ 10 格：是同一張圖的雜訊，key 不動，換圖的計數歸零。
 * - null（讀不到）：計數歸零，key 留著（小地圖被擋一下不算換圖）。
 * 換 key 之後 candidate／streak 歸零。不改傳進來的 state。
 */
export function settleTitle(state: TitleSettle, signature: string | null): TitleSettle {
  if (signature === null) return { key: state.key, candidate: null, streak: 0 };
  if (state.key !== null && hammingDistance(signature, state.key) <= KEEP_BITS) return { key: state.key, candidate: null, streak: 0 };
  const streak = state.candidate !== null && hammingDistance(signature, state.candidate) <= SAME_BITS ? state.streak + 1 : 1;
  if (streak >= SETTLE_FRAMES) return { key: signature, candidate: null, streak: 0 };
  return { key: state.key, candidate: signature, streak };
}

export type MapGuess = { mapId: number | null; confident: boolean; choices: number[] };

/** 自動認的門檻：最像的那張（街道＋地圖名兩個差加起來）要夠像，而且跟下一張不同名的差夠多 */
const MAX_D = 0.16;
const MIN_GAP = 0.012;

/** 記過的簽章：一模一樣的先用；沒有就找差最少的，差在 6 格以內才算 */
function recall(memory: Record<string, number>, signature: string): number | undefined {
  if (Object.prototype.hasOwnProperty.call(memory, signature)) return memory[signature];
  let best: number | undefined;
  let bestBits = SAME_BITS + 1;
  for (const [known, mapId] of Object.entries(memory)) {
    const bits = hammingDistance(known, signature);
    if (bits < bestBits) {
      best = mapId;
      bestBits = bits;
    }
  }
  return best;
}

/**
 * 標題 → 地圖 id。先看記過的（玩家點選過的長相，差 6 格內都算）；再拿每張有中文名的地圖「街道差＋地圖名差」排。
 * 街道名是空的地圖（雲彩公園、天空階梯、冰原雪域，資料裡沒有街道欄）街道不比，給「這次街道排名裡最小的差」當中立分數。
 * 同一個「街道｜名字」有好幾個 id 時，取有練功資料的那張，都沒有取 id 小的。
 */
export function resolveMap(
  title: TitleReading,
  maps: Record<string, { zh: string; st: string }>,
  trainingIds: Set<number>,
  memory: Record<string, number>,
): MapGuess {
  const remembered = recall(memory, title.signature);
  if (remembered !== undefined) return { mapId: remembered, confident: true, choices: [] };
  const streetD = new Map(title.street.map(row => [row.text, row.d]));
  const nameD = new Map(title.name.map(row => [row.text, row.d]));
  const neutralStreet = title.street.length ? Math.min(...title.street.map(row => row.d)) : 0;
  const byKey = new Map<string, { id: number; d: number; trained: boolean }>();
  for (const [key, record] of Object.entries(maps)) {
    if (!record.zh) continue;
    const a = record.st ? streetD.get(record.st) : neutralStreet;
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
