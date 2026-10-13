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
    expect(NAV.map(item => item.label)).toEqual(["我的路線", "算傷害", "練功測速", "帶我去", "查資料"]);
    expect(NAV[1].href).toBe("/plan/damage");
    expect(activeNav("/plan/damage")).toBe("算傷害");
    expect(activeNav("/plan/farm")).toBe("查資料");
  });

  it("練功測速（v0.95）在測速頁亮它、不亮查資料；只在電腦版出現", () => {
    expect(activeNav("/plan/speed")).toBe("練功測速");
    expect(NAV.find(item => item.label === "練功測速")).toMatchObject({ href: "/plan/speed", desktopOnly: true });
    expect(NAV.filter(item => item.desktopOnly).map(item => item.label)).toEqual(["練功測速"]);
  });
});
