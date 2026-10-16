// src/lib/speed/ink.ts
import { clampRect, lumOf, type Frame, type Rect } from "./frame";

/** 一塊區域的「墨」：0＝背景、1＝字。每格是 0～1 的小數（反鋸齒的邊是中間值） */
export type Mask = { w: number; h: number; m: Float32Array };
/** 連通塊的範圍（右、下不含）跟像素數 */
export type Box = { x0: number; x1: number; y0: number; y1: number; n: number };

/**
 * 背景＝這塊亮度的中位數、字＝最亮的那一小撮（hiPct），中間線性對到 0～1。
 * dark：深色字淺色底（小地圖標題），先把亮度反過來。
 */
export function inkMask(frame: Frame, rect: Rect, dark = false, hiPct = 0.995): Mask | null {
  const r = clampRect(frame, rect);
  if (!r) return null;
  const m = new Float32Array(r.w * r.h);
  const all = new Array<number>(m.length);
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const i = ((r.y + y) * frame.width + r.x + x) * 4;
      const v = lumOf(frame.data[i], frame.data[i + 1], frame.data[i + 2]);
      const k = y * r.w + x;
      all[k] = m[k] = dark ? 255 - v : v;
    }
  }
  all.sort((a, b) => a - b);
  const bg = all[Math.floor(all.length * 0.5)];
  const hi = all[Math.min(all.length - 1, Math.floor(all.length * hiPct))];
  const span = Math.max(30, hi - bg);
  for (let i = 0; i < m.length; i++) m[i] = Math.min(1, Math.max(0, (m[i] - bg) / span));
  return { w: r.w, h: r.h, m };
}

/** 文字所在的列：整排六成以上都是墨的是 UI 的線（不算），剩下有墨的列裡最長的一段連續列 [起, 迄) */
export function textRows(mask: Mask): [number, number] {
  let best: [number, number] = [0, 0];
  let start = -1;
  for (let y = 0; y <= mask.h; y++) {
    let ink = 0;
    if (y < mask.h) for (let x = 0; x < mask.w; x++) if (mask.m[y * mask.w + x] > 0.5) ink++;
    const isText = y < mask.h && ink > 0 && ink / mask.w <= 0.6;
    if (isText && start < 0) start = y;
    if (!isText && start >= 0) {
      if (y - start > best[1] - best[0]) best = [start, y];
      start = -1;
    }
  }
  return best;
}

/** 列 y0～y1 之間的連通塊（八方向、墨 > thr） */
export function components(mask: Mask, y0: number, y1: number, thr = 0.45): Box[] {
  const { w } = mask;
  const seen = new Uint8Array(w * mask.h);
  const out: Box[] = [];
  const stack: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (seen[start] || mask.m[start] <= thr) continue;
      const box: Box = { x0: x, x1: x + 1, y0: y, y1: y + 1, n: 0 };
      seen[start] = 1;
      stack.push(start);
      while (stack.length) {
        const k = stack.pop()!;
        const cx = k % w;
        const cy = (k - cx) / w;
        box.n++;
        box.x0 = Math.min(box.x0, cx);
        box.x1 = Math.max(box.x1, cx + 1);
        box.y0 = Math.min(box.y0, cy);
        box.y1 = Math.max(box.y1, cy + 1);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= w || ny < y0 || ny >= y1) continue;
            const nk = ny * w + nx;
            if (!seen[nk] && mask.m[nk] > thr) {
              seen[nk] = 1;
              stack.push(nk);
            }
          }
        }
      }
      out.push(box);
    }
  }
  return out;
}

/** 整塊墨的範圍；沒有墨回 null */
export function bbox(mask: Mask, thr = 0.45): Box | null {
  let x0 = mask.w, x1 = 0, y0 = mask.h, y1 = 0, n = 0;
  for (let y = 0; y < mask.h; y++) {
    for (let x = 0; x < mask.w; x++) {
      if (mask.m[y * mask.w + x] <= thr) continue;
      n++;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x + 1);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y + 1);
    }
  }
  return n ? { x0, x1, y0, y1, n } : null;
}

/** 把 box 範圍縮成 gw×gh 格（面積平均），跟字的大小無關，拿來跟樣板比 */
export function grid(mask: Mask, box: Box, gw: number, gh: number): Float32Array {
  const out = new Float32Array(gw * gh);
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const xa = box.x0 + (i * w) / gw;
      const xb = box.x0 + ((i + 1) * w) / gw;
      const ya = box.y0 + (j * h) / gh;
      const yb = box.y0 + ((j + 1) * h) / gh;
      let sum = 0;
      let area = 0;
      for (let y = Math.floor(ya); y < Math.ceil(yb); y++) {
        for (let x = Math.floor(xa); x < Math.ceil(xb); x++) {
          const cover = (Math.min(x + 1, xb) - Math.max(x, xa)) * (Math.min(y + 1, yb) - Math.max(y, ya));
          sum += (mask.m[y * mask.w + x] ?? 0) * cover;
          area += cover;
        }
      }
      out[j * gw + i] = area ? sum / area : 0;
    }
  }
  return out;
}
