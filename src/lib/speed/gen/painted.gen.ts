// src/lib/speed/gen/painted.gen.ts
/**
 * 驗收用的假畫面：把基準截圖 EXP 那串換成指定等級的經驗（用遊戲的點陣字畫，跟測試的 paintExpLine 同一套），存成 PNG，
 * 給 scripts/verify/speed-shot.mjs 當分享畫面（基準截圖的經驗剛好沒有 1、2、5、8，測不出 2026-10-17 那種認錯）。
 * 用法（Git Bash）：SPEED_EXP=46:251836 npx vitest run -c vitest.gen.config.ts painted
 * 等級用 46：speed-shot 的組隊檢查照 46 等寫（隊友 44 等要在 5 級內才吸得到經驗），換別的等級那幾項會照公式變「吸不到」。
 * 輸出：%TEMP%/speed-painted-46-251836.png，並印出頁面上應該讀到的那一行；接著
 *   SPEED_FIXTURE="$TEMP/speed-painted-46-251836.png" SPEED_READING="<印出來的那行>" node scripts/verify/speed-shot.mjs
 * 沒給 SPEED_EXP 就跳過（npm run speed:glyphs 也會跑到這支）。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { it } from "vitest";
import { findStatusBar } from "../status-bar";
import { loadFixture, paintExpLine } from "../__tests__/fixture";

const spec = process.env.SPEED_EXP;

it.skipIf(!spec)("產驗收用的假畫面", async () => {
  const [level, exp] = spec!.split(":").map(Number);
  const toNext: number[] = JSON.parse(fs.readFileSync("public/data/guides/common.json", "utf8")).expTable.toNext;
  if (!(exp < toNext[level])) throw new Error(`${level} 等升級只要 ${toNext[level]}，經驗 ${exp} 不合理`);
  // 畫面上的 % 是小數兩位、無條件捨去；頁面上的 % 是經驗 ÷ 經驗表算的（四捨五入兩位）
  const shown = Math.floor((exp / toNext[level]) * 10000) / 100;
  const base = await loadFixture("window-1364.png");
  const frame = paintExpLine(base, findStatusBar(base)!, `${exp}[${shown.toFixed(2)}%]`);
  const canvas = createCanvas(frame.width, frame.height);
  const context = canvas.getContext("2d");
  const image = context.createImageData(frame.width, frame.height);
  image.data.set(frame.data);
  context.putImageData(image, 0, 0);
  const out = path.join(os.tmpdir(), `speed-painted-${level}-${exp}.png`);
  fs.writeFileSync(out, canvas.toBuffer("image/png"));
  console.log(`已存：${out}`);
  console.log(`SPEED_READING=Lv.${level} · 經驗 ${exp.toLocaleString("en-US")}（${((exp / toNext[level]) * 100).toFixed(2)}%）`);
});
