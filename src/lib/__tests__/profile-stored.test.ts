import { describe, expect, it } from "vitest";
import { parseStoredProfile } from "@/lib/profile";

describe("讀本機存的角色（查資料頁第一個畫面就要用）", () => {
  it("沒存過：還沒選職業、沒填等級", () => {
    expect(parseStoredProfile("")).toEqual({ level: 0, job: -1 });
  });

  it("存過：照存的用", () => {
    expect(parseStoredProfile('{"level":45,"job":110}')).toEqual({ level: 45, job: 110 });
  });

  it("存的東西壞掉：當作沒存過，不會讓頁面掛掉", () => {
    expect(parseStoredProfile("{level:")).toEqual({ level: 0, job: -1 });
  });
});
