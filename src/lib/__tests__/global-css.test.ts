/**
 * 全站規則（globals.css）要放進 @layer base。Tailwind v4 的 class 都在 @layer utilities 裡，
 * 沒進任何 layer 的樣式一律壓過它們：以前 `* { border-color }` 沒進 layer，全站寫的邊框顏色 class 全部失效
 * （查資料搜尋框聚焦不會整個變橘）；`:focus-visible` 也沒進 layer，把搜尋框的 outline-none 蓋掉，聚焦時多一個歪框。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");

type Rule = { selector: string; body: string; layer: string | null };

/** 拆出每條樣式規則，記下它在哪個 layer；@utility、@theme 會被 Tailwind 放進 layer，也算有 */
function rulesOf(source: string): Rule[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  const stack: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ";") {
      start = i + 1;
    } else if (ch === "}") {
      stack.pop();
      start = i + 1;
    } else if (ch === "{") {
      const header = text.slice(start, i).trim();
      start = i + 1;
      if (header.startsWith("@")) {
        stack.push(header);
        continue;
      }
      const end = text.indexOf("}", i);
      const scope = [...stack].reverse().find(h => /^@(layer|utility|theme)\b/.test(h));
      rules.push({ selector: header, body: text.slice(i + 1, end), layer: scope ? scope.replace(/^@layer\s+/, "") : null });
      i = end;
      start = end + 1;
    }
  }
  return rules;
}

/** `@utility 名稱 { … }` 裡寫的內容 */
function utilityBody(source: string, name: string) {
  return source.match(new RegExp(`@utility\\s+${name}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

const rules = rulesOf(css);

describe("全站規則不能蓋掉 Tailwind 的 class", () => {
  it("沒進 layer 的規則不設定邊框跟外框（border*、outline*）", () => {
    const offenders = rules
      .filter(rule => rule.layer === null && /(^|;)\s*(border|outline)[\w-]*\s*:/.test(rule.body))
      .map(rule => rule.selector);
    expect(offenders).toEqual([]);
  });

  it("預設邊框色還是羊皮紙邊（paper-edge），放在 @layer base", () => {
    const base = rules.find(rule => rule.layer === "base" && rule.selector === "*");
    expect(base?.body ?? "").toMatch(/border-color:\s*var\(--paper-edge\)/);
  });

  it("鍵盤聚焦的橘色外框放在 @layer base", () => {
    const focus = rules.find(rule => rule.layer === "base" && rule.selector === ":focus-visible");
    expect(focus?.body ?? "").toMatch(/outline:\s*2px solid var\(--maple\)/);
  });
});

describe("外框顏色（2026-10-07 使用者看過對照圖選的）", () => {
  it("毛玻璃框（導覽列、地圖下拉選單、讀取框）的邊維持米色，不用白邊", () => {
    for (const name of ["glass", "glass-solid"]) {
      expect(utilityBody(css, name)).toMatch(/border:\s*1px solid var\(--paper-edge\)/);
    }
  });
});
