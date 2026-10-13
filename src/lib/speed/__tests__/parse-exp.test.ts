import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { findStatusBar } from "../status-bar";
import { levelFor, parseExp, readExpText } from "../read-exp";
import { loadFixture } from "./fixture";

const toNext: number[] = JSON.parse(fs.readFileSync("public/data/guides/common.json", "utf8")).expTable.toNext;

describe("經驗＋% 反推等級", () => {
  it("406947、79.73% 只對得上 46 等（升級要 510,420）", () => {
    expect(toNext[46]).toBe(510420);
    expect(levelFor(406947, 79.73, toNext, [])).toBe(46);
  });

  it("% 認錯一點（79.78）還在誤差內；認錯很多（70.73）對不上", () => {
    expect(levelFor(406947, 79.78, toNext, [])).toBe(46);
    expect(levelFor(406947, 70.73, toNext, [])).toBeNull();
  });

  it("% 很小時好幾級都對得上：沒有提示就不認，有提示就照提示", () => {
    const exp = Math.round(toNext[30] * 0.0002);
    expect(levelFor(exp, 0.02, toNext, [])).toBeNull();
    expect(levelFor(exp, 0.02, toNext, [30, 31])).toBe(30);
  });

  it("有提示時只認提示裡的等級（避免拆錯位數剛好對到別的等級）", () => {
    expect(levelFor(406947, 79.73, toNext, [47, 48])).toBeNull();
  });
});

describe("parseExp", () => {
  it("有括號照括號切", () => {
    expect(parseExp("%P 406947[7973%]", toNext)).toEqual({ exp: 406947, percent: 79.73, level: 46 });
  });

  it("括號沒認出來：試著把最後 4 或 3 位當 %，用經驗表挑對的", () => {
    expect(parseExp("649 4069477973%", toNext)).toEqual({ exp: 406947, percent: 79.73, level: 46 });
  });

  it("認錯的回 null", () => {
    expect(parseExp("648 406947[7073%", toNext)).toBeNull();
    expect(parseExp("", toNext)).toBeNull();
  });

  it.each([1, 1.25, 1.5, 2])("截圖放大 %s 倍：不是讀對就是 null，絕不讀錯", async scale => {
    const frame = await loadFixture("window-1364.png", scale);
    const reading = parseExp(readExpText(frame, findStatusBar(frame)!), toNext);
    if (reading) expect(reading).toMatchObject({ exp: 406947, level: 46 });
  });

  it("原尺寸要讀得到（使用者實際的視窗）", async () => {
    const frame = await loadFixture("window-1364.png");
    expect(parseExp(readExpText(frame, findStatusBar(frame)!), toNext)).toMatchObject({ exp: 406947, level: 46 });
  });
});
