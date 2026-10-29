import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SHARE_COLORS, shareLines, type ShareCard } from "../share-image";

const base: ShareCard = {
  title: "冰雷巫師 Lv.46・森林迷宮Ⅲ",
  exp10: 52800,
  second: { label: "每 10 分鐘淨賺", value: "34840" },
  eta: "1 小時 12 分",
  monsterSrc: null,
  date: "2026/10/29",
};

describe("shareLines", () => {
  it("標題接上日期、經驗加千分位", () => {
    const l = shareLines(base);
    expect(l.heading).toBe("冰雷巫師 Lv.46・森林迷宮Ⅲ・2026/10/29");
    expect(l.big).toBe("52,800");
  });
  it("每 10 分鐘淨賺加千分位與正號，下面第二格是升級還要", () => {
    expect(shareLines(base).bottom).toEqual([
      ["每 10 分鐘淨賺", "+34,840"],
      ["升級還要", "1 小時 12 分"],
    ]);
  });
  it("淨賺為負用減號", () => {
    const l = shareLines({ ...base, second: { label: "每 10 分鐘淨賺", value: "-1200" } });
    expect(l.bottom[0]).toEqual(["每 10 分鐘淨賺", "−1,200"]);
  });
  it("沒有淨賺時換成「這段拿到」，值照千分位但不加正號", () => {
    const l = shareLines({ ...base, second: { label: "這段拿到", value: "5280000" } });
    expect(l.bottom[0]).toEqual(["這段拿到", "5,280,000"]);
  });
  it("非純數字的值原樣放", () => {
    const l = shareLines({ ...base, second: { label: "這段拿到", value: "12,345 經驗" } });
    expect(l.bottom[0][1]).toBe("12,345 經驗");
  });
});

describe("shareLines 防呆", () => {
  it("經驗是 NaN 或負數顯示「—」", () => {
    expect(shareLines({ ...base, exp10: NaN }).big).toBe("—");
    expect(shareLines({ ...base, exp10: -5 }).big).toBe("—");
  });
});

describe("SHARE_COLORS", () => {
  it("跟 globals.css 白天（:root 第一段）的顏色一樣，不跟深色主題", () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const light = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
    const token = (name: string) => light.match(new RegExp(`${name}:[ \\t]*(#[0-9a-f]{6})`, "i"))?.[1];
    expect(SHARE_COLORS).toEqual({
      paper: token("--paper"),
      paperDeep: token("--paper-deep"),
      ink: token("--ink"),
      maple: token("--maple"),
      edge: token("--paper-edge"),
    });
  });
});
