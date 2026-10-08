import { describe, expect, it } from "vitest";
import { goLabel } from "@/lib/go-label";

describe("「帶我去」按鈕給讀螢幕軟體念的完整說法：一整排按鈕才分得出是去哪", () => {
  it("「路線」：到哪裡的路線", () => {
    expect(goLabel("路線", "大木林Ⅱ")).toBe("到大木林Ⅱ的路線");
  });

  it("「帶我去」開頭的：地點接在帶我去後面", () => {
    expect(goLabel("帶我去", "弓箭手村")).toBe("帶我去弓箭手村");
    expect(goLabel("帶我去接", "弓箭手村")).toBe("帶我去弓箭手村接");
    expect(goLabel("帶我去轉職", "魔法森林")).toBe("帶我去魔法森林轉職");
  });

  it("「去」：去哪裡", () => {
    expect(goLabel("去", "天空之城")).toBe("去天空之城");
  });

  it("其他寫法：按鈕上的字加地點", () => {
    expect(goLabel("看地圖", "天空之城")).toBe("看地圖：天空之城");
  });
});
