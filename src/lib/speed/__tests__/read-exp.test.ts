// src/lib/speed/__tests__/read-exp.test.ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { findStatusBar } from "../status-bar";
import { parseExp, readExpText } from "../read-exp";
import { loadFixture, paintExpLine, scaleFrame } from "./fixture";

const toNext: number[] = JSON.parse(fs.readFileSync("public/data/guides/common.json", "utf8")).expTable.toNext;

describe("找狀態列", () => {
  it("基準截圖：HP、MP、EXP 三條，EXP 條 809～976、高 18", async () => {
    const bar = findStatusBar(await loadFixture("window-1364.png"))!;
    expect(bar.exp[0]).toBeGreaterThanOrEqual(807);
    expect(bar.exp[0]).toBeLessThanOrEqual(811);
    expect(bar.exp[1]).toBeGreaterThanOrEqual(974);
    expect(bar.exp[1]).toBeLessThanOrEqual(978);
    expect(bar.bottom - bar.top).toBe(18);
    expect(bar.scale).toBeCloseTo(1, 1);
    expect(bar.hp[0]).toBeLessThan(bar.mp[0]);
  });

  it.each([1.25, 1.5, 2])("放大 %s 倍也找得到，scale 跟著變（誤差 5% 內）", async scale => {
    const bar = findStatusBar(await loadFixture("window-1364.png", scale))!;
    expect(bar).not.toBeNull();
    expect(Math.abs(bar.scale / scale - 1)).toBeLessThan(0.05);
  });

  // 視窗大小隨便拉都要認得到：0.90～2.00 每 0.05 一格，外加以前會認不到的幾格
  // （HP、MP 中間那條只有 1px 的縫，縮放後亮起來，兩條會黏成一段）
  const SWEEP = [
    ...Array.from({ length: 23 }, (_, i) => Math.round((0.9 + i * 0.05) * 100) / 100),
    0.99, 1.01, 1.02, 1.08, 1.11,
  ];
  it.each(SWEEP)("縮放 %s 倍：找得到三條，scale 誤差 5% 內，三條寬度一致、由左到右", async scale => {
    const bar = findStatusBar(await loadFixture("window-1364.png", scale));
    expect(bar).not.toBeNull();
    expect(Math.abs(bar!.scale / scale - 1)).toBeLessThan(0.05);
    const [hp, mp, exp] = [bar!.hp, bar!.mp, bar!.exp].map(([a, b]) => b - a);
    expect(Math.max(hp, mp, exp)).toBeLessThanOrEqual(Math.min(hp, mp, exp) * 1.1);
    expect(bar!.hp[1]).toBeLessThanOrEqual(bar!.mp[0]);
    expect(bar!.mp[1]).toBeLessThan(bar!.exp[0]);
  });

  it("全黑畫面找不到", () => {
    const frame = { width: 400, height: 300, data: new Uint8ClampedArray(400 * 300 * 4) };
    expect(findStatusBar(frame)).toBeNull();
  });
});

const lastGroup = (text: string) => text.trim().split(/\s+/).pop()!;
/** 「HP」「MP」字樣跟後面的 [ 只隔 6 格，放大後偶爾不插空白、黏在同一組（字樣也會被認成 [ 之類的）：從最後一個 [ 開始比 */
const fromBracket = (text: string) => lastGroup(text).slice(Math.max(0, lastGroup(text).lastIndexOf("[")));
/**
 * 讀得到的縮放：原尺寸、1.2～2.5 倍（樣板模擬的是 1、1.1、1.2…2 倍；夾幾個沒模擬的 1.45、1.8、2.5，確認不是只認得樣板那幾格）。
 * 1.1、1.15 倍數字都認得對，但 % 的細斜線常被認成數字，還不知道等級時那張就不算（parseExp），所以不放進「讀得出經驗」這組。
 */
const SCALES = [1, 1.2, 1.25, 1.33, 1.45, 1.5, 1.6, 1.75, 1.8, 2, 2.5];
/** 數字本身要認對的縮放：再加上 1.1、1.15 */
const DIGIT_SCALES = [1, 1.1, 1.15, ...SCALES.slice(1)];

describe("讀 EXP 那行", () => {
  it.each([1, 1.25, 1.5, 2])("放大 %s 倍：最後一組的數字開頭是 406947", async scale => {
    const frame = await loadFixture("window-1364.png", scale);
    const text = readExpText(frame, findStatusBar(frame)!);
    const last = text.trim().split(/\s+/).pop()!;
    expect(last.replace(/\D/g, "").startsWith("406947")).toBe(true);
  });

  // 2026-10-17 使用者回報「經驗值估算啥都抓不到」：樣板是微軟正黑體，遊戲是自己的點陣字，1 被認成 ]、3 跟 5 被認成 8。
  // 基準截圖的經驗剛好只有 0 3 4 6 7 9，所以之前的測試都過。HP、MP 兩行是同一套字，拿來補驗 1、2、5（小數點太小，認的時候就拿掉了）。
  it.each(SCALES)("縮放 %s 倍：HP、MP 兩行的字全部認對，EXP 那行讀得出經驗跟等級", async scale => {
    const frame = await loadFixture("window-1364.png", scale);
    const bar = findStatusBar(frame)!;
    expect(fromBracket(readExpText(frame, { ...bar, exp: bar.hp }))).toBe("[1146/1296]");
    expect(fromBracket(readExpText(frame, { ...bar, exp: bar.mp }))).toBe("[2343/2950]");
    expect(parseExp(readExpText(frame, bar), toNext)).toEqual({ exp: 406947, percent: 79.73, level: 46 });
  });

  it("原尺寸：EXP 那行一個字不差（括號、% 都在）", async () => {
    const frame = await loadFixture("window-1364.png");
    expect(lastGroup(readExpText(frame, findStatusBar(frame)!))).toBe("406947[7973%]");
  });

  // 截圖上沒有 8：用遊戲的點陣字把 EXP 那串換掉再讀（每個數字都至少出現一次）。
  // 每個縮放，讀出來的數字開頭都要是經驗那幾位、一個不差；括號偶爾淡到漏掉沒關係（那張讀不到、丟掉，見 read-frame 的「讀錯不行」）。原尺寸整串不差
  const LINES: Array<[string, string]> = [
    ["123458[85.21%]", "123458[8521%]"],
    ["8[0.18%]", "8[018%]"],
    ["5812[35.81%]", "5812[3581%]"],
    ["2085563[96.53%]", "2085563[9653%]"],
    ["777001[69.40%]", "777001[6940%]"],
  ];
  it.each(DIGIT_SCALES.flatMap(scale => LINES.map(([text, read]) => [scale, text, read] as const)))(
    "縮放 %s 倍：畫上去的 %s，經驗那幾位全部認對",
    async (scale, text, read) => {
      const base = await loadFixture("window-1364.png");
      const frame = scaleFrame(paintExpLine(base, findStatusBar(base)!, text), scale);
      const group = lastGroup(readExpText(frame, findStatusBar(frame)!));
      const expDigits = read.slice(0, read.indexOf("["));
      expect(group.replace(/\D/g, "").slice(0, expDigits.length)).toBe(expDigits);
      if (group.includes("[")) expect(group.slice(0, group.indexOf("["))).toBe(expDigits);
      if (scale === 1) expect(group).toBe(read);
    },
  );
});
