/**
 * 選中不用實心橘（v1.95 A 攻略工具第 2 輪）：選中是橘框＋橘色淡底（components/option-style.ts 的 OPTION_ON）。
 * 實心橘只留給主要按鈕、亮起來的格子這類「本來就要最醒目」的東西，同一行或上一行寫「實心：<原因>」放過。
 * 抓的是條件式：`? "…bg-[color:var(--maple)]…text-[color:var(--on-accent)]…"`，開關、時間軸圓點沒有橘底上的字，不會被抓。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOLID_PICK = /\?\s*"[^"]*bg-\[color:var\(--maple\)\][^"]*text-\[color:var\(--on-accent\)\]/;
const root = fileURLToPath(new URL("../../", import.meta.url));

describe("選中不用實心橘（v1.95）", () => {
  it("條件式的實心橘只留給標了「實心：」的地方", () => {
    const offenders: string[] = [];
    for (const file of fs.readdirSync(root, { recursive: true }) as string[]) {
      if (!file.endsWith(".tsx") || file.includes("__tests__")) continue;
      const lines = fs.readFileSync(`${root}/${file}`, "utf8").split("\n");
      lines.forEach((line, i) => {
        const near = [lines[i - 2], lines[i - 1], line].join("\n");
        if (SOLID_PICK.test(line) && !/實心：/.test(near)) offenders.push(`${file.split(String.fromCharCode(92)).join("/")}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
