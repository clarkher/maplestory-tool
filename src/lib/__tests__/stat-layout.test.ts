import { describe, expect, it } from "vitest";
import { statSpans, statSpansTwo } from "@/lib/stat-layout";

describe("數值格子太長就佔兩欄", () => {
  it("三個職業、上衣＋褲裙（佔兩格）、五個職業全列在一欄裡會斷行，佔兩欄", () => {
    expect(statSpansTwo("劍士、弓箭手、盜賊")).toBe(true);
    expect(statSpansTwo("上衣＋褲裙（佔兩格）")).toBe(true);
    expect(statSpansTwo("劍士、法師、弓箭手、盜賊、海盜")).toBe(true);
  });

  it("剛好 7 個中文字放得下，第 8 個就要佔兩欄", () => {
    expect(statSpansTwo("一二三四五六七")).toBe(false);
    expect(statSpansTwo("一二三四五六七八")).toBe(true);
  });

  it("短的維持一欄：雙手，不能配盾、劍士、弓箭手、比較慢（9）", () => {
    expect(statSpansTwo("雙手，不能配盾")).toBe(false);
    expect(statSpansTwo("劍士、弓箭手")).toBe(false);
    expect(statSpansTwo("比較慢（9）")).toBe(false);
  });

  it("數字比中文窄：七位數照樣一欄，十幾位數才佔兩欄", () => {
    expect(statSpansTwo(1234567)).toBe(false);
    expect(statSpansTwo("1,234,567")).toBe(false);
    expect(statSpansTwo("1,234,567,890,123")).toBe(true);
  });
});

describe("手機兩欄：格子加起來是奇數時，最後一個單格拉滿整排", () => {
  it("三格（需求等級、需求職業、需求力量）：最後一格拉滿，不會空一格", () => {
    expect(statSpans(["90", "劍士", "280"])).toEqual(["one", "one", "fill"]);
  });

  it("剛好排滿就不動：兩格、四格", () => {
    expect(statSpans(["90", "劍士"])).toEqual(["one", "one"]);
    expect(statSpans(["1", "2", "3", "4"])).toEqual(["one", "one", "one", "one"]);
  });

  it("有佔兩欄的長值時照格子總數算，拉滿的是最後一個單格", () => {
    expect(statSpans(["劍士、弓箭手、盜賊", "90"])).toEqual(["two", "fill"]);
    expect(statSpans(["90", "劍士、弓箭手、盜賊", "280"])).toEqual(["one", "two", "one"]);
    expect(statSpans(["90", "劍士、弓箭手、盜賊", "上衣＋褲裙（佔兩格）"])).toEqual(["fill", "two", "two"]);
  });

  it("沒有格子就是空的", () => {
    expect(statSpans([])).toEqual([]);
  });
});
