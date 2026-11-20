/**
 * 名字變怪物：筆畫處理與分享編碼。
 * 玩家手寫的筆畫（畫面座標）→ 在轉角切段 → 正規化到 64 格（跟 shapes.json 同一套格子）。
 * 分享連結的 #r=... 用 encodeShare / decodeShare，瀏覽器與 vitest 都能跑（不用 Buffer）。
 */

export type Pt = [number, number];
export type Stroke = Pt[];

/** 最多保留幾段（防手寫或惡意資料灌爆） */
export const MAX_SEGMENTS = 120;
/** 分享編碼單段最多幾點 */
const MAX_POINTS = 64;
/** 分享座標格數 */
const GRID = 64;
/** 編碼後最壞位元組數：標頭 6 + 每段(1+2*點數) + 保留(1+段數)；解碼字串長度上限由此推出 */
const MAX_BYTES = 6 + MAX_SEGMENTS * (1 + 2 * MAX_POINTS) + 1 + MAX_SEGMENTS;
const MAX_ENCODED = Math.ceil((MAX_BYTES * 4) / 3) + 4;

function polyLen(s: Stroke): number {
  let sum = 0;
  for (let i = 1; i < s.length; i++) sum += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
  return sum;
}

/** 轉角 > angleDeg 的地方切開；總長 < 2px 的段丟掉；超過 120 段留最長的（維持原順序） */
export function splitAtCorners(strokes: Stroke[], angleDeg = 60): Stroke[] {
  const limit = (angleDeg * Math.PI) / 180;
  const segs: Stroke[] = [];
  for (const stroke of strokes) {
    if (!stroke || stroke.length < 2) continue;
    let cur: Stroke = [stroke[0]];
    // 上一段有效方向（跳過重複點造成的零長度向量）
    let prev: Pt | null = null;
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1], b = stroke[i];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      if (dx === 0 && dy === 0) continue;
      if (prev) {
        const cross = prev[0] * dy - prev[1] * dx;
        const dot = prev[0] * dx + prev[1] * dy;
        const turn = Math.abs(Math.atan2(cross, dot));
        if (turn > limit) {
          segs.push(cur);
          cur = [a]; // 轉角點兩段共用，筆畫才接得起來
        }
      }
      cur.push(b);
      prev = [dx, dy];
    }
    segs.push(cur);
  }
  const kept = segs.map((s, i) => ({ s, i, len: polyLen(s) })).filter(x => x.len >= 2);
  if (kept.length <= MAX_SEGMENTS) return kept.map(x => x.s);
  return kept
    .sort((a, b) => b.len - a.len)
    .slice(0, MAX_SEGMENTS)
    .sort((a, b) => a.i - b.i)
    .map(x => x.s);
}

/** 等比縮放，長邊 = box，置中到 grid × grid */
export function normalize(strokes: Stroke[], grid = 64, box = 56): Stroke[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const [x, y] of s) {
    if (x < x0) {
      x0 = x;
    }
    if (x > x1) {
      x1 = x;
    }
    if (y < y0) {
      y0 = y;
    }
    if (y > y1) {
      y1 = y;
    }
  }
  if (!isFinite(x0)) return [];
  const longest = Math.max(x1 - x0, y1 - y0);
  const k = longest > 0 ? box / longest : 1;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const half = grid / 2;
  return strokes.map(s => s.map(([x, y]): Pt => [(x - cx) * k + half, (y - cy) * k + half]));
}

// ---------- 分享編碼 ----------

export type Share = { id: number | "poop"; score: number; all: Stroke[]; kept: number[] };

const POOP = 0xffffffff;
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function toB64Url(bytes: number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}

function fromB64Url(s: string): number[] | null {
  if (s.length % 4 === 1) return null;
  const vals: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const v = B64.indexOf(s[i]);
    if (v < 0) return null;
    vals.push(v);
  }
  const out: number[] = [];
  for (let i = 0; i < vals.length; i += 4) {
    const n = (vals[i] << 18) | ((vals[i + 1] ?? 0) << 12) | ((vals[i + 2] ?? 0) << 6) | (vals[i + 3] ?? 0);
    out.push((n >> 16) & 255);
    if (i + 2 < vals.length) out.push((n >> 8) & 255);
    if (i + 3 < vals.length) out.push(n & 255);
  }
  return out;
}

const q = (v: number) => Math.min(GRID - 1, Math.max(0, Math.round(v) || 0));

/** 版本 1 位元組格式：id(4) score(1) 段數(1) [點數(1) (x,y)(2)*]* 保留數(1) 保留索引(1)* */
export function encodeShare(r: Share): string {
  const b: number[] = [];
  const id = r.id === "poop" ? POOP : Math.max(0, Math.min(POOP - 1, Math.floor(r.id) || 0));
  b.push((id >>> 24) & 255, (id >>> 16) & 255, (id >>> 8) & 255, id & 255);
  b.push(Math.max(0, Math.min(99, Math.round(r.score) || 0)));
  // 空筆畫解碼端會拒絕，先丟掉並把 kept 索引重新對應；kept 去重
  const remap = new Map<number, number>();
  const all: Stroke[] = [];
  r.all.slice(0, MAX_SEGMENTS).forEach((st, i) => {
    if (st.length > 0) {
      remap.set(i, all.length);
      all.push(st);
    }
  });
  b.push(all.length);
  for (const st of all) {
    const pts = st.slice(0, MAX_POINTS);
    b.push(pts.length);
    for (const [x, y] of pts) {
      b.push(q(x), q(y));
    }
  }
  const kept: number[] = [];
  for (const i of r.kept) {
    const j = remap.get(i);
    if (j !== undefined && !kept.includes(j)) {
      kept.push(j);
    }
  }
  b.push(kept.length);
  for (const i of kept) {
    b.push(i);
  }
  return toB64Url(b);
}

/** 不信任輸入：任何格式不對、超量、多餘位元組都回 null，絕不丟例外 */
export function decodeShare(s: string): Share | null {
  try {
    if (typeof s !== "string" || s.length === 0 || s.length > MAX_ENCODED) return null;
    const b = fromB64Url(s);
    if (!b || b.length < 7) return null;
    let p = 0;
    const id32 = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
    p = 4;
    const score = b[p++];
    if (score > 99) return null;
    const n = b[p++];
    if (n > MAX_SEGMENTS) return null;
    const all: Stroke[] = [];
    for (let i = 0; i < n; i++) {
      const m = b[p++];
      if (m === undefined || m < 1 || m > MAX_POINTS) return null;
      const st: Stroke = [];
      for (let j = 0; j < m; j++) {
        const x = b[p++], y = b[p++];
        if (x === undefined || y === undefined || x >= GRID || y >= GRID) return null;
        st.push([x, y]);
      }
      all.push(st);
    }
    const kc = b[p++];
    if (kc === undefined || kc > n) return null;
    const kept: number[] = [];
    for (let i = 0; i < kc; i++) {
      const k = b[p++];
      if (k === undefined || k >= n) return null;
      kept.push(k);
    }
    if (p !== b.length) return null;
    return { id: id32 === POOP ? "poop" : id32, score, all, kept };
  } catch {
    return null;
  }
}
