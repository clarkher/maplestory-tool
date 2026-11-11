/**
 * 分享預覽圖（v2.11）：頁面自己寫 openGraph 會整個蓋掉 layout 那份（Next 不合併），
 * 沒展開 OG_BASE 就沒有 og:image——貼到 LINE、Discord 只剩一行字。單筆資料頁、改版頁都中過。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const APP = fileURLToPath(new URL("../../app/", import.meta.url));

function pages(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : pages(full);
    return entry.name === "page.tsx" || entry.name === "layout.tsx" ? [full] : [];
  });
}

describe("每一頁的分享預覽都有圖", () => {
  const withOg = pages(APP).filter(file => /openGraph:\s*\{/.test(fs.readFileSync(file, "utf8")));

  it("找得到寫 openGraph 的頁（單筆資料頁、改版頁都在）", () => {
    const rel = withOg.map(file => path.relative(APP, file).replaceAll("\\", "/"));
    for (const kind of ["items", "maps", "monsters", "npcs", "quests", "skills"]) expect(rel).toContain(`db/${kind}/[id]/page.tsx`);
    expect(rel).toContain("updates/[version]/page.tsx");
  });

  for (const file of withOg) {
    it(`${path.relative(APP, file).replaceAll("\\", "/")}：每個 openGraph 都展開 OG_BASE`, () => {
      const source = fs.readFileSync(file, "utf8");
      const blocks = source.split(/openGraph:\s*\{/).slice(1);
      for (const block of blocks) expect(block.slice(0, 200)).toMatch(/^\s*\.\.\.OG_BASE/);
    });
  }
});
