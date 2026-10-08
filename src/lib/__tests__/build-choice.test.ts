import { describe, expect, it } from "vitest";
import { parseBuildChoices, withBuildChoice } from "@/lib/build-choice";

describe("build-choice：每個系別記一套點法", () => {
  it("存壞了、沒存過都當作沒選", () => {
    expect(parseBuildChoices("")).toEqual({});
    expect(parseBuildChoices("{壞掉")).toEqual({});
    expect(parseBuildChoices("[1,2]")).toEqual({});
    expect(parseBuildChoices('{"400":"全幸","200":3}')).toEqual({ "400": "全幸" });
  });

  it("選了記在一轉職業代碼底下；選回主推（null）就拿掉", () => {
    expect(withBuildChoice({}, 400, "全幸")).toEqual({ "400": "全幸" });
    expect(withBuildChoice({ "400": "全幸", "200": "裝備法" }, 400, null)).toEqual({ "200": "裝備法" });
  });
});
