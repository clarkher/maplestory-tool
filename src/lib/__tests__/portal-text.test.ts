import { describe, expect, it } from "vitest";
import { portalDirection, portalSentence } from "@/lib/portal-text";

const spread: Array<[number, number]> = [[-1400, 0], [-700, 0], [0, 0], [700, 0], [1400, 0], [0, -600]];

describe("傳送門方向", () => {
  it("名稱有方向字就照名稱", () => {
    expect(portalDirection("east00", 0, 0, [])).toBe("右邊");
    expect(portalDirection("west00", 0, 0, [])).toBe("左邊");
    expect(portalDirection("under00", 10, 10, spread)).toBe("下面");
    expect(portalDirection("top00", 10, 10, spread)).toBe("上面");
    expect(portalDirection("in01_1", 10, 10, spread)).toBe("建築裡");
  });

  it("名稱看不出來時，用它在這張圖所有傳送門裡的位置判斷", () => {
    expect(portalDirection("sub00", -1300, 0, spread)).toBe("左邊");
    expect(portalDirection("sub00", 1300, 0, spread)).toBe("右邊");
    expect(portalDirection("mid00", 0, -600, spread)).toBe("上面");
    expect(portalDirection("mid00", 100, 0, spread)).toBe("中間");
  });

  it("座標不明或這張圖傳送門太少就不猜", () => {
    expect(portalDirection("sub00", 0, 0, spread)).toBeNull();
    expect(portalDirection("sub00", 500, 0, [[500, 0]])).toBeNull();
  });
});

describe("傳送門句子", () => {
  it("組成給玩家看的一句話，不露出代碼", () => {
    expect(portalSentence("左邊")).toBe("從上一張圖左邊的傳送門進來");
    expect(portalSentence("建築裡")).toBe("從上一張圖走進建築");
    expect(portalSentence(null)).toBe("從上一張圖的傳送門進來");
  });
});
