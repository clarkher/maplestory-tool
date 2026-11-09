/** 手機網址列顏色、英數字粗細要跟新設計系統對齊（v1.89 A 攻略工具）。 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const layout = fs.readFileSync(fileURLToPath(new URL("../../app/layout.tsx", import.meta.url)), "utf8");
const css = fs.readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");

function paper(block: RegExp): string {
  const m = css.match(block);
  return m![1].toLowerCase();
}

describe("layout 跟 A 設計系統對齊（v1.89）", () => {
  it("手機網址列顏色等於淺色、深色的 --paper", () => {
    const light = paper(/data-theme="light"\]\s*\{[^}]*?--paper:\s*(#[0-9a-fA-F]{6})/);
    const dark = paper(/data-theme="dark"\]\s*\{[^}]*?--paper:\s*(#[0-9a-fA-F]{6})/);
    expect(layout).toContain(`(prefers-color-scheme: light)", color: "${light}"`);
    expect(layout).toContain(`(prefers-color-scheme: dark)", color: "${dark}"`);
  });

  it("Inter 載了 700，font-bold 的英數字不會比中文粗", () => {
    const inter = layout.match(/Inter\(\{[\s\S]*?\}\)/)![0];
    expect(inter).toMatch(/"700"/);
  });
});
