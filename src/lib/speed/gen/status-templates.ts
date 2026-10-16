// src/lib/speed/gen/status-templates.ts
/**
 * 狀態列數字的樣板怎麼產（glyphs.gen.ts 寫成 glyphs.json；__tests__/glyph-templates.test.ts 檢查 glyphs.json 沒過期）。
 * 用 @napi-rs/canvas 畫，只給產樣板跟測試用，不要從頁面或 Worker 引用。
 */
import { createCanvas } from "@napi-rs/canvas";
import type { Frame } from "../frame";
import { components, grid, inkMask } from "../ink";
import { addYellowInk } from "../read-exp";
import { STATUS_FONT } from "../status-font";

const round = (value: number) => Math.round(value * 1000) / 1000;
const hex = (cells: Float32Array) => Array.from(cells, value => Math.min(15, Math.round(value * 15)).toString(16)).join("");

/** 基準截圖 EXP 那行的底色；樣板畫在這個底上再縮放，字邊跟底混出來的顏色才跟遊戲畫面一樣 */
const STATUS_BG: [number, number, number] = [73, 81, 87];
/**
 * 遊戲視窗被放大的倍率、跟格線對不齊的偏移（0、半格）：每個字照這些情況先畫一遍、照讀畫面的同一套步驟量，各存一份樣板。
 * 縮放後 1 格寬的筆畫會被抹成兩格半亮，框出來的字變寬變矮（例如 1.1 倍的 9 寬高差不多，只存原尺寸的話會被認成 %）。
 */
const GLYPH_SCALES = [1, 1.1, 1.2, 1.25, 1.33, 1.4, 1.5, 1.6, 1.75, 1.9, 2];
const GLYPH_PHASES = [0, 0.5];

/**
 * 狀態列的一個點陣字（字的顏色照客戶端）畫在狀態列的底色上，放大 scale 倍、偏移 (dx, dy) 格（平滑縮放，跟 Windows／瀏覽器放大視窗一樣）。
 * 右邊另外畫一塊純白：讀畫面時「最亮」是整行最白的數字，樣板也要用同一個基準，淡掉的筆畫才一樣淡。回傳畫面跟字所在的寬度。
 */
function renderStatusGlyph(ch: string, scale: number, dx: number, dy: number): { frame: Frame; glyphW: number } {
  const { rows, rgb } = STATUS_FONT[ch];
  const pad = 2;
  const source = createCanvas(rows[0].length + pad * 2, rows.length + pad * 2);
  const sourceContext = source.getContext("2d");
  sourceContext.fillStyle = `rgb(${STATUS_BG.join(",")})`;
  sourceContext.fillRect(0, 0, source.width, source.height);
  sourceContext.fillStyle = `rgb(${rgb.join(",")})`;
  rows.forEach((line, y) => {
    for (let x = 0; x < line.length; x++) if (line[x] === "#") sourceContext.fillRect(x + pad, y + pad, 1, 1);
  });
  const glyphW = Math.ceil((source.width + 1) * scale);
  const canvas = createCanvas(glyphW + 8, Math.ceil((source.height + 1) * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = `rgb(${STATUS_BG.join(",")})`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, dx, dy, source.width * scale, source.height * scale);
  context.fillStyle = "#fff";
  context.fillRect(glyphW + 2, 0, 4, 4);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  return { frame: { width: canvas.width, height: canvas.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) }, glyphW };
}

/** 照讀畫面的步驟（readExpText）量一個字：墨、補括號的黃、連通塊、併成一個字的框 */
function measureStatusGlyph(ch: string, scale: number, dx: number, dy: number) {
  const { frame, glyphW } = renderStatusGlyph(ch, scale, dx, dy);
  const rect = { x: 0, y: 0, w: frame.width, h: frame.height };
  const mask = inkMask(frame, rect)!;
  addYellowInk(frame, rect, mask);
  const parts = components(mask, 0, mask.h).filter(part => part.n > 1 && part.x1 <= glyphW);
  const box = {
    x0: Math.min(...parts.map(part => part.x0)),
    x1: Math.max(...parts.map(part => part.x1)),
    y0: Math.min(...parts.map(part => part.y0)),
    y1: Math.max(...parts.map(part => part.y1)),
    n: 0,
  };
  return { aspect: round((box.x1 - box.x0) / (box.y1 - box.y0)), h: box.y1 - box.y0, grid: hex(grid(mask, box, 8, 12)) };
}

export type StatusTemplate = { ch: string; aspect: number; rh: number; grid: string };

/** 全部樣板：每個倍率、每個偏移各量一次，一模一樣的只留一份 */
export function buildStatusTemplates(): StatusTemplate[] {
  const chars: StatusTemplate[] = [];
  const seen = new Set<string>();
  for (const scale of GLYPH_SCALES) {
    for (const dx of GLYPH_PHASES) {
      for (const dy of GLYPH_PHASES) {
        const zero = measureStatusGlyph("0", scale, dx, dy).h;
        // 「/」狀態列的 EXP 那行沒有，HP、MP 那兩行才有；放進來測試才讀得了那兩行。小數點太小，讀的時候就拿掉了，不用樣板
        for (const ch of "0123456789[]%/") {
          const { aspect, h, grid: cells } = measureStatusGlyph(ch, scale, dx, dy);
          const entry = { ch, aspect, rh: round(h / zero), grid: cells };
          const key = JSON.stringify(entry);
          if (seen.has(key)) continue;
          seen.add(key);
          chars.push(entry);
        }
      }
    }
  }
  return chars;
}
