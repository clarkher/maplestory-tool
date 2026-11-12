/**
 * 分享預覽圖（v2.11）：頁面自己寫 openGraph 會整個蓋掉 layout 那份（Next 不合併），
 * 沒展開 OG_BASE 就沒有 og:image——貼到 LINE、Discord 只剩一行字。單筆資料頁、改版頁都中過。
 * 沒寫 openGraph 的頁沿用 layout 那份：og:title、og:url 都是首頁的（工具頁、清單頁 29 頁中過），所以有自己標題的頁一定要寫。
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

describe("有自己標題的頁，分享出去是自己的標題跟網址", () => {
  it("每個有 metadata 的 page.tsx 都寫 openGraph，或用 withOpenGraph 包", () => {
    const missing = pages(APP)
      .filter(file => file.endsWith("page.tsx"))
      .filter(file => {
        const source = fs.readFileSync(file, "utf8");
        return /export (const metadata|(async )?function generateMetadata)/.test(source) && !/openGraph:|withOpenGraph\(/.test(source);
      })
      .map(file => path.relative(APP, file).replaceAll("\\", "/"));
    expect(missing).toEqual([]);
  });

  it("withOpenGraph：og 標題加站名、網址用 canonical、帶全站預覽圖", async () => {
    const { OG_BASE, withOpenGraph } = await import("@/lib/seo");
    const meta = withOpenGraph({ title: "傷害計算機｜兩套點法", description: "比打怪", alternates: { canonical: "/plan/damage" } });
    expect(meta.title).toBe("傷害計算機｜兩套點法");
    expect(meta.openGraph).toEqual({ ...OG_BASE, title: "傷害計算機｜兩套點法｜楓谷幫手", description: "比打怪", url: "/plan/damage" });
  });

  it("layout 的 twitter 不寫標題、說明：不然每一頁的 twitter:title 都是首頁那句（X 會改讀 og:title）", () => {
    const layout = fs.readFileSync(path.join(APP, "layout.tsx"), "utf8");
    const twitter = layout.split(/twitter:\s*\{/)[1].split("}")[0];
    expect(twitter).not.toMatch(/title:|description:/);
    expect(twitter).toMatch(/card: "summary_large_image"/);
  });
});
