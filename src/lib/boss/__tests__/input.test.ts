import { describe, expect, it } from "vitest";
import { parseChannel } from "@/lib/boss/input";

describe("parseChannel 頻道輸入", () => {
  it("半形數字", () => {
    expect(parseChannel("22")).toBe(22);
    expect(parseChannel("1")).toBe(1);
    expect(parseChannel("60")).toBe(60);
  });
  it("全形數字轉半形", () => {
    expect(parseChannel("２２")).toBe(22);
  });
  it("去「頻」字與空白", () => {
    expect(parseChannel("12頻")).toBe(12);
    expect(parseChannel(" 7 ")).toBe(7);
    expect(parseChannel("頻 3")).toBe(3);
  });
  it("範圍外、空字串、小數、非數字回 null", () => {
    for (const bad of ["0", "61", "", "1.5", "abc", "1e1", "-3", "  "]) expect(parseChannel(bad)).toBeNull();
  });
});
