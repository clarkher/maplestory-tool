// src/lib/speed/read-name.ts
import { bbox, grid, inkMask, textRows, type Box, type Mask } from "./ink";
import type { Frame, Rect } from "./frame";
import { BASE_BAR_H, type StatusBar } from "./status-bar";

/** 每個字縮成 NAME_CELL×NAME_CELL 格比（8 格就認得出「沙士K」，12 格反而把士認成十：格子太細，反鋸齒的差別被放大） */
export const NAME_CELL = 8;

/**
 * public/data/speed-chars.json（npm run speed:glyphs 產）：字集、每種字級（sizes）各畫一輪，
 * aspects／cells 依「字級 → 字」排：每個樣板一個寬高比、64 格（每格一個 0–f）
 */
export type RawSpeedChars = { font: string; sizes: number[]; cell: number; chars: string; aspects: number[]; cells: string };
export type SpeedChars = { chars: string[]; aspects: Float32Array; grids: Float32Array; cell: number };

/** 角色名可能用到的字：Big5 常用字（A440–C67E，5,401 個）＋英文大小寫＋數字 */
export function nameCharset(): string[] {
  const decoder = new TextDecoder("big5");
  const out: string[] = [];
  for (let hi = 0xa4; hi <= 0xc6; hi++) {
    for (const lo of [...range(0x40, 0x7e), ...range(0xa1, 0xfe)]) {
      if (hi === 0xc6 && lo > 0x7e) break;
      const ch = decoder.decode(new Uint8Array([hi, lo]));
      if (Array.from(ch).length === 1 && ch !== "�") out.push(ch);
    }
  }
  for (const [a, b] of [[0x30, 0x39], [0x41, 0x5a], [0x61, 0x7a]]) for (let c = a; c <= b; c++) out.push(String.fromCharCode(c));
  return out;
}

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

export function parseChars(raw: RawSpeedChars): SpeedChars {
  const chars = raw.sizes.flatMap(() => Array.from(raw.chars));
  const size = raw.cell * raw.cell;
  const grids = new Float32Array(chars.length * size);
  for (let i = 0; i < grids.length; i++) grids[i] = parseInt(raw.cells[i], 16) / 15;
  return { chars, aspects: Float32Array.from(raw.aspects), grids, cell: raw.cell };
}

/**
 * 角色名那一行（職業名正下面）：基準截圖（舊客戶端）字佔 y 780～792、條上緣 778；2026-11-11 新客戶端字佔 749～760、條上緣 746。
 * 兩版都是「條上緣往下 1～15 格」；左右從職業名的左緣（read-job 的 jobRect）往右框到 HP 條前面（名字最長 12 個字＝156 格）。
 */
export function nameRect(bar: StatusBar): Rect {
  const unit = bar.scale * BASE_BAR_H;
  const x = bar.hp[0] - 20.3 * unit;
  return { x, y: bar.top + 0.5 * bar.scale, w: bar.hp[0] - 1.2 * unit - x, h: 16 * bar.scale };
}

/** 一格是字的門檻（跟 bbox 預設一樣） */
const INK = 0.45;
/** 幾段併成一個字，併起來最寬這麼多個字高（「沙」的三點水跟「少」、「莉」的禾跟刂是分開的塊） */
const MAX_CHAR_ASPECT = 1.25;
/** 最像的字分數要到這麼高才算讀到（相關係數扣掉寬高比的罰分）；更低的當成雜點，整個名字不給 */
const MIN_SCORE = 0.3;

/**
 * 讀狀態列的角色名：切成一欄一欄的墨塊，從左往右每次試「接下來 1～3 塊併成一個字」，挑跟樣板最像的那種併法。
 * 樣板是微軟正黑體 12px、13px（遊戲客戶端沒帶中文字型，用的是系統的正黑體），同一個字兩張取比較像的。這是「先幫你填好、你可以改」用的，
 * 不保證全對（2026-11-11 兩張真截圖原尺寸全對；放大 1.25、1.5 倍時「芙莉蓮熊芙莉」的蓮會讀錯）。讀不到（沒有字、太矮、有一個字太不像）回 null。
 */
export function readName(frame: Frame, bar: StatusBar, chars: SpeedChars): string | null {
  const mask = inkMask(frame, nameRect(bar), false, 0.99);
  if (!mask) return null;
  const [y0, y1] = textRows(mask);
  const lineH = y1 - y0;
  if (lineH < 6 * bar.scale) return null;
  const segments = columns(mask, y0, y1);
  if (!segments.length || segments.length > 40) return null;
  let text = "";
  for (let i = 0; i < segments.length; ) {
    let best: { score: number; ch: string; next: number } | null = null;
    for (let j = i; j < Math.min(i + 3, segments.length); j++) {
      const box = tighten(mask, { x0: segments[i][0], x1: segments[j][1], y0, y1, n: 0 });
      if (!box) continue;
      if (box.x1 - box.x0 > MAX_CHAR_ASPECT * lineH) break;
      const found = bestChar(mask, box, chars);
      if (!best || found.score > best.score) best = { ...found, next: j + 1 };
    }
    if (!best || best.score < MIN_SCORE) return null;
    text += best.ch;
    i = best.next;
  }
  return text || null;
}

/** 有墨的欄連成一段一段 [起, 迄) */
function columns(mask: Mask, y0: number, y1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = -1;
  for (let x = 0; x <= mask.w; x++) {
    let ink = false;
    if (x < mask.w) for (let y = y0; y < y1 && !ink; y++) ink = mask.m[y * mask.w + x] > INK;
    if (ink && start < 0) start = x;
    if (!ink && start >= 0) {
      out.push([start, x]);
      start = -1;
    }
  }
  return out;
}

/** 範圍縮到裡面的墨剛好框住（上下也縮：「一」「K」這種字比整行矮） */
function tighten(mask: Mask, box: Box): Box | null {
  let x0 = box.x1, x1 = box.x0, y0 = box.y1, y1 = box.y0, n = 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      if (mask.m[y * mask.w + x] <= INK) continue;
      n++;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x + 1);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y + 1);
    }
  }
  return n ? { x0, x1, y0, y1, n } : null;
}

/** 這塊最像哪個字：格子的相關係數，扣掉寬高比差（log）的一半 */
function bestChar(mask: Mask, box: Box, chars: SpeedChars): { score: number; ch: string } {
  const size = chars.cell * chars.cell;
  const cells = grid(mask, box, chars.cell, chars.cell);
  for (let i = 0; i < size; i++) cells[i] = Math.round(cells[i] * 15) / 15;
  const mean = cells.reduce((sum, v) => sum + v, 0) / size;
  let norm = 0;
  for (let i = 0; i < size; i++) {
    cells[i] -= mean;
    norm += cells[i] * cells[i];
  }
  const aspect = (box.x1 - box.x0) / (box.y1 - box.y0);
  let best = { score: -Infinity, ch: "" };
  for (let k = 0; k < chars.chars.length; k++) {
    const offset = k * size;
    let tMean = 0;
    for (let i = 0; i < size; i++) tMean += chars.grids[offset + i];
    tMean /= size;
    let dot = 0;
    let tNorm = 0;
    for (let i = 0; i < size; i++) {
      const t = chars.grids[offset + i] - tMean;
      dot += t * cells[i];
      tNorm += t * t;
    }
    const corr = norm > 0 && tNorm > 0 ? dot / Math.sqrt(norm * tNorm) : 0;
    const score = corr - 0.5 * Math.abs(Math.log(aspect / chars.aspects[k]));
    if (score > best.score) best = { score, ch: chars.chars[k] };
  }
  return best;
}

/** 讀出來的名字能不能當角色 ID 帶入：2～12 個字（跟 view.ts 的 parseCharId 同一個範圍） */
export function usableName(name: string | null): string | null {
  if (!name) return null;
  const length = Array.from(name).length;
  return length >= 2 && length <= 12 ? name : null;
}
