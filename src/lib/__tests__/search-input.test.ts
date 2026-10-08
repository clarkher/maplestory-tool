import { describe, expect, it } from "vitest";
import { closesKeyboard } from "@/lib/search-input";

const enter = { key: "Enter", isComposing: false, keyCode: 13 };

describe("搜尋框按 Enter：手機、平板收起鍵盤（結果邊打邊出來，按 Enter 就是打完了）", () => {
  it("手指操作的裝置按 Enter：收起鍵盤", () => {
    expect(closesKeyboard(enter, true)).toBe(true);
  });

  it("注音、拼音還在選字時按 Enter 是確定選字：不收", () => {
    expect(closesKeyboard({ ...enter, isComposing: true }, true)).toBe(false);
    // 有的瀏覽器選字時 keyCode 是 229、isComposing 卻沒標
    expect(closesKeyboard({ ...enter, keyCode: 229 }, true)).toBe(false);
  });

  it("電腦（滑鼠、觸控板）按 Enter：不動，焦點留在搜尋框，可以接著打", () => {
    expect(closesKeyboard(enter, false)).toBe(false);
  });

  it("其他按鍵：不動", () => {
    expect(closesKeyboard({ key: "a", isComposing: false, keyCode: 65 }, true)).toBe(false);
    expect(closesKeyboard({ key: "Escape", isComposing: false, keyCode: 27 }, true)).toBe(false);
  });
});
