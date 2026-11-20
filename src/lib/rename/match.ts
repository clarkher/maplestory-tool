/**
 * 名字變怪物：筆畫 ↔ 怪物輪廓比對與像度。
 * 輸入是已切段＋正規化到 64 格的筆畫（strokes.ts 的 splitAtCorners → normalize）。
 * 每隻怪對 3 種縮放 × 5 種平移各跑一次貪婪挑段，取最高的 raw；
 * 全部怪比完，前 3 名裡跟第 1 名差 < 0.03 的隨機挑一隻，像度 < 50 就出大便。
 */
import type { Pt, Stroke } from "./strokes";

export type Shape = { id: number; n: string; pts: Pt[]; area: number; alt?: { id: number; n: string }[] };

export type Result =
  | { kind: "monster"; id: number; n: string; kept: number[]; score: number }
  | { kind: "poop"; score: number }
  | { kind: "empty" };

/** 輪廓點離某段 ≤ 這麼多格算被蓋到 */
const COVER = 2;
/** 段上的點離輪廓 > 這麼多格算外漏 */
const OUTSIDE = 3;
/** 外漏扣分權重 */
const LEAK_W = 0.5;
/** gain ≤ 這個就停 */
const MIN_GAIN = 0.01;
/** 前幾名可以隨機 */
const TOP_N = 3;
/** 跟第 1 名差多少內算平手 */
const TIE = 0.03;
/** 像度低於這個出大便 */
const POOP_BELOW = 50;

const SCALES = [1, 0.9, 1.1];
const SHIFT = 4;
const OFFSETS: Pt[] = [[0, 0], [0, -SHIFT], [0, SHIFT], [-SHIFT, 0], [SHIFT, 0]];
const CENTER = 32;

// 快取格子涵蓋 [LO, HI)：筆畫正規化在 4–60，放大 1.1 再平移 4 格最多到約 -3～67，留邊
const LO = -8;
const HI = 72;
/** 外漏判定格子解析度（每格 0.5） */
const RES = 2;
const NEAR_W = (HI - LO) * RES;
/** 輪廓點分桶大小（格） */
const BUCKET = 4;
const BUCKET_W = (HI - LO) / BUCKET;
/** 外漏取樣步長（格） */
const SAMPLE = 0.5;

type Cache = {
  /** near[cy*NEAR_W+cx] = 1：該 0.5 格中心離某輪廓點 ≤ 3 */
  near: Uint8Array;
  /** 輪廓點（同 shape.pts） */
  pts: Pt[];
  /** 每桶的輪廓點索引 */
  buckets: number[][];
};

const caches = new WeakMap<Shape, Cache>();

function cacheOf(shape: Shape): Cache {
  let c = caches.get(shape);
  if (c) return c;
  const near = new Uint8Array(NEAR_W * NEAR_W);
  const buckets: number[][] = Array.from({ length: BUCKET_W * BUCKET_W }, () => []);
  const r2 = OUTSIDE * OUTSIDE;
  shape.pts.forEach(([px, py], i) => {
    const bx = Math.floor((px - LO) / BUCKET), by = Math.floor((py - LO) / BUCKET);
    if (bx >= 0 && by >= 0 && bx < BUCKET_W && by < BUCKET_W) buckets[by * BUCKET_W + bx].push(i);
    const cx0 = Math.max(0, Math.floor((px - OUTSIDE - LO) * RES));
    const cx1 = Math.min(NEAR_W - 1, Math.ceil((px + OUTSIDE - LO) * RES));
    const cy0 = Math.max(0, Math.floor((py - OUTSIDE - LO) * RES));
    const cy1 = Math.min(NEAR_W - 1, Math.ceil((py + OUTSIDE - LO) * RES));
    for (let cy = cy0; cy <= cy1; cy++) {
      const y = LO + (cy + 0.5) / RES - py;
      for (let cx = cx0; cx <= cx1; cx++) {
        const x = LO + (cx + 0.5) / RES - px;
        if (x * x + y * y <= r2) near[cy * NEAR_W + cx] = 1;
      }
    }
  });
  c = { pts: shape.pts, near, buckets };
  caches.set(shape, c);
  return c;
}

function isNear(c: Cache, x: number, y: number): boolean {
  const cx = Math.floor((x - LO) * RES), cy = Math.floor((y - LO) * RES);
  if (cx < 0 || cy < 0 || cx >= NEAR_W || cy >= NEAR_W) return false;
  return c.near[cy * NEAR_W + cx] === 1;
}

/** 點到線段距離平方 */
function dist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + t * dx - px, ey = ay + t * dy - py;
  return ex * ex + ey * ey;
}

type SegEval = { cov: number[]; leak: number };

/** 一段筆畫對一隻怪：蓋到哪些輪廓點、外漏長度比例 */
function evalSeg(seg: Stroke, c: Cache, stamp: Int32Array, tag: number): SegEval {
  const cov: number[] = [];
  const r2 = COVER * COVER;
  let total = 0, out = 0;
  const visit = (ax: number, ay: number, bx: number, by: number) => {
    const bx0 = Math.max(0, Math.floor((Math.min(ax, bx) - COVER - LO) / BUCKET));
    const bx1 = Math.min(BUCKET_W - 1, Math.floor((Math.max(ax, bx) + COVER - LO) / BUCKET));
    const by0 = Math.max(0, Math.floor((Math.min(ay, by) - COVER - LO) / BUCKET));
    const by1 = Math.min(BUCKET_W - 1, Math.floor((Math.max(ay, by) + COVER - LO) / BUCKET));
    for (let yy = by0; yy <= by1; yy++) {
      for (let xx = bx0; xx <= bx1; xx++) {
        for (const i of c.buckets[yy * BUCKET_W + xx]) {
          if (stamp[i] === tag) continue;
          const p = c.pts[i];
          if (dist2(p[0], p[1], ax, ay, bx, by) <= r2) {
            stamp[i] = tag;
            cov.push(i);
          }
        }
      }
    }
  };
  if (seg.length === 1) {
    visit(seg[0][0], seg[0][1], seg[0][0], seg[0][1]);
    return { cov, leak: isNear(c, seg[0][0], seg[0][1]) ? 0 : 1 };
  }
  for (let k = 1; k < seg.length; k++) {
    const [ax, ay] = seg[k - 1], [bx, by] = seg[k];
    visit(ax, ay, bx, by);
    const len = Math.hypot(bx - ax, by - ay);
    if (len === 0) continue;
    const n = Math.max(1, Math.ceil(len / SAMPLE));
    const piece = len / n;
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n;
      total += piece;
      if (!isNear(c, ax + (bx - ax) * t, ay + (by - ay) * t)) out += piece;
    }
  }
  return { cov, leak: total > 0 ? out / total : isNear(c, seg[0][0], seg[0][1]) ? 0 : 1 };
}


/** 一組已平移縮放的段對一隻怪跑貪婪 */
function greedy(segs: Stroke[], shape: Shape, c: Cache, stamp: Int32Array, tagBase: number): { raw: number; kept: number[] } {
  const N = shape.pts.length;
  if (N === 0 || segs.length === 0) return { raw: 0, kept: [] };
  const evals = segs.map((s, i) => evalSeg(s, c, stamp, tagBase + i));
  const covered = new Uint8Array(N);
  const used = new Uint8Array(segs.length);
  const kept: number[] = [];
  let nCovered = 0, leakSum = 0;
  for (;;) {
    let best = -1, bestGain = -Infinity;
    for (let i = 0; i < evals.length; i++) {
      if (used[i]) continue;
      let fresh = 0;
      for (const p of evals[i].cov) if (!covered[p]) fresh++;
      const gain = fresh / N - LEAK_W * evals[i].leak;
      if (gain > bestGain) {
        bestGain = gain;
        best = i;
      }
    }
    if (best < 0 || bestGain <= MIN_GAIN) break;
    used[best] = 1;
    kept.push(best);
    leakSum += evals[best].leak;
    for (const p of evals[best].cov) {
      if (!covered[p]) {
        covered[p] = 1;
        nCovered++;
      }
    }
  }
  if (kept.length === 0) return { raw: 0, kept: [] };
  return { raw: nCovered / N - LEAK_W * (leakSum / kept.length), kept: kept.sort((a, b) => a - b) };
}

/** 15 種平移縮放（縮放以 64 格中心為準） */
function transforms(segs: Stroke[]): Stroke[][] {
  const out: Stroke[][] = [];
  for (const k of SCALES) {
    for (const [dx, dy] of OFFSETS) {
      out.push(segs.map(s => s.map(([x, y]): Pt => [(x - CENTER) * k + CENTER + dx, (y - CENTER) * k + CENTER + dy])));
    }
  }
  return out;
}

function fitWith(variants: Stroke[][], shape: Shape): { raw: number; kept: number[] } {
  const c = cacheOf(shape);
  const stamp = new Int32Array(shape.pts.length).fill(-1);
  const segCount = variants[0]?.length ?? 0;
  let best = { raw: 0, kept: [] as number[] };
  let found = false;
  variants.forEach((v, t) => {
    const r = greedy(v, shape, c, stamp, t * segCount);
    if (r.kept.length > 0 && (!found || r.raw > best.raw)) {
      best = r;
      found = true;
    }
  });
  return best;
}

/** 對 3 種縮放 × 5 種平移各跑一次貪婪，取 raw 最高；一段都沒留回 raw 0 */
export function fitShape(segs: Stroke[], shape: Shape): { raw: number; kept: number[] } {
  return fitWith(transforms(segs), shape);
}

/** raw → 0–99 整數像度（單調遞增；Task 8 用實際手寫校正） */
export function displayScore(raw: number): number {
  const x = Math.min(1, Math.max(0, (raw - 0.15) / 0.55));
  return Math.round(99 * Math.pow(x, 0.7));
}

/** 全部怪比完挑結果；rand 注入方便測試與分享重現 */
export function pickResult(segs: Stroke[], shapes: Shape[], rand: () => number): Result {
  const real = segs.filter(s => s.length > 0);
  if (real.length === 0 || shapes.length === 0) return { kind: "empty" };
  // 索引要對回原本的 segs，空段只是不參與
  const idx = segs.map((s, i) => (s.length > 0 ? i : -1)).filter(i => i >= 0);
  const variants = transforms(real);
  const fits = shapes.map((shape, i) => ({ i, ...fitWith(variants, shape) }));
  fits.sort((a, b) => b.raw - a.raw || a.i - b.i);
  const top = fits[0];
  if (top.kept.length === 0) return { kind: "poop", score: displayScore(0) };
  const cands = fits.slice(0, TOP_N).filter(f => f.kept.length > 0 && top.raw - f.raw < TIE);
  const pick = cands[Math.min(cands.length - 1, Math.floor(rand() * cands.length))];
  const score = displayScore(pick.raw);
  if (score < POOP_BELOW) return { kind: "poop", score };
  const shape = shapes[pick.i];
  const options = [{ id: shape.id, n: shape.n }, ...(shape.alt ?? [])];
  const who = options[Math.min(options.length - 1, Math.floor(rand() * options.length))];
  return { kind: "monster", id: who.id, n: who.n, kept: pick.kept.map(k => idx[k]), score };
}
