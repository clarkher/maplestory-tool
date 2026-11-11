// src/lib/speed/gen/glyphs.gen.ts
/**
 * 產練功測速的字形樣板（本機跑：npm run speed:glyphs，要 Windows 的字型；只重產數字用 -t "產 glyphs.json"，不用字型）。
 * - src/lib/speed/glyphs.json：EXP 那行的字（0–9、[、]、%、/），用遊戲自己的點陣字（status-font.ts，從客戶端抽的）。
 *   2026-10-17 以前是微軟正黑體，跟遊戲的字長得不一樣，1 被認成 ]、3 跟 5 被認成 8，經驗幾乎都讀不出來。
 * - public/data/speed-names.json：職業名（微軟正黑體）、小地圖的街道名跟地圖名（微軟正黑體粗體，照遊戲的畫法畫，見 renderTitle）
 * 只存縮成格子的特徵（每字 8×12、每行高 8 格），不存字型本身。
 * - public/data/speed-chars.json：狀態列角色名的逐字樣板（read-name.ts）：Big5 常用字 5,401 個＋英數，微軟正黑體 12px、13px 各一張。
 *   2026-11-11 拿使用者截圖比過：遊戲客戶端沒帶中文字型，角色名是系統的正黑體，12＋13px 樣板兩張真截圖原尺寸全對。
 * 地圖資料（public/data/maps.json）多了新地圖名就要重跑，不然新圖認不到（頁面會改請玩家點選）。
 */
import fs from "node:fs";
import path from "node:path";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { it } from "vitest";
import type { Frame } from "../frame";
import { bbox, grid, inkMask } from "../ink";
import { JOB_TEXT } from "../read-job";
import { NAME_CELL, nameCharset } from "../read-name";
import { buildStatusTemplates } from "./status-templates";

const JOB_FONT = "C:/Windows/Fonts/msjh.ttc";
/**
 * 小地圖標題的字型：微軟正黑體**粗體**（2026-10-20 拿基準截圖的「迷霧森林／森林迷宮III」比過）。
 * 遊戲的標題是白字＋右下 1 格的深色陰影、字高約 11 格；用粗體 12～14px 畫的樣板，正確的那張都排第一（13px 還能直接自動認），
 * 一般字重每種字級都認錯（森林迷宮IV、海岸草叢Ⅲ…）。2026-10-20 以前用一般字重 48px 的實心字、讀的時候抓深色（抓到的是陰影），真的截圖一張都認不到。
 */
const TITLE_FONT = "C:/Windows/Fonts/msjhbd.ttc";
const TITLE_PX = 13;
/** 小地圖面板的淺藍跟陰影的深色（基準截圖量的） */
const TITLE_PANEL = "rgb(157,186,206)";
const TITLE_SHADOW = "#0a1418";
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

/** 照遊戲的畫法畫一行標題：淺藍面板上先畫往右下偏 1 格的深色陰影，再畫白字（讀的時候抓白字，read-map.ts） */
function renderTitle(text: string, family: string): Frame {
  const px = TITLE_PX;
  const canvas = createCanvas(Math.ceil(px * (Array.from(text).length + 2)), px * 3);
  const context = canvas.getContext("2d");
  context.fillStyle = TITLE_PANEL;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = `${px}px "${family}"`;
  context.textBaseline = "alphabetic";
  context.fillStyle = TITLE_SHADOW;
  context.fillText(text, px / 2 + 1, px * 1.8 + 1);
  context.fillStyle = "#fff";
  context.fillText(text, px / 2, px * 1.8);
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
    const frame = family === "SpeedTitle" ? renderTitle(text, family) : render(text, family, 48);
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

/**
 * 角色名樣板：同一個字畫 12px、13px 兩張（read-name 取比較像的那張）。只用 13px 時新客戶端原尺寸「士」認成「七」、「K」認成「h」，
 * 兩種字級一起比，兩張真截圖原尺寸全對（2026-11-11 試過 13px 錯開 0.5 格、12/13 各錯開兩次，都比較差）。
 */
const NAME_PX = [12, 13];

it("產 speed-chars.json", () => {
  registerFont(JOB_FONT, "SpeedName");
  const chars = nameCharset();
  const aspects: number[] = [];
  let cells = "";
  for (const px of NAME_PX) {
    for (const ch of chars) {
      const frame = render(ch, "SpeedName", px);
      const mask = inkMask(frame, { x: 0, y: 0, w: frame.width, h: frame.height }, false, 0.99)!;
      const box = bbox(mask)!;
      aspects.push(round((box.x1 - box.x0) / (box.y1 - box.y0)));
      cells += hex(grid(mask, box, NAME_CELL, NAME_CELL));
    }
  }
  const out = { font: "Microsoft JhengHei", sizes: NAME_PX, cell: NAME_CELL, chars: chars.join(""), aspects, cells };
  fs.writeFileSync(path.join(ROOT, "public/data/speed-chars.json"), `${JSON.stringify(out)}
`);
});
