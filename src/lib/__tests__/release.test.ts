import { describe, expect, it } from "vitest";
import { V002_OPEN_DATE, beforeV002, opensOn } from "@/lib/release";

const BEFORE = Date.parse("2026-10-14T23:59:00+08:00");
const AFTER = Date.parse("2026-10-15T00:00:00+08:00");

describe("opensOn：某個開放日，現在算不算還沒到", () => {
  it("還沒到那天台灣時間 00:00：還沒開放", () => {
    expect(opensOn(V002_OPEN_DATE, BEFORE)).toBe(true);
  });

  it("到了那天台灣時間 00:00：已經開放（不再標）", () => {
    expect(opensOn(V002_OPEN_DATE, AFTER)).toBe(false);
  });

  it("沒有開放日：不是這次新開放的內容，不算「還沒開放」", () => {
    expect(opensOn(undefined, BEFORE)).toBe(false);
  });
});

describe("beforeV002：V002 新內容（三轉、Lv.120、天空之城／冰原雪域／廢礦區）現在算不算還沒開放", () => {
  it("V002_OPEN_DATE 就是 2026-10-15", () => {
    expect(V002_OPEN_DATE).toBe("2026-10-15");
  });

  it("10/14 23:59（台灣時間）：還沒開放", () => {
    expect(beforeV002(BEFORE)).toBe(true);
  });

  it("10/15 00:00（台灣時間）：已經開放，畫面上的「10/15 開放」標示要自動消失", () => {
    expect(beforeV002(AFTER)).toBe(false);
  });
});
