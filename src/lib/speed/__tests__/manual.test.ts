// src/lib/speed/__tests__/manual.test.ts
import { describe, expect, it } from "vitest";
import { expFromPercent, gainedBetween, manualResult, parseManualRow, parseMinutes, readManual, writeManual } from "../manual";

// toNext[等級]＝這一級升到下一級要的經驗；0 級不用
const toNext = [0, 15, 34, 57, 92, 135];

describe("手動輸入：等級、經驗防呆", () => {
  it("等級要在表裡、經驗要小於這一級要的", () => {
    expect(parseManualRow({ level: "3", exp: "40" }, toNext)).toEqual({ ok: true, row: { level: 3, exp: 40 } });
    expect(parseManualRow({ level: "0", exp: "1" }, toNext)).toEqual({ ok: false, field: "level", error: "等級要填 1～5" });
    expect(parseManualRow({ level: "6", exp: "1" }, toNext)).toEqual({ ok: false, field: "level", error: "等級要填 1～5" });
    expect(parseManualRow({ level: "2.5", exp: "1" }, toNext)).toEqual({ ok: false, field: "level", error: "等級要填 1～5" });
    expect(parseManualRow({ level: "3", exp: "57" }, toNext)).toEqual({ ok: false, field: "exp", error: "Lv.3 經驗最多 56" });
  });

  it("經驗可以打逗號、空白、全形數字；不是數字不收", () => {
    expect(parseManualRow({ level: "5", exp: "1,3 4" }, toNext)).toEqual({ ok: true, row: { level: 5, exp: 134 } });
    expect(parseManualRow({ level: "５", exp: "１２" }, toNext)).toEqual({ ok: true, row: { level: 5, exp: 12 } });
    expect(parseManualRow({ level: "5", exp: "12%" }, toNext)).toEqual({ ok: false, field: "exp", error: "經驗只能填數字" });
    expect(parseManualRow({ level: "5", exp: "" }, toNext)).toEqual({ ok: false, field: "exp", error: "經驗要填" });
    expect(parseManualRow({ level: "", exp: "1" }, toNext)).toEqual({ ok: false, field: "level", error: "等級要填" });
  });

  it("拉 %：換成經驗，100% 也不會超過這一級（最多要的減 1）", () => {
    expect(expFromPercent(50, 4, toNext)).toBe(46);
    expect(expFromPercent(0, 4, toNext)).toBe(0);
    expect(expFromPercent(100, 4, toNext)).toBe(91);
    expect(expFromPercent(-3, 4, toNext)).toBe(0);
    expect(expFromPercent(50, 99, toNext)).toBeNull();
  });

  it("練了幾分鐘：1～1440 的整數", () => {
    expect(parseMinutes("12")).toEqual({ ok: true, minutes: 12 });
    expect(parseMinutes("0")).toEqual({ ok: false, error: "分鐘要填 1～1440" });
    expect(parseMinutes("1441")).toEqual({ ok: false, error: "分鐘要填 1～1440" });
    expect(parseMinutes("")).toEqual({ ok: false, error: "分鐘要填 1～1440" });
  });
});

describe("手動輸入：拿到多少、10 分鐘經驗", () => {
  it("同一級：相減；跨級：這級剩的＋中間整級＋新一級", () => {
    expect(gainedBetween({ level: 3, exp: 10 }, { level: 3, exp: 50 }, toNext)).toBe(40);
    // 3 級剩 57-10=47，4 級整級 92，5 級拿了 20
    expect(gainedBetween({ level: 3, exp: 10 }, { level: 5, exp: 20 }, toNext)).toBe(47 + 92 + 20);
  });

  it("現在比開始還少：null（填反了）", () => {
    expect(gainedBetween({ level: 3, exp: 50 }, { level: 3, exp: 10 }, toNext)).toBeNull();
    expect(gainedBetween({ level: 4, exp: 0 }, { level: 3, exp: 50 }, toNext)).toBeNull();
  });

  it("10 分鐘經驗、升級還要幾分鐘", () => {
    const result = manualResult({ level: 4, exp: 10 }, { level: 4, exp: 40 }, 5, toNext);
    expect(result).toEqual({ ok: true, gained: 30, per10: 60, etaMinutes: ((92 - 40) / 60) * 10 });
  });

  it("沒拿到經驗、填反了：說原因", () => {
    expect(manualResult({ level: 4, exp: 10 }, { level: 4, exp: 10 }, 5, toNext)).toEqual({ ok: false, error: "現在的經驗跟開始一樣，還沒拿到經驗" });
    expect(manualResult({ level: 4, exp: 40 }, { level: 4, exp: 10 }, 5, toNext)).toEqual({ ok: false, error: "現在比開始還少，開始跟現在是不是填反了？" });
  });
});

describe("手動輸入存在這台電腦", () => {
  const memory = () => {
    const map = new Map<string, string>();
    return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) };
  };

  it("寫進去讀得回來；壞掉的、舊格式的當沒填", () => {
    const store = memory();
    const state = { start: { level: "4", exp: "10", at: 1000 }, now: { level: "4", exp: "40", at: 61000 }, minutes: "" };
    writeManual(store, state);
    expect(readManual(store)).toEqual(state);
    store.setItem("ms-speed-manual", "{壞掉");
    expect(readManual(store)).toBeNull();
    store.setItem("ms-speed-manual", JSON.stringify({ start: 3 }));
    expect(readManual(store)).toBeNull();
  });
});
