/**
 * 名字變怪物：演出 renderer。畫面播放與錄影逐格共用，drawStage 對 ms 是純函式
 * （同樣輸入 → 同一格；不用 Date、Math.random、模組層狀態）。
 * 筆畫座標是 64 格（跟 shapes.json 同一套），映射到 w×h 的正方形舞台。
 */
import type { Pt, Stroke } from "./strokes";
import type { Result } from "./match";

export const TIMELINE = { write: 1200, collect: 1500, morph: 1500, title: 1300 } as const;

export type Phase = "write" | "collect" | "morph" | "title" | "done";

export function phaseAt(ms: number): { phase: Phase; p: number } {
  const t = Math.max(0, ms);
  let edge = 0;
  for (const phase of ["write", "collect", "morph", "title"] as const) {
    const d = TIMELINE[phase];
    if (t < edge + d) return { phase, p: (t - edge) / d };
    edge += d;
  }
  return { phase: "done", p: 1 };
}

export type StageInput = {
  w: number;
  h: number;
  segs: Stroke[];
  kept: number[];
  result: Result;
  mob?: CanvasImageSource;
  /** 怪物輪廓（shapes.json 的 pts，64 格）；有的話留下的段會貼到輪廓上，沒有就只淡出 */
  shape?: { pts: [number, number][] };
  ms: number;
  caption: boolean;
};

const INK = "#2b2b2b";
const BROWN = "#3c3028";
const BLUE = "#1e5ac8";
const FONT = '"Noto Sans TC", "Microsoft JhengHei", sans-serif';
const GRID = 64;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** 固定種子亂數（mulberry32） */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 舞台正方形：置中偏上，下方留給標題 */
function boxOf(w: number, h: number): { ox: number; oy: number; S: number } {
  const S = Math.min(w * 0.88, h * 0.66);
  return { ox: (w - S) / 2, oy: h * 0.07, S };
}

function pathOf(ctx: CanvasRenderingContext2D, pts: Pt[], map: (p: Pt) => Pt): void {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = map(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
}

/** 只取前 frac（依長度）的折線 */
function partial(pts: Pt[], frac: number): Pt[] {
  if (frac >= 1 || pts.length < 2) return pts;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let left = total * frac;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (left >= d) {
      out.push(pts[i]);
      left -= d;
      continue;
    }
    const k = d > 0 ? left / d : 0;
    out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]);
    break;
  }
  return out;
}

type Xf = { sx: number; sy: number; dx: number; dy: number };
type Bbox = { x: number; y: number; w: number; h: number };

const bboxCache = new WeakMap<object, Bbox>();
function bboxOf(pts: Pt[], key?: object): Bbox {
  const hit = key && bboxCache.get(key);
  if (hit) return hit;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const b = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  if (key) bboxCache.set(key, b);
  return b;
}

/** 落地壓扁係數：t 0.7→1 平滑由 1 壓到 0.25，跟下落連續（不會一格跳掉） */
export function squashAt(t: number): number {
  return 1 - 0.75 * ease((t - 0.7) / 0.3);
}
/** 大便某段在 ms 的下落進度 t（1＝剛落地） */
export function fallT(ms: number, delay: number): number {
  const cp = phaseAt(ms).phase === "collect" ? phaseAt(ms).p : phaseAt(ms).phase === "write" ? 0 : 1;
  return clamp01((cp - delay) / 0.55);
}

/** 大便：每段的落地資料（固定種子，跟 ms 無關） */
type Plan = { delay: number; dy: number; dx: number; maxY: number }[];
const planCache = new WeakMap<Stroke[], Plan>();
function poopPlan(segs: Stroke[]): Plan {
  const hit = planCache.get(segs);
  if (hit) return hit;
  const r = buildPlan(segs);
  planCache.set(segs, r);
  return r;
}
function buildPlan(segs: Stroke[]): Plan {
  const rand = rng(20261120);
  const heights = new Array(8).fill(0); // 8 欄堆疊高度（格）
  return segs.map((s, i) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of s) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    const col = Math.min(7, Math.max(0, Math.floor(((minX + maxX) / 2 / GRID) * 8)));
    const dx = (rand() - 0.5) * 3;
    const delay = rand() * 0.35 + (i / Math.max(1, segs.length)) * 0.1;
    const target = GRID - heights[col];
    heights[col] += 1.6;
    return { delay, dy: target - maxY, dx, maxY };
  });
}

export function drawStage(ctx: CanvasRenderingContext2D, s: StageInput): void {
  const { w, h, segs, kept, result, mob, shape, ms, caption } = s;
  const { phase, p } = phaseAt(ms);
  const { ox, oy, S } = boxOf(w, h);
  const k = S / GRID;
  const keptSet = new Set(kept);
  const isPoop = result.kind === "poop";
  const isMonster = result.kind === "monster";
  const map = (q: Pt): Pt => [ox + q[0] * k, oy + q[1] * k];

  ctx.save();
  // 紙底
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#fbf6ea";
  ctx.fillRect(0, 0, w, h);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, S * 0.022);
  ctx.strokeStyle = INK;

  const stroke = (pts: Pt[], alpha: number, mapper: (q: Pt) => Pt = map) => {
    if (alpha <= 0 || pts.length < 2) return;
    ctx.globalAlpha = alpha;
    pathOf(ctx, pts, mapper);
    ctx.stroke();
  };

  const plan = isPoop ? poopPlan(segs) : null;
  const outline = isMonster && shape && shape.pts.length ? shape.pts : null;
  // 比對的仿射；沒有就把所有留下的段整體貼進輪廓外框（等比縮放置中）
  let xf: Xf | null = (result.kind === "monster" && (result as { xf?: Xf }).xf) || null;
  if (!xf && outline && shape && isMonster && kept.length) {
    const kp: Pt[] = [];
    for (const i of kept) if (segs[i]) kp.push(...segs[i]);
    if (kp.length) {
      const kb = bboxOf(kp);
      const sb = bboxOf(outline, shape);
      const sc = Math.min(sb.w / Math.max(kb.w, 1e-6), sb.h / Math.max(kb.h, 1e-6));
      xf = { sx: sc, sy: sc, dx: sb.x + sb.w / 2 - (kb.x + kb.w / 2) * sc, dy: sb.y + sb.h / 2 - (kb.y + kb.h / 2) * sc };
    }
  }

  if (phase === "write") {
    // 依序寫出：每段佔 1/n 的時間
    const n = Math.max(1, segs.length);
    segs.forEach((seg, i) => stroke(partial(seg, clamp01(p * n - i)), 1));
  } else {
    const cp = phase === "collect" ? p : 1; // 收集進度
    const mp = phase === "morph" ? p : phase === "collect" ? 0 : 1; // 變形進度

    // 怪圖淡入（畫在筆畫底下）
    if (isMonster && mob && mp > 0) {
      let bx = 0;
      let by = 0;
      let bw = GRID;
      let bh = GRID;
      if (outline && shape) {
        const bb = bboxOf(outline, shape);
        bx = bb.x; by = bb.y; bw = bb.w; bh = bb.h;
      }
      const iw = (mob as { width?: number }).width || 1;
      const ih = (mob as { height?: number }).height || 1;
      const sc = Math.min((bw * k) / iw, (bh * k) / ih);
      const dw = iw * sc;
      const dh = ih * sc;
      ctx.globalAlpha = ease((mp - 0.35) / 0.65);
      ctx.drawImage(mob, ox + (bx + bw / 2) * k - dw / 2, oy + (by + bh / 2) * k - dh / 2, dw, dh);
    }

    segs.forEach((seg, i) => {
      if (isPoop && plan) {
        // 掉落：t² 加速，落地後壓扁成一小堆（高度壓到 25%）
        const q = plan[i];
        const t = clamp01((cp - q.delay) / 0.55);
        const fall = q.dy * t * t;
        const squash = squashAt(t);
        stroke(seg, 1, (pt) => [
          ox + (pt[0] + q.dx * t) * k,
          oy + (q.maxY + fall - (q.maxY - pt[1]) * squash) * k,
        ]);
        return;
      }
      if (isMonster && keptSet.has(i)) {
        // 留下的段：整段仿射（平移＋縮放）從原位插值到比對位置，形狀不變
        const e = ease(mp);
        stroke(seg, 1 - 0.4 * e, (pt) => {
          const t = xf ? [pt[0] * xf.sx + xf.dx, pt[1] * xf.sy + xf.dy] : pt;
          return map([pt[0] + (t[0] - pt[0]) * e, pt[1] + (t[1] - pt[1]) * e]);
        });
        return;
      }
      // 沒留的段往左上飛走淡出
      const e = ease(cp);
      const dist = S * 0.7 * e;
      stroke(seg, 1 - e, (pt) => {
        const [x, y] = map(pt);
        return [x - dist, y - dist];
      });
    });
  }

  // 標題
  if (phase === "title" || phase === "done") {
    ctx.globalAlpha = ease(phase === "title" ? p * 1.6 : 1);
    ctx.textBaseline = "middle";
    const baseY = oy + S + S * 0.14;
    if (result.kind === "monster") {
      const fs = Math.round(S * 0.085);
      ctx.font = `bold ${fs}px ${FONT}`;
      ctx.textAlign = "left";
      const a1 = "今天起是「";
      const c1 = "」";
      const wa = ctx.measureText(a1).width;
      const wb = ctx.measureText(result.n).width;
      const wc = ctx.measureText(c1).width;
      let x = (w - (wa + wb + wc)) / 2;
      ctx.fillStyle = BROWN;
      ctx.fillText(a1, x, baseY);
      x += wa;
      ctx.fillStyle = BLUE;
      ctx.fillText(result.n, x, baseY);
      x += wb;
      ctx.fillStyle = BROWN;
      ctx.fillText(c1, x, baseY);
      ctx.font = `${Math.round(S * 0.06)}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(`像度 ${result.score}%`, w / 2, baseY + fs * 1.3);
    } else if (result.kind === "poop") {
      ctx.font = `bold ${Math.round(S * 0.085)}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillStyle = BROWN;
      ctx.fillText("測出來是一坨", w / 2, baseY);
    }
  }

  if (caption) {
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = BROWN;
    ctx.font = `${Math.max(10, Math.round(S * 0.04))}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("maplehelper.tw", w / 2, h - Math.max(6, h * 0.02));
  }
  ctx.restore();
}
