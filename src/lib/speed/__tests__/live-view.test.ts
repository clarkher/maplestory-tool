// src/lib/speed/__tests__/live-view.test.ts
import { describe, expect, it } from "vitest";
import { parseMeso, potionLine, potionName, segmentLine, signedText } from "../live-view";

const names = new Map<number, { n: string }>([
  [2000003, { n: "藍色藥水" }],
  [2000017, { n: "藍色濃縮藥水" }],
  [2000002, { n: "白色藥水" }],
  [2022060, { n: "香水" }],
  [2022061, { n: "香水" }],
  [2000001, { n: "橘色藥水" }],
  [2000000, { n: "紅色藥水" }],
]);

describe("potionName", () => {
  it("一個編號：那個名字", () => {
    expect(potionName([2000002], names)).toBe("白色藥水");
  });
  it("好幾個編號同一個名字：那個名字", () => {
    expect(potionName([2022060, 2022061], names)).toBe("香水");
  });
  it("2～3 個不同名字：「A 或 B」", () => {
    expect(potionName([2000003, 2000017], names)).toBe("藍色藥水或藍色濃縮藥水");
    expect(potionName([2000000, 2000001, 2000002], names)).toBe("紅色藥水或橘色藥水或白色藥水");
  });
  it("超過 3 個不同名字、或查不到名字：「這一格的道具」", () => {
    expect(potionName([2000000, 2000001, 2000002, 2000003], names)).toBe("這一格的道具");
    expect(potionName([9999999], names)).toBe("這一格的道具");
  });
});

describe("potionLine", () => {
  it("有價格：瓶數＋約多少楓幣", () => {
    expect(potionLine("藍色藥水", { per10: 12, meso10: 2400 })).toBe("藍色藥水：每 10 分鐘 12 瓶（約 2,400 楓幣）");
  });
  it("沒有價格：只寫瓶數", () => {
    expect(potionLine("礦泉水", { per10: 3.04, meso10: null })).toBe("礦泉水：每 10 分鐘 3 瓶");
  });
  it("不到 10 瓶留一位小數（.0 不寫）", () => {
    expect(potionLine("白色藥水", { per10: 2.46, meso10: 787.2 })).toBe("白色藥水：每 10 分鐘 2.5 瓶（約 787 楓幣）");
    expect(potionLine("白色藥水", { per10: 12.6, meso10: null })).toBe("白色藥水：每 10 分鐘 13 瓶");
  });
});

describe("parseMeso", () => {
  it("收數字跟逗號、空白", () => {
    expect(parseMeso("1,234,567")).toBe(1234567);
    expect(parseMeso(" 98 765 ")).toBe(98765);
    expect(parseMeso("0")).toBe(0);
  });
  it("空的、有別的字、太長 → null", () => {
    expect(parseMeso("")).toBeNull();
    expect(parseMeso("12a")).toBeNull();
    expect(parseMeso("-5")).toBeNull();
    expect(parseMeso("12345678901")).toBeNull();
  });
});

describe("signedText", () => {
  it("正數加 +、負數用減號、四捨五入", () => {
    expect(signedText(38200.4)).toBe("+38,200");
    expect(signedText(-3360)).toBe("−3,360");
    expect(signedText(0)).toBe("0");
  });
});

describe("segmentLine", () => {
  it("這段練了多久、拿到多少", () => {
    expect(segmentLine("12 分", 123456)).toBe("這段練了 12 分 · 拿到 123,456");
  });
});
