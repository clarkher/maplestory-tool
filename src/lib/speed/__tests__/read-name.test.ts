// src/lib/speed/__tests__/read-name.test.ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { findStatusBar } from "../status-bar";
import { nameCharset, parseChars, readName, usableName } from "../read-name";
import { loadFixture } from "./fixture";

const chars = parseChars(JSON.parse(fs.readFileSync("public/data/speed-chars.json", "utf8")));

/** 兩個字串同位置一樣的字數（長度不同算全錯） */
function sameChars(a: string | null, b: string): number {
  const x = Array.from(a ?? "");
  const y = Array.from(b);
  return x.length === y.length ? x.filter((ch, i) => ch === y[i]).length : 0;
}

describe("讀狀態列的角色名", () => {
  it("字集：常用字 5,401 個＋英數 62 個，沒有重複", () => {
    const set = nameCharset();
    expect(set.length).toBe(5401 + 62);
    expect(new Set(set).size).toBe(set.length);
    expect(set).toContain("沙");
    expect(set).toContain("K");
  });

  it("樣板檔跟字集同一套（字集改了要重跑 npm run speed:glyphs）", () => {
    const set = nameCharset().join("");
    expect(chars.chars.join("")).toBe(set + set);
  });

  // 2026-11-11 使用者回報「角色 ID 從來沒有辨識成功過」那天截的新客戶端（2.0.4）
  it.each([1, 1.25, 2])("新客戶端「沙士K」縮放 %s 倍：一字不差", async scale => {
    const frame = await loadFixture("barracks-1366.png", scale);
    expect(readName(frame, findStatusBar(frame)!, chars)).toBe("沙士K");
  });

  it("舊客戶端基準截圖原尺寸「芙莉蓮熊芙莉」：一字不差", async () => {
    const frame = await loadFixture("window-1364.png");
    expect(readName(frame, findStatusBar(frame)!, chars)).toBe("芙莉蓮熊芙莉");
  });

  it.each([1.25, 1.5])("舊客戶端放大 %s 倍：6 個字至少對 5 個（這是先填好給玩家改的）", async scale => {
    const frame = await loadFixture("window-1364.png", scale);
    expect(sameChars(readName(frame, findStatusBar(frame)!, chars), "芙莉蓮熊芙莉")).toBeGreaterThanOrEqual(5);
  });

  it("2～12 個字才帶入", () => {
    expect(usableName("沙士K")).toBe("沙士K");
    expect(usableName("沙")).toBeNull();
    expect(usableName(null)).toBeNull();
    expect(usableName("一二三四五六七八九十一二三")).toBeNull();
  });
});
