import { describe, expect, it } from "vitest";
import { newRoomCode, normalizeRoomCode, ROOM_ALPHABET } from "@/lib/boss/room-code";

describe("房間代碼", () => {
  it("newRoomCode 6 碼且只含字母表", () => {
    for (let i = 0; i < 50; i++) {
      const c = newRoomCode();
      expect(c).toHaveLength(6);
      for (const ch of c) expect(ROOM_ALPHABET).toContain(ch);
    }
  });
  it("可注入亂數，random=0 全取第一個字元", () => {
    expect(newRoomCode(() => 0)).toBe("AAAAAA");
  });
  it("normalize 去空白轉大寫", () => {
    expect(normalizeRoomCode(" k7q2ab ")).toBe("K7Q2AB");
  });
  it("含 O、0 或長度不是 6 回 null", () => {
    expect(normalizeRoomCode("K7Q2AO")).toBeNull();
    expect(normalizeRoomCode("K7Q2A0")).toBeNull();
    expect(normalizeRoomCode("K7Q2A")).toBeNull();
    expect(normalizeRoomCode("K7Q2ABC")).toBeNull();
  });
});
