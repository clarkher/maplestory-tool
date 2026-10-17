// src/lib/speed/gen/glyphs.gen.ts
/**
 * 產練功測速的字形樣板（本機跑：npm run speed:glyphs，要 Windows 的字型；只重產數字用 -t "產 glyphs.json"，不用字型）。
 * - src/lib/speed/glyphs.json：EXP 那行的字（0–9、[、]、%、/），用遊戲自己的點陣字（status-font.ts，從客戶端抽的）。
 *   2026-10-17 以前是微軟正黑體，跟遊戲的字長得不一樣，1 被認成 ]、3 跟 5 被認成 8，經驗幾乎都讀不出來。
 * - public/data/speed-names.json：職業名（微軟正黑體）、小地圖的街道名跟地圖名（TITLE_FONT）
 * 只存縮成格子的特徵（每字 8×12、每行高 8 格），不存字型本身。
 * 地圖資料（public/data/maps.json）多了新地圖名就要重跑，不然新圖認不到（頁面會改請玩家點選）。
 */
import fs from "node:fs";
import path from "node:path";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { it } from "vitest";
import type { Frame } from "../frame";
import { bbox, grid, inkMask } from "../ink";
import { JOB_TEXT } from "../read-job";
import { buildStatusTemplates } from "./status-templates";

const JOB_FONT = "C:/Windows/Fonts/msjh.ttc";
// 小地圖標題的字型：Task 6 用無損截圖比過再定；還沒有無損截圖前先用微軟正黑體
const TITLE_FONT = "C:/Windows/Fonts/msjh.ttc";
const ROOT = process.cwd();

function registerFont(file: string, family: string) {
  if (!GlobalFonts.registerFromPath(file, family)) throw new Error("找不到字型：" + file);
}

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
const hex = (cells: Float32Array) => Array.from(cells, value => Math.min(15, Math.round(value * 15)).toString(16)).join("");

it("產 glyphs.json", () => {
  const out = { font: "遊戲狀態列點陣字（客戶端 UI/StatusBar/number），照 1～2 倍縮放模擬", gw: 8, gh: 12, chars: buildStatusTemplates() };
  fs.writeFileSync(path.join(ROOT, "src/lib/speed/glyphs.json"), `${JSON.stringify(out)}\n`);
});

it("產 speed-names.json", () => {
  registerFont(JOB_FONT, "SpeedJob");
  registerFont(TITLE_FONT, "SpeedTitle");
  const line = (text: string, family: string) => {
    const frame = render(text, family, 48);
    const mask = inkMask(frame, { x: 0, y: 0, w: frame.width, h: frame.height }, false, 0.99)!;
    const box = bbox(mask)!;
    const gw = 8 * Math.max(1, Array.from(text).length);
    return [text, round((box.x1 - box.x0) / (box.y1 - box.y0)), hex(grid(mask, box, gw, 8))];
  };
  const maps = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/maps.json"), "utf8")) as Record<string, { zh?: string; st?: string }>;
  const titles = new Set<string>();
  for (const record of Object.values(maps)) {
    if (!record.zh) continue;
    titles.add(record.zh);
    if (record.st) titles.add(record.st);
  }
  const jobs = JOB_TEXT.flatMap(([, texts]) => texts);
  const out = {
    jobFont: "Microsoft JhengHei",
    titleFont: path.basename(TITLE_FONT),
    gh: 8,
    cell: 8,
    jobs: jobs.map(text => line(text, "SpeedJob")),
    titles: [...titles].sort().map(text => line(text, "SpeedTitle")),
  };
  fs.writeFileSync(path.join(ROOT, "public/data/speed-names.json"), `${JSON.stringify(out)}\n`);
});
