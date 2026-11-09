/**
 * 選項按鈕的樣子（v1.89 A 攻略工具）：小圓角（rounded-md）、選中是橘框＋橘色淡底＋橘字，不再是實心橘膠囊。
 * 實心橘底只留給「主要按鈕」（首頁選職業最下面那顆「看我的路線」）。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8");

describe("選項按鈕（v1.89）", () => {
  for (const file of ["ChoiceGroup.tsx", "FilterTag.tsx"]) {
    it(`${file}：不用膠囊、選中是橘色淡底不是實心橘`, () => {
      const source = read(file);
      expect(source).not.toMatch(/rounded-full/);
      expect(source).not.toMatch(/bg-\[color:var\(--maple\)\]/);
      expect(source).toMatch(/bg-\[color:var\(--maple-wash\)\]/);
    });
  }

  it("首頁選職業（CharacterBar）：只有頭像是圓的，實心橘底只剩最下面那顆主要按鈕", () => {
    const lines = read("route/CharacterBar.tsx").split("\n");
    expect(lines.filter(line => /rounded-full/.test(line) && !/size-\[60px\]/.test(line))).toEqual([]);
    expect(lines.filter(line => /bg-\[color:var\(--maple\)\]/.test(line))).toHaveLength(1);
  });
});
