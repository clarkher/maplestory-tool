/**
 * 打寶頁網址的 want：從任務、道具頁點「這個去哪打」帶過來的道具。打寶頁第一個畫面就要照它勾好。
 */
import { describe, expect, it } from "vitest";
import { wantedItems } from "@/lib/planner";

describe("打寶頁網址帶過來要勾的道具", () => {
  it("一件或幾件（逗號分隔）照順序勾", () => {
    expect(wantedItems("4000000")).toEqual([4000000]);
    expect(wantedItems("4000000,4000001")).toEqual([4000000, 4000001]);
  });

  it("同一件重複帶：只勾一次（不會顯示「已選 2 樣」）", () => {
    expect(wantedItems("4000000,4000000")).toEqual([4000000]);
  });

  it("沒帶、空的、亂打的：不勾", () => {
    expect(wantedItems(null)).toEqual([]);
    expect(wantedItems("")).toEqual([]);
    expect(wantedItems("abc,,0,-5")).toEqual([]);
    expect(wantedItems("4000000,abc")).toEqual([4000000]);
  });
});
