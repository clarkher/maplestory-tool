// src/lib/speed/quickslot.ts
import { lumOf, type Frame, type Rect } from "./frame";
import { QUICKSLOT_FONT } from "./quickslot-font";
import type { StatusBar } from "./status-bar";

/** 一格快捷鍵：index 0～7（左上到右下）、格子位置、道具數量（沒有數字或讀不準都是 null）、圖示縮成 16×16 RGBA */
export type SlotRead = { index: number; rect: Rect; count: number | null; icon: Uint8ClampedArray | null };

/**
 * 基準截圖（1364×799 視窗）量的快捷鍵：外面一圈 1 格寬的白框，左框 x 1208、右框 x 1354（相距 146）、上框 y 646、下框 y 721（相距 75），四個角是圓的。
 * 框裡 2 列 4 欄：格子左上角在白框左上角往右 5＋35×欄、往下 6＋33×列，格子寬 32、高 30；格子之間是 3 格寬的暗縫（欄縫中心在框左 38、73、108，列縫在框上 37）。
 * 數字從格子左緣開始、上緣在格子上緣往下 19（兩列都是：702 的字從 (1248, 671)、0 從 (1248, 704) 開始）；字跟字不重疊，下一個字接在上一個字的寬度後面。
 */
const FRAME_W = 146;
const FRAME_H = 75;
const SLOT_X = 5;
const SLOT_Y = 6;
const PITCH_X = 35;
const PITCH_Y = 33;
const SLOT_W = 32;
const SLOT_H = 30;
const COUNT_Y = 19;

/** 白框的點：三個顏色都夠亮（原尺寸 255；放大 1.5 倍時 1 格的框最淡也有 180 上下） */
const isWhite = (frame: Frame, x: number, y: number) => {
  const i = (y * frame.width + x) * 4;
  return Math.min(frame.data[i], frame.data[i + 1], frame.data[i + 2]) >= 150;
};

/** 畫面上 (x, y) 的亮度，雙線性內插（縮放過的畫面要在小數位置取樣）；超出畫面回 -1 */
function lumAt(frame: Frame, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 + 1 >= frame.width || y0 + 1 >= frame.height) return -1;
  const fx = x - x0;
  const fy = y - y0;
  const at = (xx: number, yy: number) => {
    const i = (yy * frame.width + xx) * 4;
    return lumOf(frame.data[i], frame.data[i + 1], frame.data[i + 2]);
  };
  const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
  const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** 白框左上角（小數，縮放後的畫面座標）跟縮放 */
type Panel = { x: number; y: number; scale: number };

/**
 * 找快捷鍵的白框：在狀態列上方（往上 300 格×縮放以內）、畫面右邊 35% 裡，
 * 1. 每一欄找夠長的白色直線（至少框高的八成；四個角是圓的，直線比框短一點）；
 * 2. 兩條直線相距差不多 146×縮放、上下對得上，就是左右框；再找上下框（左右框之間八成以上是白的那一列），高要差不多 75×縮放；
 * 3. 驗格子：三條欄縫、一條列縫都要是暗的（排除場景裡剛好有白色長方形）。
 * 縮放照狀態列的 scale 推（跟 findStatusBar 同一套：視窗放大，UI 一起放大）。
 */
function findPanel(frame: Frame, bar: StatusBar): Panel | null {
  const s = bar.scale;
  const fw = FRAME_W * s;
  const fh = FRAME_H * s;
  const xFrom = Math.floor(frame.width * 0.65);
  const yFrom = Math.max(0, Math.floor(bar.top - 300 * s));
  const yTo = Math.min(frame.height, bar.top);
  type Line = { x: number; y0: number; y1: number };
  const lines: Line[] = [];
  for (let x = xFrom; x < frame.width; x++) {
    let start = -1;
    for (let y = yFrom; y <= yTo; y++) {
      const white = y < yTo && isWhite(frame, x, y);
      if (white && start < 0) start = y;
      if (!white && start >= 0) {
        if (y - start >= 0.8 * fh && y - start <= fh + 3) lines.push({ x, y0: start, y1: y });
        start = -1;
      }
    }
  }
  const tolX = 1.5 + 0.02 * fw;
  const tolY = 2 + 3 * s;
  for (const left of lines) {
    for (const right of lines) {
      if (Math.abs(right.x - left.x - fw) > tolX) continue;
      if (Math.abs(right.y0 - left.y0) > tolY || Math.abs(right.y1 - left.y1) > tolY) continue;
      const top = edgeRow(frame, left.x, right.x, Math.min(left.y0, right.y0), -1, tolY);
      const bottom = edgeRow(frame, left.x, right.x, Math.max(left.y1, right.y1) - 1, 1, tolY);
      if (top === null || bottom === null || Math.abs(bottom - top - fh) > tolY) continue;
      const panel = { x: left.x, y: top, scale: (right.x - left.x) / FRAME_W };
      if (gapsAreDark(frame, panel)) return panel;
    }
  }
  return null;
}

/** 上框（step -1，從 from 往上找）或下框（step 1，往下找）：左右框之間（扣掉圓角）八成以上是白的那一列 */
function edgeRow(frame: Frame, xl: number, xr: number, from: number, step: 1 | -1, reach: number): number | null {
  const inset = Math.ceil((xr - xl) * 0.05);
  for (let k = -2; k <= reach + 2; k++) {
    const y = from + step * k;
    if (y < 0 || y >= frame.height) continue;
    let white = 0;
    for (let x = xl + inset; x < xr - inset; x++) if (isWhite(frame, x, y)) white++;
    if (white >= 0.8 * (xr - xl - 2 * inset)) return y;
  }
  return null;
}

/** 三條欄縫、一條列縫的平均亮度都要暗（原尺寸 15～25；格子裡的圖示亮很多） */
function gapsAreDark(frame: Frame, { x, y, scale: s }: Panel): boolean {
  const mean = (points: Array<[number, number]>) => points.reduce((sum, [px, py]) => sum + lumAt(frame, px, py), 0) / points.length;
  for (let k = 1; k <= 3; k++) {
    const gx = x + (SLOT_X - 2 + PITCH_X * k) * s;
    const points: Array<[number, number]> = [];
    for (let dy = SLOT_Y; dy < SLOT_Y + PITCH_Y + SLOT_H; dy++) points.push([gx, y + dy * s]);
    if (mean(points) > 60) return false;
  }
  const gy = y + (SLOT_Y + SLOT_H + 1) * s;
  const points: Array<[number, number]> = [];
  for (let dx = SLOT_X; dx < SLOT_X + 3 * PITCH_X + SLOT_W; dx++) points.push([x + dx * s, gy]);
  return mean(points) <= 60;
}

/** 8 格的位置（左上到右下，整數）；找不到快捷鍵回 null */
export function findQuickslot(frame: Frame, bar: StatusBar): Rect[] | null {
  const panel = findPanel(frame, bar);
  return panel ? slotRects(panel).map(slot => roundRect(slot)) : null;
}

function slotRects({ x, y, scale: s }: Panel): Rect[] {
  const rects: Rect[] = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      rects.push({ x: x + (SLOT_X + PITCH_X * col) * s, y: y + (SLOT_Y + PITCH_Y * row) * s, w: SLOT_W * s, h: SLOT_H * s });
    }
  }
  return rects;
}

const roundRect = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });

/** 8 格的數量跟圖示；找不到快捷鍵回 null */
export function readQuickslot(frame: Frame, bar: StatusBar): SlotRead[] | null {
  const panel = findPanel(frame, bar);
  if (!panel) return null;
  const s = panel.scale;
  // 整塊快捷鍵（含白框外面一點）先算好亮度，比字的時候直接查
  const lum = lumImage(frame, { x: panel.x - 4 * s, y: panel.y - 4 * s, w: (FRAME_W + 20) * s, h: (FRAME_H + 8) * s });
  return slotRects(panel).map((slot, index) => ({
    index,
    rect: roundRect(slot),
    count: readCount(lum, slot, s, panel.x + (FRAME_W - 1) * s),
    icon: iconOf(frame, roundRect(slot)),
  }));
}

/** 一塊畫面的亮度（x0、y0 是這塊在畫面上的左上角） */
type Lum = { x0: number; y0: number; w: number; h: number; data: Float32Array };

function lumImage(frame: Frame, rect: Rect): Lum {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const w = Math.max(0, Math.min(frame.width, Math.ceil(rect.x + rect.w)) - x0);
  const h = Math.max(0, Math.min(frame.height, Math.ceil(rect.y + rect.h)) - y0);
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * frame.width + x0 + x) * 4;
      data[y * w + x] = lumOf(frame.data[i], frame.data[i + 1], frame.data[i + 2]);
    }
  }
  return { x0, y0, w, h, data };
}

/** 該亮的點平均要比該暗的點亮這麼多（截圖裡字身最暗的底列約 180、黑框 0～60）；不到就是一片平的或被遮住，不算像 */
const MIN_CONTRAST = 60;
/**
 * 認得一個字的門檻（相關係數，見 glyphScore）。2026-10-29 量的：基準截圖（702、279、141、0、2）跟畫上去的 0～9 三組，
 * 放大 1、1.1、1.25、1.5、1.75、2 倍，對的字最低 0.69（沒有一個認錯）；數字後面接著的圖示、技能格最高 0.525（白框另外處理，見 readCount）。
 */
const ACCEPT = 0.62;
/** 最像的字要比第二像的高這麼多，不然分不出來（同上量的：對的字最小差 0.083） */
const MARGIN = 0.04;
/** 不到「認得」、但整個字的分數到這裡：像字又不夠像，整格不讀（要比數字後面圖示的最高 0.525 高，不然好好的數字也讀不到） */
const AMBIGUOUS = 0.56;
/** 某一半像到這裡（另一半不像）：有半個字、另一半被蓋住，整格不讀（同上量的：數字後面圖示的半邊最高 0.84） */
const HALF_SEEN = 0.95;
/** 最多讀幾位 */
const MAX_DIGITS = 5;

const DIGITS = Object.keys(QUICKSLOT_FONT);

/** 一個字在某個縮放、某個小數位置的樣子：每個畫面點相對左上角的位置、應該多亮（0～1）、在哪一半（1 左、2 右、4 上、8 下） */
type Template = { dx: Int16Array; dy: Int16Array; want: Float32Array; part: Uint8Array };
const templates = new Map<string, Template>();

/**
 * 字 d 放大 s 倍、左上角在 (整數＋fx, 整數＋fy) 時，每個畫面點的中心落在字的哪裡，用周圍四格雙線性內插出「應該多亮」
 * （字身 1、黑框 0；跟視窗縮放的平滑一樣糊）。透明格不算，透明的佔一半以上整點不比。
 */
function templateOf(d: string, s: number, fx: number, fy: number): Template {
  const key = `${d}|${s}|${fx}|${fy}`;
  const cached = templates.get(key);
  if (cached) return cached;
  const rows = QUICKSLOT_FONT[d];
  const gw = rows[0].length;
  const gh = rows.length;
  const cell = (i: number, j: number) => (i < 0 || j < 0 || i >= gw || j >= gh ? "." : rows[j][i]);
  const dx: number[] = [];
  const dy: number[] = [];
  const want: number[] = [];
  const part: number[] = [];
  for (let y = 0; y < Math.ceil(fy + gh * s); y++) {
    for (let x = 0; x < Math.ceil(fx + gw * s); x++) {
      const u = (x + 0.5 - fx) / s - 0.5;
      const v = (y + 0.5 - fy) / s - 0.5;
      const i0 = Math.floor(u);
      const j0 = Math.floor(v);
      const fu = u - i0;
      const fv = v - j0;
      const near: Array<[number, number, number]> = [
        [0, 0, (1 - fu) * (1 - fv)],
        [1, 0, fu * (1 - fv)],
        [0, 1, (1 - fu) * fv],
        [1, 1, fu * fv],
      ];
      let w = 0;
      let ink = 0;
      for (const [di, dj, wt] of near) {
        const c = cell(i0 + di, j0 + dj);
        if (c === "." || wt === 0) continue;
        w += wt;
        if (c === "#") ink += wt;
      }
      if (w < 0.5) continue;
      dx.push(x);
      dy.push(y);
      want.push(ink / w);
      part.push((u < gw / 2 - 0.5 ? 1 : 2) | (v < gh / 2 - 0.5 ? 4 : 8));
    }
  }
  const t = { dx: Int16Array.from(dx), dy: Int16Array.from(dy), want: Float32Array.from(want), part: Uint8Array.from(part) };
  templates.set(key, t);
  return t;
}

/** 五個部分（整個、左、右、上、下）各自的累加：n、Σ應該、Σ亮度、Σ應該²、Σ亮度²、Σ應該×亮度、該亮的點亮度和／數、該暗的點亮度和／數 */
const ACC = 10;
const PARTS = [0, 1, 2, 4, 8];

/**
 * 字 d 的左上角放在 (ox, oy)（畫面座標，半格為單位）時多像：「應該多亮」跟實際亮度的相關係數（1＝形狀完全一樣，跟整體亮暗無關），
 * 整個字、左半、右半、上半、下半各算一次。whole＝五個裡最差的（只有一半像就不算認得）；half＝四個半邊裡最像的（判斷有沒有半個字）。
 * 每一部分該亮的點平均要比該暗的點亮 MIN_CONTRAST 以上，不然那部分算 0。超出範圍回 0。
 */
function glyphScore(lum: Lum, d: string, ox: number, oy: number, s: number): Score {
  const bx = Math.floor(ox);
  const by = Math.floor(oy);
  const t = templateOf(d, s, ox - bx, oy - by);
  const acc = new Float64Array(PARTS.length * ACC);
  for (let k = 0; k < t.want.length; k++) {
    const x = bx + t.dx[k] - lum.x0;
    const y = by + t.dy[k] - lum.y0;
    if (x < 0 || y < 0 || x >= lum.w || y >= lum.h) return { whole: 0, half: 0, left: 0 };
    const l = lum.data[y * lum.w + x];
    const w = t.want[k];
    for (let g = 0; g < PARTS.length; g++) {
      if (g && !(t.part[k] & PARTS[g])) continue;
      const a = g * ACC;
      acc[a] += 1;
      acc[a + 1] += w;
      acc[a + 2] += l;
      acc[a + 3] += w * w;
      acc[a + 4] += l * l;
      acc[a + 5] += w * l;
      if (w >= 0.75) {
        acc[a + 6] += l;
        acc[a + 7] += 1;
      } else if (w <= 0.25) {
        acc[a + 8] += l;
        acc[a + 9] += 1;
      }
    }
  }
  const whole = correlation(acc, 0);
  // 半邊的格太少（例「1」的左半只有 5 格）、或沒有該亮／該暗的點，那一半不算（NaN），不拿來比
  const parts = PARTS.slice(1).map((_, g) => correlation(acc, (g + 1) * ACC));
  const halves = parts.filter(score => !Number.isNaN(score));
  return {
    whole: Math.min(Number.isNaN(whole) ? 0 : whole, ...halves),
    half: halves.length ? Math.max(...halves) : 0,
    left: Number.isNaN(parts[0]) ? 0 : parts[0],
  };
}

/** 一部分的相關係數；點太少、沒有該亮或該暗的點回 NaN（沒資訊）；對比不夠回 0 */
function correlation(acc: Float64Array, a: number): number {
  const n = acc[a];
  if (n < 5 || !acc[a + 7] || !acc[a + 9]) return NaN;
  if (acc[a + 6] / acc[a + 7] - acc[a + 8] / acc[a + 9] < MIN_CONTRAST) return 0;
  const varWant = acc[a + 3] - (acc[a + 1] * acc[a + 1]) / n;
  const varLum = acc[a + 4] - (acc[a + 2] * acc[a + 2]) / n;
  const cov = acc[a + 5] - (acc[a + 1] * acc[a + 2]) / n;
  return varWant > 0 && varLum > 0 ? cov / Math.sqrt(varWant * varLum) : 0;
}

/** whole＝整個字跟四個半邊裡最差的；half＝四個半邊裡最像的；left＝左半邊 */
type Score = { whole: number; half: number; left: number };

type Best = { d: string; score: number; second: number; half: number; left: number; x: number; y: number };

/**
 * 在 (x, y) 附近上下左右 ±reach 個畫面點（每半點試一次）找最像的字；second＝同一個位置第二像的字的分數。
 * 不能先每 1 點粗找再細找：放大 1.1、1.25 倍時字的位置常落在半點上，整點上對的字分數掉到 0.3～0.6，會被別的字搶走（2026-10-29 試過，讀錯）。
 */
function bestGlyph(lum: Lum, x: number, y: number, s: number, reach: number): Best {
  const best: Best = { d: "", score: -1, second: -1, half: 0, left: 0, x, y };
  const r = Math.ceil(reach * 2) / 2;
  const x0 = Math.round(x * 2) / 2;
  const y0 = Math.round(y * 2) / 2;
  for (let dy = -r; dy <= r; dy += 0.5) {
    for (let dx = -r; dx <= r; dx += 0.5) {
      let top = -1;
      let second = -1;
      let digit = "";
      for (const d of DIGITS) {
        const { whole, half, left } = glyphScore(lum, d, x0 + dx, y0 + dy, s);
        best.half = Math.max(best.half, half);
        best.left = Math.max(best.left, left);
        if (whole > top) {
          second = top;
          top = whole;
          digit = d;
        } else if (whole > second) second = whole;
      }
      if (top > best.score) Object.assign(best, { d: digit, score: top, second, x: x0 + dx, y: y0 + dy });
    }
  }
  return best;
}

/**
 * 讀一格的數量：從格子左緣、格子上緣往下 19 格附近找第一個字（上下左右各留 1.5 格），之後每個字接在上一個字的寬度後面（再各留半個畫面點的對齊誤差）。
 * 認得的字（夠像、而且比第二像的明顯高）就接上；下一個位置不像字＝數字結束；
 * 下一個位置有點像（整個字到 AMBIGUOUS，或某一半到 HALF_SEEN）卻不到認得＝後面被蓋住、遮暗了，整格回 null（不回少幾位的錯數字）。
 * 第一個字就不像（技能、沒有數字、被遮住）回 null；有前導零（例「07」）、超過 MAX_DIGITS 位也回 null。
 */
function readCount(lum: Lum, slot: Rect, s: number, right: number): number | null {
  let text = "";
  let x = slot.x;
  let y = slot.y + COUNT_Y * s;
  for (let k = 0; k <= MAX_DIGITS; k++) {
    const best = bestGlyph(lum, x, y, s, k === 0 ? 1.5 * s : 0.5);
    // 最右邊那欄，4 位數就頂到白框了：第 5 位會壓在白框上（白框像「1」），只看左半邊有沒有字——有就讀不準、整格不讀，沒有就是結束
    if (x + 4 * s > right) {
      if (best.left >= HALF_SEEN) return null;
      break;
    }
    const sure = best.score >= ACCEPT && best.score - best.second >= MARGIN;
    if (!sure) {
      if (best.score >= AMBIGUOUS || best.half >= HALF_SEEN) return null;
      break;
    }
    if (k === MAX_DIGITS) return null;
    text += best.d;
    x = best.x + QUICKSLOT_FONT[best.d][0].length * s;
    y = best.y;
  }
  if (!text || (text.length > 1 && text[0] === "0")) return null;
  return Number(text);
}

/** 格子縮成 16×16 RGBA（每一小塊取平均），給之後比對道具圖示用 */
function iconOf(frame: Frame, rect: Rect): Uint8ClampedArray | null {
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > frame.width || rect.y + rect.h > frame.height || rect.w < 16 || rect.h < 16) return null;
  const out = new Uint8ClampedArray(16 * 16 * 4);
  for (let by = 0; by < 16; by++) {
    for (let bx = 0; bx < 16; bx++) {
      const x0 = rect.x + Math.floor((bx * rect.w) / 16);
      const x1 = rect.x + Math.floor(((bx + 1) * rect.w) / 16);
      const y0 = rect.y + Math.floor((by * rect.h) / 16);
      const y1 = rect.y + Math.floor(((by + 1) * rect.h) / 16);
      const sum = [0, 0, 0, 0];
      let n = 0;
      for (let y = y0; y < Math.max(y1, y0 + 1); y++) {
        for (let x = x0; x < Math.max(x1, x0 + 1); x++) {
          const i = (y * frame.width + x) * 4;
          for (let c = 0; c < 4; c++) sum[c] += frame.data[i + c];
          n++;
        }
      }
      for (let c = 0; c < 4; c++) out[(by * 16 + bx) * 4 + c] = Math.round(sum[c] / n);
    }
  }
  return out;
}

