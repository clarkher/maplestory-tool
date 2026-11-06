import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DRAW_HREF, SHOWCASE, loopSeconds, lookHref } from "../showcase";

describe("首頁紙娃娃輪播", () => {
  it("放得滿一排：至少 12 套、男女都有", () => {
    expect(SHOWCASE.length).toBeGreaterThanOrEqual(12);
    expect(SHOWCASE.some((look) => look.q.startsWith("g=1"))).toBe(true);
    expect(SHOWCASE.some((look) => !look.q.startsWith("g=1"))).toBe(true);
  });

  it("每套的圖都在站上，寬高跟檔案一樣（輪播照這個留位置，不准跳）", () => {
    for (const look of SHOWCASE) {
      const file = path.join("public", look.src);
      expect(fs.existsSync(file), look.src).toBe(true);
      const png = fs.readFileSync(file);
      expect({ w: png.readUInt32BE(16), h: png.readUInt32BE(20) }, look.src).toEqual({ w: look.w, h: look.h });
    }
  });

  it("圖都不超過輪播留的高度", () => {
    for (const look of SHOWCASE) expect(look.h, look.src).toBeLessThanOrEqual(76);
  });

  it("點角色帶那套穿搭，抽一套帶 draw", () => {
    expect(lookHref({ q: "g=1&h=31470", w: 1, h: 1, src: "" })).toBe("/plan/avatar?g=1&h=31470");
    expect(DRAW_HREF).toBe("/plan/avatar?draw=1");
  });

  it("跑一圈的秒數照寬度算", () => {
    expect(loopSeconds([{ q: "", w: 60, h: 1, src: "" }, { q: "", w: 40, h: 1, src: "" }])).toBe(Math.round((90 + 14 + 60 + 14) / 28));
  });
});
