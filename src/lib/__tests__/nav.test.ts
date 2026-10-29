import { describe, expect, it } from "vitest";
import { NAV, activeNav } from "@/lib/nav";

describe("導覽列哪一顆亮", () => {
  it("首頁跟 1–30 懶人包（麵包屑寫「我的路線 › 1–30 懶人包」）亮「我的路線」", () => {
    expect(activeNav("/")).toBe("我的路線");
    expect(activeNav("/guide")).toBe("我的路線");
  });

  it("帶我去、查資料（含舊工具頁）照舊", () => {
    expect(activeNav("/go")).toBe("帶我去");
    expect(activeNav("/db/quests")).toBe("查資料");
    expect(activeNav("/plan/train")).toBe("查資料");
    expect(activeNav("/privacy")).toBeUndefined();
  });

  it("傷害計算機拉出來放「我的路線」旁邊（v0.85 使用者選 A「算傷害」），在計算機頁亮它、不亮查資料", () => {
    expect(NAV.map(item => item.label)).toEqual(["我的路線", "算傷害", "練功測速", "楓幣匯率", "野王計時", "帶我去", "查資料"]);
    expect(NAV[1].href).toBe("/plan/damage");
    expect(activeNav("/plan/damage")).toBe("算傷害");
    expect(activeNav("/plan/farm")).toBe("查資料");
  });

  it("野王計時（v1.18）在 /plan/boss 亮它、不亮查資料；所有寬度都有", () => {
    expect(activeNav("/plan/boss")).toBe("野王計時");
    expect(NAV.find(item => item.label === "野王計時")?.desktopOnly).toBeUndefined();
  });

  it("練功測速（v0.95）在測速頁亮它、不亮查資料；只在電腦版出現", () => {
    expect(activeNav("/plan/speed")).toBe("練功測速");
    expect(NAV.find(item => item.label === "練功測速")).toMatchObject({ href: "/plan/speed", desktopOnly: true });
    expect(NAV.filter(item => item.desktopOnly).map(item => item.label)).toEqual(["算傷害", "練功測速", "楓幣匯率"]);
  });

  it("楓幣匯率（v1.03 使用者選 A）拉出來放導覽列、只在電腦版；/price 開頭亮它，手機照舊從查資料的「行情」區進去", () => {
    expect(NAV.find(item => item.label === "楓幣匯率")).toMatchObject({ href: "/price/fx", desktopOnly: true });
    expect(activeNav("/price/fx")).toBe("楓幣匯率");
    expect(activeNav("/db")).toBe("查資料");
  });

  it("手機導覽列（v1.18 使用者選 A）只剩 我的路線、野王計時、帶我去、查資料；算傷害只在電腦版", () => {
    expect(NAV.filter(item => !item.desktopOnly).map(item => item.label)).toEqual(["我的路線", "野王計時", "帶我去", "查資料"]);
    expect(NAV.find(item => item.label === "算傷害")).toMatchObject({ href: "/plan/damage", desktopOnly: true });
  });
});
