// src/lib/speed/gen/glyphs.gen.ts
/**
 * 產練功測速的字形樣板（本機跑：npm run speed:glyphs，要 Windows 的字型）。
 * - src/lib/speed/glyphs.json：EXP 那行的字（0–9、[、]、%），微軟正黑體
 * - public/data/speed-names.json：職業名（微軟正黑體）、小地圖的街道名跟地圖名（TITLE_FONT）
 * 只存縮成格子的特徵（每字 8×12、每行高 8 格），不存字型本身。
 * 地圖資料（public/data/maps.json）多了新地圖名就要重跑，不然新圖認不到（頁面會改請玩家點選）。
 */
import fs from "node:fs";
import path from "node:path";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { it } from "vitest";
import type { Frame } from "../frame";
import { components, grid, inkMask } from "../ink";

const JOB_FONT = "C:/Windows/Fonts/msjh.ttc";
const ROOT = process.cwd();

function render(text: string, family: string, px: number): Frame {
  const canvas = createCanvas(Math.ceil(px * (Array.from(text).length + 2)), px * 2);
  const context = canvas.getContext("2d");
  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fff";
  context.font = `${px}px "${family}"`;
  context.textBaseline = "alphabetic";
  context.fillText(text, px / 2, px * 1.3);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

const round = (value: number) => Math.round(value * 1000) / 1000;

it("產 glyphs.json", () => {
  GlobalFonts.registerFromPath(JOB_FONT, "SpeedDigits");
  const chars = [];
  for (const ch of "0123456789[]%") {
    const frame = render(ch, "SpeedDigits", 96);
    const mask = inkMask(frame, { x: 0, y: 0, w: frame.width, h: frame.height })!;
    const parts = components(mask, 0, mask.h);
    const box = {
      x0: Math.min(...parts.map(part => part.x0)),
      x1: Math.max(...parts.map(part => part.x1)),
      y0: Math.min(...parts.map(part => part.y0)),
      y1: Math.max(...parts.map(part => part.y1)),
      n: 0,
    };
    chars.push({ ch, aspect: round((box.x1 - box.x0) / (box.y1 - box.y0)), h: box.y1 - box.y0, grid: Array.from(grid(mask, box, 8, 12), round) });
  }
  const zero = chars.find(entry => entry.ch === "0")!.h;
  const out = { font: "Microsoft JhengHei", gw: 8, gh: 12, chars: chars.map(({ h, ...rest }) => ({ ...rest, rh: round(h / zero) })) };
  fs.writeFileSync(path.join(ROOT, "src/lib/speed/glyphs.json"), `${JSON.stringify(out)}\n`);
});
