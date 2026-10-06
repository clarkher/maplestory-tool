import { describe, expect, it } from "vitest";
import { statSpansTwo } from "@/lib/stat-layout";

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
