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

/** 夜晚主題（`:root[data-theme="dark"]`）裡某個顏色變數的 #rrggbb */
function darkColor(name: string) {
  const dark = rules.find(rule => rule.selector === ':root[data-theme="dark"]');
  return dark?.body.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? "";
}

/** 兩個 #rrggbb 的對比（WCAG 相對亮度比，1 是一樣、越大越分得出來） */
function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5]
      .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

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
  it("毛玻璃框（地圖下拉選單、讀取框）的邊維持米色，不用白邊", () => {
    for (const name of ["glass", "glass-solid"]) {
      expect(utilityBody(css, name)).toMatch(/border:\s*1px solid var\(--paper-edge\)/);
    }
  });

  it("導覽列用的毛玻璃底（glass-fill）不畫框：上、左、右貼著螢幕邊不要線，只留導覽列自己寫的下緣", () => {
    const fill = utilityBody(css, "glass-fill");
    expect(fill).toMatch(/backdrop-filter/);
    expect(fill).not.toMatch(/border/);
  });

  it("夜晚的邊框看得到：跟頁底的對比至少 2（使用者選 B #5b442e；原本 #33261a 只有 1.28，幾乎看不到）", () => {
    expect(contrast(darkColor("paper-edge"), darkColor("paper"))).toBeGreaterThanOrEqual(2);
  });
});

/** 某個主題裡某個變數寫的值（原文，例如 `#b32a00`、`rgb(184 134 42 / 0.14)`） */
function themeValue(theme: "light" | "dark", name: string) {
  const rule = rules.find(r => r.selector.split(",").map(s => s.trim()).includes(`:root[data-theme="${theme}"]`));
  const value = rule?.body.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();
  // 找不到就直接失敗：空字串算出來的對比是 NaN，`NaN < 4.5` 為假，會變成假綠燈
  if (!value) throw new Error(`${theme} 主題沒有 --${name}`);
  return value;
}

/** `#rrggbb` 或 `rgb(r g b / a)` → [r, g, b, a] */
function rgba(value: string): [number, number, number, number] {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16)).concat(1) as [number, number, number, number];
  const fn = value.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+))?\s*\)$/);
  if (!fn) throw new Error(`看不懂的顏色：${value}`);
  return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4])];
}

/** 半透明的 top 疊在不透明的 bottom 上，得到看到的 #rrggbb */
function over(top: string, bottom: string) {
  const [r, g, b, a] = rgba(top);
  const [r2, g2, b2] = rgba(bottom);
  return "#" + [[r, r2], [g, g2], [b, b2]].map(([x, y]) => Math.round(x * a + y * (1 - a)).toString(16).padStart(2, "0")).join("");
}

/**
 * 小字會落在的底：頁底、區塊的深一階底、毛玻璃卡片（疊在頁底上）。
 * 淺色的 paper-deep 是最暗的那一個，深色的毛玻璃是最亮的那一個，兩邊都要過。
 */
function grounds(theme: "light" | "dark") {
  const paper = themeValue(theme, "paper");
  return {
    paper,
    "paper-deep": themeValue(theme, "paper-deep"),
    glass: over(themeValue(theme, "glass"), paper),
    "glass-strong": over(themeValue(theme, "glass-strong"), paper),
  };
}

// WCAG AA 一般文字（不到 18.66px 粗體／24px）要 4.5。站上的小字幾乎都是 11～14px
const AA = 4.5;
const themes = ["light", "dark"] as const;
const accents = ["maple", "sky", "gold", "leaf"] as const;

describe("小字對比過 WCAG AA（v0.81，使用者選 A1：淺色整組壓深、深色按鈕亮底深字）", () => {
  for (const theme of themes) {
    it(`${theme}：字色（深淺灰、楓葉橘、天藍、金、綠）在頁底、區塊底、毛玻璃上都至少 4.5`, () => {
      const low: string[] = [];
      for (const name of ["ink", "ink-soft", "ink-faint", ...accents]) {
        for (const [ground, color] of Object.entries(grounds(theme))) {
          const ratio = contrast(themeValue(theme, name), color);
          if (ratio < AA) low.push(`${name} 在 ${ground} 上 ${ratio.toFixed(2)}`);
        }
      }
      expect(low).toEqual([]);
    });

    it(`${theme}：小標籤（Chip、出處標籤）的字在自己顏色的淡底上至少 4.5`, () => {
      const low: string[] = [];
      for (const name of accents) {
        for (const [ground, color] of Object.entries(grounds(theme))) {
          const ratio = contrast(themeValue(theme, name), over(themeValue(theme, `${name}-wash`), color));
          if (ratio < AA) low.push(`${name} 在 ${name}-wash／${ground} 上 ${ratio.toFixed(2)}`);
        }
      }
      expect(low).toEqual([]);
    });

    it(`${theme}：金色淡底的說明區塊（總經驗、轉職）裡的灰字至少 4.5`, () => {
      const low: string[] = [];
      for (const name of ["ink-soft", "ink-faint"]) {
        for (const [ground, color] of Object.entries(grounds(theme))) {
          const ratio = contrast(themeValue(theme, name), over(themeValue(theme, "gold-wash"), color));
          if (ratio < AA) low.push(`${name} 在 gold-wash／${ground} 上 ${ratio.toFixed(2)}`);
        }
      }
      expect(low).toEqual([]);
    });

    it(`${theme}：楓葉橘、綠、天藍的實心按鈕上，字（--on-accent）至少 4.5`, () => {
      const low: string[] = [];
      for (const name of ["maple", "leaf", "sky"]) {
        const ratio = contrast(themeValue(theme, "on-accent"), themeValue(theme, name));
        if (ratio < AA) low.push(`on-accent 在 ${name} 上 ${ratio.toFixed(2)}`);
      }
      expect(low).toEqual([]);
    });
  }

  it("實心按鈕上的字都用 --on-accent，不寫死白色（深色主題的按鈕是亮橘，白字只有 2.5）", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const offenders: string[] = [];
    for (const file of fs.readdirSync(root, { recursive: true }) as string[]) {
      if (!file.endsWith(".tsx") || file.includes("__tests__")) continue;
      const source = fs.readFileSync(`${root}/${file}`, "utf8");
      source.split("\n").forEach((line, i) => {
        if (/\btext-white\b|color:\s*["']#fff(fff)?["']|(stroke|fill)="#fff(fff)?"/.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("選取文字的反白也用 --on-accent", () => {
    const selection = rules.find(rule => rule.selector === "::selection");
    expect(selection?.body ?? "").toMatch(/color:\s*var\(--on-accent\)/);
  });
});
