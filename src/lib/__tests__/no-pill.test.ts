/**
 * 不用膠囊（v1.89 A 攻略工具）：按鈕、選項、標籤一律小圓角。
 * 真的要圓的不算膠囊，放過：同一行有固定大小（size-*、aspect-square：頭像、圓點、圓形圖示按鈕、色塊）、
 * 細長條（h-1～h-3、h-full、inset-y-0、w-[3px]：進度條、時間軸、拖拉把手）、開關（h-7 w-12、h-[26px] w-11）、轉圈圈（animate-spin）。
 * 其他真的要圓的，在同一行或上一行寫「圓形：<原因>」。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROUND_SHAPE = /(?<![\w-])(size-|aspect-square|animate-spin|inset-y-0|w-\[3px\]|h-(1|1\.5|2|3|full|7|\[26px\])(?![\w.\[-]))/;

const root = fileURLToPath(new URL("../../", import.meta.url));

describe("全站不用膠囊（v1.89）", () => {
  it("圓形判斷：min-h-11 這類高度不算細長條", () => {
    expect(ROUND_SHAPE.test("min-h-11 rounded-full px-4")).toBe(false);
    expect(ROUND_SHAPE.test("h-10 rounded-full")).toBe(false);
    expect(ROUND_SHAPE.test("h-1.5 rounded-full")).toBe(true);
    expect(ROUND_SHAPE.test("grid size-9 rounded-full")).toBe(true);
  });

  it("rounded-full 只留給圓形的東西或標了「圓形：」的地方", () => {
    const offenders: string[] = [];
    for (const file of fs.readdirSync(root, { recursive: true }) as string[]) {
      if (!file.endsWith(".tsx") || file.includes("__tests__")) continue;
      const lines = fs.readFileSync(`${root}/${file}`, "utf8").split("\n");
      lines.forEach((line, i) => {
        const marked = /圓形：/.test(line) || /圓形：/.test(lines[i - 1] ?? "");
        if (/\brounded-full\b/.test(line) && !ROUND_SHAPE.test(line) && !marked) {
          offenders.push(`${file.split(String.fromCharCode(92)).join("/")}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
