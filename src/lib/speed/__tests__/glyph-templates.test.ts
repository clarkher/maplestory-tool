// src/lib/speed/__tests__/glyph-templates.test.ts
import { expect, it } from "vitest";
import data from "../glyphs.json";
import { buildStatusTemplates } from "../gen/status-templates";

// 樣板是照讀字的步驟（inkMask、addYellowInk、STATUS_FONT）量出來的：改了那幾個沒重產 glyphs.json，讀字會悄悄跟樣板對不上。
// 重產：npx vitest run -c vitest.gen.config.ts -t "產 glyphs.json"。格子差 1 級（存成 0–f）、比例差 0.01 內算一樣，換機器的浮點小差不會擋
it("glyphs.json 跟現在讀字的步驟產出來的一樣（沒過期）", () => {
  const built = buildStatusTemplates();
  const stored = data.chars as Array<{ ch: string; aspect: number; rh: number; grid: string }>;
  expect(stored.length).toBe(built.length);
  built.forEach((template, i) => {
    const saved = stored[i];
    expect(saved.ch).toBe(template.ch);
    expect(Math.abs(saved.aspect - template.aspect)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(saved.rh - template.rh)).toBeLessThanOrEqual(0.01);
    const off = Array.from(template.grid).filter((cell, k) => Math.abs(parseInt(cell, 16) - parseInt(saved.grid[k], 16)) > 1);
    expect(off, `第 ${i} 個樣板（${template.ch}）`).toEqual([]);
  });
});
