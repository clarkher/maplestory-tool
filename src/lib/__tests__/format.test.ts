import { describe, expect, it } from "vitest";
import { levelRange } from "@/lib/format";

describe("等級範圍文字", () => {
  it("頭尾同一級只寫一個等級，不寫成 Lv.30–30", () => {
    expect(levelRange(30, 30)).toBe("Lv.30");
    expect(levelRange(21, 30)).toBe("Lv.21–30");
  });
});
