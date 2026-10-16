// src/lib/speed/__tests__/read-frame.test.ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseNames } from "../names";
import { readFrame } from "../read-frame";
import { findStatusBar } from "../status-bar";
import { loadFixture, paintExpLine, scaleFrame } from "./fixture";

const init = {
  toNext: JSON.parse(fs.readFileSync("public/data/guides/common.json", "utf8")).expTable.toNext as number[],
  names: parseNames(JSON.parse(fs.readFileSync("public/data/speed-names.json", "utf8"))),
};

describe("一張畫面全部讀完", () => {
  it("基準截圖：46 等、406947 經驗、冰雷巫師、有小地圖標題", async () => {
    const reading = readFrame(await loadFixture("window-1364.png"), init, []);
    expect(reading.bar).toBe(true);
    expect(reading.exp).toMatchObject({ exp: 406947, level: 46 });
    expect(reading.job).toBe(220);
    expect(reading.title).not.toBeNull();
  });

  it("不讀組隊：回傳裡沒有 party（組隊人數由玩家自己填）", async () => {
    const reading = readFrame(await loadFixture("window-1364.png"), init, []);
    expect(Object.keys(reading).sort()).toEqual(["bar", "exp", "job", "title"]);
  });

  // 2026-10-17「經驗值估算啥都抓不到」：經驗有 1、3、5、8 就認錯、對不上經驗表。用遊戲的點陣字畫上各等級的經驗，從頭讀到等級
  const CASES: Array<[number, number]> = [
    [21, 15812],
    [35, 128513],
    [44, 333333],
    [52, 581250],
    [60, 888888],
    [68, 1258312],
    [85, 3851208],
  ];
  /** 遊戲的點陣字把 EXP 那串換成 level 等、經驗 exp 的樣子（百分比照遊戲小數兩位、無條件捨去） */
  async function painted(level: number, exp: number, scale: number) {
    const percent = Math.floor((exp / init.toNext[level]) * 10000) / 100;
    const base = await loadFixture("window-1364.png");
    return { percent, frame: scaleFrame(paintExpLine(base, findStatusBar(base)!, `${exp}[${percent.toFixed(2)}%]`), scale) };
  }

  // 原尺寸跟 Windows 常見的放大（125%、150%、175%、200%），加幾個中間值
  it.each([1, 1.2, 1.25, 1.33, 1.5, 1.6, 1.75, 2, 2.5].flatMap(scale => CASES.map(([level, exp]) => [scale, level, exp] as const)))(
    "縮放 %s 倍：%s 等、經驗 %s 讀得出經驗跟等級",
    async (scale, level, exp) => {
      const { percent, frame } = await painted(level, exp, scale);
      expect(readFrame(frame, init, []).exp).toEqual({ exp, percent, level });
    },
  );

  // 讀不好的縮放：比原尺寸大一點點（1.05）字跟字中間 1 格的空隙被抹成半亮、黏成一塊；1.1、1.15 倍 % 的細斜線常被認成數字、
  // 小數點偶爾黏到前一個字；比原尺寸小（0.9）字太小。這些讀不到沒關係（頁面會請玩家把視窗放大），但絕不能讀錯：不是 null 就是對的
  it.each([0.9, 1.05, 1.1, 1.15].flatMap(scale => CASES.map(([level, exp]) => [scale, level, exp] as const)))(
    "縮放 %s 倍：%s 等、經驗 %s 讀不到可以，讀錯不行",
    async (scale, level, exp) => {
      const { percent, frame } = await painted(level, exp, scale);
      const reading = readFrame(frame, init, []).exp;
      if (reading) expect(reading).toEqual({ exp, percent, level });
    },
  );

  it("不是遊戲畫面：什麼都沒有", () => {
    const frame = { width: 640, height: 360, data: new Uint8ClampedArray(640 * 360 * 4).fill(255) };
    expect(readFrame(frame, init, [])).toEqual({ bar: false, exp: null, job: null, title: null });
  });

  it("一張 1364×799 讀完要在 150ms 內（每秒讀一張，不能吃電腦）", async () => {
    const frame = await loadFixture("window-1364.png");
    readFrame(frame, init, []);
    const start = performance.now();
    readFrame(frame, init, [46, 47]);
    expect(performance.now() - start).toBeLessThan(150);
  });
});
