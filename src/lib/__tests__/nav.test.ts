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
    expect(NAV.map(item => item.label)).toEqual(["我的路線", "帶我去", "查資料"]);
  });
});
