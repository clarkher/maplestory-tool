/**
 * 名字變怪物：筆畫 ↔ 怪物輪廓比對與像度。
 * 輸入是已切段＋正規化到 64 格的筆畫（strokes.ts 的 splitAtCorners → normalize）。
 *
 * 每隻怪試兩類擺法，各跑一次貪婪挑段，取最高的 raw：
 *   - 等比：3 種縮放 × 5 種平移（以 64 格中心為準）
 *   - 拉伸：筆跡外框各軸分別拉到這隻怪的外框（每軸最多放大／縮小 2.5 倍）× 5 種平移
 *     （名字橫寫是一條扁帶，只靠等比會一直配到最扁的那隻怪）
 * 全部怪比完用 z = (raw − 基準平均)/基準標準差 排名（基準在 shapes.json 的 base，
 * 由 base.gen.ts 用假手寫名字離線算好），避免點少、外形特殊的怪每次都贏。
 * 沒有任何一隻像度到門檻（poopBelow：輸入不到 16 段 40、其他 56）就出大便（在亂數之前決定）；否則像度過關的怪裡照 z 排，
 * 前 3 名裡 z 跟第 1 名差 ≤ 0.15 的隨機挑一隻。
 */
import type { Pt, Stroke } from "./strokes";

export type Shape = {
  id: number;
  n: string;
  pts: Pt[];
  alt?: { id: number; n: string }[];
  /** 假手寫名字下 raw 的 [平均, 標準差] */
  base?: [number, number];
};

/** 擺法：配對位置 = (x*sx + dx, y*sy + dy)，套在正規化後的輸入段上（64 格）；等比時 sx === sy */
export type Xf = { sx: number; sy: number; dx: number; dy: number };

export type Result =
  | { kind: "monster"; id: number; n: string; kept: number[]; score: number; xf: Xf }
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
/** z 跟第 1 名差多少內算平手 */
const TIE_Z = 0.15;
/** 像度低於這個出大便 */
const POOP_BELOW = 56;
/** 段數少（英數 ID 常見）時的門檻：段少蓋得到的輪廓本來就少 */
const POOP_BELOW_FEW = 40;
/** 輸入不到這麼多段（splitAtCorners 之後、非空）算段數少 */
const FEW_SEGS = 16;
/** 拉伸時每軸最多放大／縮小幾倍 */
const MAX_STRETCH = 2.5;
/** 標準差下限，避免基準幾乎不動的怪 z 爆掉 */
const MIN_STD = 0.02;

const SCALES = [1, 0.9, 1.1];
const SHIFT = 4;
const OFFSETS: Pt[] = [[0, 0], [0, -SHIFT], [0, SHIFT], [-SHIFT, 0], [SHIFT, 0]];
const CENTER = 32;

// 快取格子涵蓋 [LO, HI)：等比最多到約 -3～67；拉伸會對齊輪廓外框（4.5～59.5）再平移 4 格，留邊
const LO = -8;
const HI = 72;
/** 外漏判定格子解析度（每格 0.5） */
const RES = 2;
const NEAR_W = (HI - LO) * RES;
/** 輪廓點分桶大小（格） */
const BUCKET = 4;
const BUCKET_W = (HI - LO) / BUCKET;
/** 外漏取樣步長（格） */
const SAMPLE = 1;
/** 比對前把筆畫簡化（Douglas–Peucker），偏離原線不超過這麼多格；手寫點很密，不簡化會慢好幾倍 */
const SIMPLIFY = 0.25;

type Box = { x0: number; y0: number; x1: number; y1: number };

type Cache = {
  pts: Pt[];
  /** near[cy*NEAR_W+cx] = 1：該 0.5 格中心離某輪廓點 ≤ 3 */
  near: Uint8Array;
  /** 每桶的輪廓點索引 */
  buckets: number[][];
  box: Box;
};

const caches = new WeakMap<Shape, Cache>();

function boxOf(lines: Pt[][]): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of lines) {
    for (const [x, y] of s) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

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
  c = { pts: shape.pts, near, buckets, box: boxOf([shape.pts]) ?? { x0: CENTER, y0: CENTER, x1: CENTER, y1: CENTER } };
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

/** 一段筆畫對一隻怪：蓋到哪些輪廓點、外漏長度比例（只有一點或零長度時看那一點在不在外面） */
function evalSeg(seg: Stroke, c: Cache, stamp: Int32Array, tag: number): SegEval {
  const cov: number[] = [];
  const r2 = COVER * COVER;
  let total = 0, out = 0;
  // 單點段當成零長度線段 a→a
  for (let k = seg.length === 1 ? 0 : 1; k < seg.length; k++) {
    const [ax, ay] = seg[k === 0 ? 0 : k - 1], [bx, by] = seg[k];
    const len = Math.hypot(bx - ax, by - ay);
    // 先取樣算外漏；整條邊都在 3 格外就不可能有輪廓點離它 ≤ 2 格（取樣間距 0.5、格子誤差 < 0.36），省掉查桶
    let anyNear = false;
    if (len === 0) anyNear = isNear(c, ax, ay);
    else {
      const n = Math.ceil(len / SAMPLE);
      const piece = len / n;
      for (let j = 0; j < n; j++) {
        const t = (j + 0.5) / n;
        total += piece;
        if (isNear(c, ax + (bx - ax) * t, ay + (by - ay) * t)) anyNear = true;
        else out += piece;
      }
    }
    if (!anyNear) continue;
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
  }
  const leak = total > 0 ? out / total : isNear(c, seg[0][0], seg[0][1]) ? 0 : 1;
  return { cov, leak };
}

type Fit = { raw: number; kept: number[] };
type FitXf = Fit & { xf: Xf };

/** 一組已擺好的段對一隻怪跑貪婪 */
function greedy(segs: Stroke[], c: Cache, stamp: Int32Array, tagBase: number): Fit {
  const N = c.pts.length;
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

/** Douglas–Peucker 簡化一段（保留頭尾） */
function simplify(seg: Stroke, tol = SIMPLIFY): Stroke {
  if (seg.length <= 2) return seg;
  const keep = new Uint8Array(seg.length);
  keep[0] = keep[seg.length - 1] = 1;
  const stack: [number, number][] = [[0, seg.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1, farD = t2;
    for (let i = a + 1; i < b; i++) {
      const d = dist2(seg[i][0], seg[i][1], seg[a][0], seg[a][1], seg[b][0], seg[b][1]);
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return seg.filter((_, i) => keep[i]);
}

type Variant = { xf: Xf; segs: Stroke[] };

const applyXf = (segs: Stroke[], xf: Xf): Stroke[] => segs.map(s => s.map(([x, y]): Pt => [x * xf.sx + xf.dx, y * xf.sy + xf.dy]));

/** 等比 15 種（縮放以 64 格中心為準），所有怪共用 */
function uniformVariants(segs: Stroke[]): Variant[] {
  const out: Variant[] = [];
  for (const k of SCALES) {
    for (const [ox, oy] of OFFSETS) {
      const xf = { sx: k, sy: k, dx: CENTER - CENTER * k + ox, dy: CENTER - CENTER * k + oy };
      out.push({ xf, segs: applyXf(segs, xf) });
    }
  }
  return out;
}

const clampStretch = (k: number) => (isFinite(k) ? Math.min(MAX_STRETCH, Math.max(1 / MAX_STRETCH, k)) : MAX_STRETCH);

/** 拉伸 5 種：筆跡外框各軸拉到這隻怪的外框，再做 5 種平移 */
function stretchVariants(segs: Stroke[], ink: Box, c: Cache): Variant[] {
  const kx = clampStretch((c.box.x1 - c.box.x0) / (ink.x1 - ink.x0));
  const ky = clampStretch((c.box.y1 - c.box.y0) / (ink.y1 - ink.y0));
  const icx = (ink.x0 + ink.x1) / 2, icy = (ink.y0 + ink.y1) / 2;
  const scx = (c.box.x0 + c.box.x1) / 2, scy = (c.box.y0 + c.box.y1) / 2;
  return OFFSETS.map(([ox, oy]) => {
    const xf = { sx: kx, sy: ky, dx: scx - icx * kx + ox, dy: scy - icy * ky + oy };
    return { xf, segs: applyXf(segs, xf) };
  });
}

function fitWith(segs: Stroke[], uniform: Variant[], ink: Box, shape: Shape): FitXf {
  const c = cacheOf(shape);
  const variants = [...uniform, ...stretchVariants(segs, ink, c)];
  const stamp = new Int32Array(c.pts.length).fill(-1);
  let best: FitXf = { raw: 0, kept: [], xf: variants[0].xf };
  variants.forEach((v, t) => {
    const r = greedy(v.segs, c, stamp, t * segs.length);
    if (r.kept.length > 0 && (best.kept.length === 0 || r.raw > best.raw)) best = { ...r, xf: v.xf };
  });
  return best;
}

/** 等比 15 種＋拉伸 5 種擺法各跑一次貪婪，取 raw 最高；一段都沒留回 raw 0（xf 是贏的擺法） */
export function fitShape(segs: Stroke[], shape: Shape): FitXf {
  const ink = boxOf(segs);
  if (!ink) return { raw: 0, kept: [], xf: { sx: 1, sy: 1, dx: 0, dy: 0 } };
  const simple = segs.map(s => simplify(s));
  return fitWith(simple, uniformVariants(simple), ink, shape);
}

/**
 * raw → 0–99 整數像度（單調遞增）。
 * 2026-11-20 用真筆畫手寫樣本校正（__fixtures__/hand.json＋60 組報告）：像度門檻見 poopBelow（不到 16 段 40、其他 56），
 * 60 組裡一坨約 1 成（原本 0.15／0.55 時門檻 raw 0.357，10 組 0 坨、60 組約 5%）；raw 0.70 以上 99。
 */
export function displayScore(raw: number): number {
  const x = Math.min(1, Math.max(0, (raw - 0.24) / 0.46));
  return Math.round(99 * Math.pow(x, 0.7));
}

/** 跟這隻怪的基準比，高出幾個標準差；沒有基準時直接用 raw */
function zOf(raw: number, shape: Shape): number {
  if (!shape.base) return raw;
  const [mean, std] = shape.base;
  return (raw - mean) / Math.max(MIN_STD, std);
}

/** 出大便的像度門檻：輸入段數 < 16 用 40，其他 56（60 組手寫樣本一坨拉回 1 成的最小整數；2026-11-20 裁示：英數 ID 段少（Clark 10 段、8591 12 段），同樣門檻四成變一坨） */
export function poopBelow(segCount: number): number {
  return segCount < FEW_SEGS ? POOP_BELOW_FEW : POOP_BELOW;
}

/** 全部怪比完挑結果；rand 注入方便測試與分享重現 */
export function pickResult(segs: Stroke[], shapes: Shape[], rand: () => number): Result {
  // 空段不參與，但 kept 索引要對回原本的 segs
  const idx = segs.map((s, i) => (s.length > 0 ? i : -1)).filter(i => i >= 0);
  const real = idx.map(i => simplify(segs[i]));
  const ink = boxOf(real);
  if (!ink || shapes.length === 0) return { kind: "empty" };
  const uniform = uniformVariants(real);
  const fits = shapes.map((shape, i) => {
    const f = fitWith(real, uniform, ink, shape);
    return { i, ...f, score: f.kept.length > 0 ? displayScore(f.raw) : 0, z: zOf(f.raw, shape) };
  });
  // 大便：沒有任何一隻像度到門檻（只看分數，亂數翻不了）
  const bar = poopBelow(real.length);
  const ok = fits.filter(f => f.kept.length > 0 && f.score >= bar);
  if (ok.length === 0) return { kind: "poop", score: Math.max(...fits.map(f => f.score)) };
  // 像度過關的怪裡用 z 排名；前 3 名跟第 1 名差 ≤ 0.15 的隨機挑
  ok.sort((x, y) => y.z - x.z || x.i - y.i);
  const cands = ok.slice(0, TOP_N).filter(f => ok[0].z - f.z <= TIE_Z);
  const pick = cands[Math.min(cands.length - 1, Math.floor(rand() * cands.length))];
  const shape = shapes[pick.i];
  const options = [{ id: shape.id, n: shape.n }, ...(shape.alt ?? [])];
  const who = options[Math.min(options.length - 1, Math.floor(rand() * options.length))];
  return { kind: "monster", id: who.id, n: who.n, kept: pick.kept.map(k => idx[k]), score: pick.score, xf: pick.xf };
}
