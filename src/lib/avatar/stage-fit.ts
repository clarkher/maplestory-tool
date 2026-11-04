/**
 * 紙娃娃舞台怎麼擺（純函式，不碰 DOM）：照角色圖「實際畫到的範圍」決定放大倍數跟地面線。
 * 圖是 renderMode=4：腳在整張圖正中間 (w/2, h/2)、一律 1 倍，所以範圍都從圖的中心量。
 *   放得下：照舊 base 倍、地面線 minGround（腳的位置不跳）
 *   腳底下超出：把地面線往上挪
 *   還放不下：縮到剛好，對齊到「一格原圖＝整數個螢幕像素」，像素才不會忽粗忽細。不直接掉到 1 倍：換動作時角色不會突然縮一半
 */

/** 這張圖從腳（圖正中間）往上、往下、往左右最遠畫到幾像素（1 倍） */
export type Reach = { up: number; down: number; half: number };

/** 舞台左右至少留白（兩邊加起來） */
const SIDE_GAP = 16;
/** 地面線照舊時，角色上面至少留白 */
const TOP_GAP = 8;
/** 地面線往上挪時，腳底下的東西離舞台底留白（TOP_GAP + BOTTOM_GAP 是上下加起來的留白） */
const BOTTOM_GAP = 4;

/**
 * 量 RGBA 像素：只要 alpha 大於 0 就算畫到。全透明回 null。
 * 第 y 列涵蓋 [y, y+1)，所以往下、往右要算到 max + 1；up、down 不會是負的（整個角色都在腳的同一側時）。
 */
export function alphaReach(pixels: Uint8ClampedArray, w: number, h: number): Reach | null {
  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (pixels[(y * w + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return {
    up: Math.max(0, h / 2 - minY),
    down: Math.max(0, maxY + 1 - h / 2),
    half: Math.max(w / 2 - minX, maxX + 1 - w / 2),
  };
}

/** 沒量到（讀不了像素、全透明）：照 v1.40 算法，腳以上當整張圖的一半、腳底下當 0 */
export const unmeasured = (w: number, h: number): Reach => ({ up: h / 2, down: 0, half: w / 2 });

/**
 * 這幾格（多格動作取最遠的）在這個舞台要放幾倍、地面線離舞台底多高。
 * box 還沒量到（或舞台藏起來、量到 0）就回 base 跟 minGround。
 */
export function fitStage(
  reaches: Reach[],
  box: { w: number; h: number } | null,
  base: number,
  minGround: number,
  dpr: number,
): { scale: number; ground: number } {
  if (!box || box.w <= 0 || box.h <= 0 || reaches.length === 0) return { scale: base, ground: minGround };
  const up = Math.max(...reaches.map((r) => r.up));
  const down = Math.max(...reaches.map((r) => r.down));
  const half = Math.max(...reaches.map((r) => r.half));
  const fit = Math.min(
    base,
    (box.w - SIDE_GAP) / (2 * half),
    (box.h - minGround - TOP_GAP) / up,
    (box.h - TOP_GAP - BOTTOM_GAP) / (up + down),
  );
  let scale = base;
  if (fit < base) {
    const snapped = Math.floor(fit * dpr) / dpr;
    scale = snapped > 0 ? snapped : fit;
  }
  return { scale, ground: Math.max(minGround, down * scale + BOTTOM_GAP) };
}
