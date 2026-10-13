// src/lib/speed/read-exp.ts
import { classifyGlyph } from "./glyphs";
import { components, inkMask, textRows, type Box } from "./ink";
import type { Frame } from "./frame";
import type { StatusBar } from "./status-bar";

/**
 * EXP 條正上方那一行（「EXP 406947[79.73%]」）認成字串：組跟組之間隔得開的插空白。
 * 只框條上方 0.8 倍條高（剛好罩住字）：框到 1.0 倍以上會把字上面的白色 UI 線（基準圖 757、761 列）一起框進來，
 * 那些線比字亮，拉高了「最亮」的基準，縮放過的細筆畫就變淡、被切成碎塊（1.25、1.5 倍讀不出來）。
 * 小數點太小、常黏在旁邊的字上，先當小點拿掉（parseExp 自己補回小數點）；% 是三塊，同一欄重疊的塊併成一個字。
 */
export function readExpText(frame: Frame, bar: StatusBar): string {
  const h = bar.bottom - bar.top;
  const mask = inkMask(frame, { x: bar.exp[0], y: bar.top - 0.8 * h, w: bar.exp[1] - bar.exp[0], h: 0.8 * h });
  if (!mask) return "";
  const [y0, y1] = textRows(mask);
  if (y1 - y0 < 4) return "";
  const parts = components(mask, y0, y1).filter(part => part.n > 1);
  if (!parts.length) return "";
  const heights = parts.map(part => part.y1 - part.y0).sort((a, b) => a - b);
  const digitH = heights[Math.floor(heights.length * 0.6)];
  if (digitH < 5) return "";
  const glyphs: Box[] = [];
  for (const part of parts.filter(p => p.y1 - p.y0 >= digitH * 0.45).sort((a, b) => a.x0 - b.x0)) {
    const last = glyphs[glyphs.length - 1];
    if (last && part.x0 < last.x1 - 0.5) {
      last.x1 = Math.max(last.x1, part.x1);
      last.y0 = Math.min(last.y0, part.y0);
      last.y1 = Math.max(last.y1, part.y1);
      last.n += part.n;
    } else glyphs.push({ ...part });
  }
  let text = "";
  let prev: Box | null = null;
  for (const glyph of glyphs) {
    if (prev && glyph.x0 - prev.x1 > digitH * 0.9) text += " ";
    text += classifyGlyph(mask, glyph, digitH);
    prev = glyph;
  }
  return text;
}
