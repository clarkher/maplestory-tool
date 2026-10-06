import { describe, expect, it } from "vitest";
import { recall, remember } from "@/lib/remember";

describe("查資料頁記住搜尋和篩選（記到關掉分頁為止）", () => {
  it("第一次進來用預設值", () => {
    expect(recall("db:測試:query", "")).toBe("");
    expect(recall("db:測試:visible", 60)).toBe(60);
  });

  it("記過就用記的，每一頁各記各的", () => {
    remember("db:道具:query", "劍");
    remember("db:怪物:query", "嫩寶");
    expect(recall("db:道具:query", "")).toBe("劍");
    expect(recall("db:怪物:query", "")).toBe("嫩寶");
  });

  it("記的是空字串、0、false 也照用，不會被當成沒記", () => {
    remember("db:任務:query", "");
    remember("db:道具:onlyDroppable", false);
    remember("db:技能:visible", 0);
    expect(recall("db:任務:query", "楓葉")).toBe("");
    expect(recall("db:道具:onlyDroppable", true)).toBe(false);
    expect(recall("db:技能:visible", 60)).toBe(0);
  });
});
