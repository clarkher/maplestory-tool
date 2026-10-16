// src/lib/speed/__tests__/read-frame.test.ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseNames } from "../names";
import { readFrame } from "../read-frame";
import { loadFixture } from "./fixture";

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
