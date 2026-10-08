import { describe, expect, it } from "vitest";
import { goLabel, npcPlace } from "@/lib/go-label";

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

describe("任務卡 NPC 的「路線」要念到哪裡：念 NPC 的名字（地圖還沒開放時，念地圖名每一顆都一樣）", () => {
  it("有名字：〇〇那裡", () => {
    expect(npcPlace("阿里可", "未開放地圖")).toBe("阿里可那裡");
    expect(npcPlace("NPC 9010017", "弓箭手村")).toBe("NPC 9010017那裡");
  });

  it("名字是空的、沒有、或壞掉沒有任何文字（資料裡有「???? ?」）：念地圖名", () => {
    expect(npcPlace("", "東方岩石山Ⅲ")).toBe("東方岩石山Ⅲ");
    expect(npcPlace(undefined, "東方岩石山Ⅲ")).toBe("東方岩石山Ⅲ");
    expect(npcPlace("???? ?", "東方岩石山Ⅲ")).toBe("東方岩石山Ⅲ");
  });
});
