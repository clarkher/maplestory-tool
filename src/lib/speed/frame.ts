// src/lib/speed/frame.ts
/**
 * 練功測速認畫面用的畫面型別：跟瀏覽器 ImageData 一樣的排法（RGBA、一列接一列）。
 * 認畫面的函式全部只吃這個，瀏覽器（Worker 裡的 OffscreenCanvas）跟測試（@napi-rs/canvas 讀 PNG）都給得出來。
 */
export type Frame = { width: number; height: number; data: Uint8ClampedArray };
export type Rect = { x: number; y: number; w: number; h: number };

export function rgbAt(frame: Frame, x: number, y: number): [number, number, number] {
  const i = (y * frame.width + x) * 4;
  return [frame.data[i], frame.data[i + 1], frame.data[i + 2]];
}

export function lumOf(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** 範圍夾進畫面、四捨五入成整數；小於 2×2 回 null */
export function clampRect(frame: Frame, rect: Rect): Rect | null {
  const x = Math.max(0, Math.round(rect.x));
  const y = Math.max(0, Math.round(rect.y));
  const x1 = Math.min(frame.width, Math.round(rect.x + rect.w));
  const y1 = Math.min(frame.height, Math.round(rect.y + rect.h));
  return x1 - x >= 2 && y1 - y >= 2 ? { x, y, w: x1 - x, h: y1 - y } : null;
}
