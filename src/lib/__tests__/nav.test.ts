import { describe, expect, it } from "vitest";
import { NAV, activeNav } from "@/lib/nav";

describe("導覽列哪一顆亮", () => {
  it("首頁亮「我的路線」", () => {
    expect(activeNav("/")).toBe("我的路線");
  });

  it("攻略（v1.86 使用者照推薦）：專區、1–30 懶人包、分等級攻略文、職業頁、活動攻略都亮「攻略」", () => {
    for (const path of ["/guides", "/guide", "/guides/priest-31-50", "/jobs/230", "/event/halloween"]) expect(activeNav(path), path).toBe("攻略");
  });

  it("地圖導航（v1.86 帶我去改名）、查資料（含舊工具頁）", () => {
    expect(activeNav("/go")).toBe("地圖導航");
    expect(activeNav("/db/quests")).toBe("查資料");
    expect(activeNav("/plan/train")).toBe("查資料");
    expect(activeNav("/privacy")).toBeUndefined();
  });

  it("野王計時收進查資料（v1.86）：導覽列沒有這顆，/plan/boss 亮查資料", () => {
    expect(NAV.some(item => item.label === "野王計時")).toBe(false);
    expect(activeNav("/plan/boss")).toBe("查資料");
  });

  it("萬聖節收進攻略專區（v1.86）：導覽列沒有這顆", () => {
    expect(NAV.some(item => item.href.startsWith("/event"))).toBe(false);
  });

  it("電腦版順序：攻略排我的路線後面，地圖導航、查資料在最後", () => {
    expect(NAV.map(item => item.label)).toEqual(["我的路線", "攻略", "算傷害", "練功測速", "楓幣匯率", "未來視", "地圖導航", "查資料"]);
    expect(NAV.find(item => item.label === "攻略")?.href).toBe("/guides");
    expect(NAV.find(item => item.label === "地圖導航")?.href).toBe("/go");
  });

  it("算傷害、練功測速、楓幣匯率、未來視照舊只在電腦版，在自己那頁亮自己", () => {
    expect(NAV.filter(item => item.desktopOnly).map(item => item.label)).toEqual(["算傷害", "練功測速", "楓幣匯率", "未來視"]);
    expect(activeNav("/plan/damage")).toBe("算傷害");
    expect(activeNav("/plan/speed")).toBe("練功測速");
    expect(activeNav("/price/fx")).toBe("楓幣匯率");
    expect(activeNav("/future")).toBe("未來視");
    expect(activeNav("/plan/farm")).toBe("查資料");
  });

  it("手機四顆：我的路線、攻略、地圖導航、查資料", () => {
    expect(NAV.filter(item => !item.desktopOnly).map(item => item.label)).toEqual(["我的路線", "攻略", "地圖導航", "查資料"]);
  });

  it("改版紀錄 /updates 開頭亮「攻略」（v1.94）", () => {
    expect(activeNav("/updates")).toBe("攻略");
    expect(activeNav("/updates/2.0.0")).toBe("攻略");
  });
});
