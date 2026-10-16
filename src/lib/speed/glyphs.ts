// src/lib/speed/glyphs.ts
import data from "./glyphs.json";
import { grid, type Box, type Mask } from "./ink";

/**
 * EXP 那行的字樣板（遊戲狀態列的點陣字，npm run speed:glyphs -t "產 glyphs.json" 產）：寬高比、字高對「0」的比例、8×12 格。
 * 同一個字照 1～2 倍縮放、不同對齊各存一份；格子存成一格一個 0–f。
 */
type Template = { ch: string; aspect: number; rh: number; grid: Float32Array };
const TEMPLATES: Template[] = (data.chars as Array<{ ch: string; aspect: number; rh: number; grid: string }>).map(entry => ({
  ...entry,
  grid: Float32Array.from(entry.grid, cell => parseInt(cell, 16) / 15),
}));

/**
 * 一個字跟每個樣板比：格子的平均平方差＋寬高比差＋字高差（「.」被當成小點先拿掉了，「[」比數字高、「%」比較寬）。
 * digitH：這一行數字的高度（字高的中位數附近）。
 */
export function classifyGlyph(mask: Mask, box: Box, digitH: number): string {
  return matchGlyph(mask, box, digitH).ch;
}

/** 最像的字跟分數（越小越像） */
export function matchGlyph(mask: Mask, box: Box, digitH: number): { ch: string; score: number } {
  const cells = grid(mask, box, data.gw, data.gh);
  const aspect = (box.x1 - box.x0) / (box.y1 - box.y0);
  const rh = (box.y1 - box.y0) / digitH;
  let best = "";
  let bestScore = Infinity;
  for (const template of TEMPLATES) {
    let diff = 0;
    for (let i = 0; i < cells.length; i++) diff += (cells[i] - template.grid[i]) ** 2;
    const score = diff / cells.length + 0.3 * Math.abs(Math.log(aspect / template.aspect)) + 0.6 * Math.abs(Math.log(rh / template.rh));
    if (score < bestScore) {
      bestScore = score;
      best = template.ch;
    }
  }
  return { ch: best, score: bestScore };
}
