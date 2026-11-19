import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error 建置腳本是 .mjs，沒有型別
import { THIN_MIN_CHARS, hideThinPages, mainTextLength } from "../scripts/cf/thin-pages.mjs";

const ROBOTS = '<meta name="robots" content="index, follow, max-image-preview:large"/>';
const page = (body: string) =>
  `<!DOCTYPE html><html><head><title>t</title>${ROBOTS}</head><body><header>導覽列很多字很多字</header><main>${body}<script>self.__next_f.push("一堆字一堆字")</script></main><footer>頁尾</footer></body></html>`;
const sitemap = (paths: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
    .map(p => `<url>\n<loc>https://maplehelper.tw${p}</loc>\n<lastmod>2026-11-19</lastmod>\n</url>`)
    .join("\n")}\n</urlset>\n`;

let dir = "";
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

describe("mainTextLength", () => {
  it("只算 <main> 裡看得到的字，不算 script、空白、導覽列", () => {
    expect(mainTextLength(page("<h1>馬頭骨</h1>\n<p>骷髏 指揮官</p>"))).toBe(8);
  });
  it("&lt; 這類字元還原成一個字", () => {
    expect(mainTextLength(page("塔&lt;6層&gt;"))).toBe(5);
  });
});

describe("hideThinPages", () => {
  it("字太少的資料頁改 noindex、退出 sitemap；夠厚的、不是資料頁的不動", () => {
    dir = mkdtempSync(join(tmpdir(), "thin-"));
    mkdirSync(join(dir, "db", "items"), { recursive: true });
    mkdirSync(join(dir, "db", "quests"), { recursive: true });
    mkdirSync(join(dir, "guides"), { recursive: true });
    const thick = "字".repeat(THIN_MIN_CHARS);
    writeFileSync(join(dir, "db", "items", "4000208.html"), page("馬頭骨"));
    writeFileSync(join(dir, "db", "quests", "2041.html"), page(thick));
    writeFileSync(join(dir, "db", "items.html"), page("清單頁"));
    writeFileSync(join(dir, "guides", "short.html"), page("短"));
    writeFileSync(join(dir, "sitemap.xml"), sitemap(["/", "/db/items/4000208", "/db/quests/2041", "/guides/short"]));

    const result = hideThinPages(dir);

    expect(result.hidden).toEqual(["/db/items/4000208"]);
    expect(result.checked).toBe(2);
    const thin = readFileSync(join(dir, "db", "items", "4000208.html"), "utf8");
    expect(thin).toContain('<meta name="robots" content="noindex, follow"/>');
    expect(thin).not.toContain("index, follow, max-image-preview");
    expect(readFileSync(join(dir, "db", "quests", "2041.html"), "utf8")).toContain(ROBOTS);
    expect(readFileSync(join(dir, "db", "items.html"), "utf8")).toContain(ROBOTS);
    expect(readFileSync(join(dir, "guides", "short.html"), "utf8")).toContain(ROBOTS);
    const xml = readFileSync(join(dir, "sitemap.xml"), "utf8");
    expect(xml).not.toContain("/db/items/4000208<");
    expect(xml).toContain("/db/quests/2041<");
    expect(xml).toContain("/guides/short<");
    expect(xml.match(/<url>/g)).toHaveLength(3);
  });

  it("頁面沒有 robots meta 就失敗（不然藏不住還以為藏了）", () => {
    dir = mkdtempSync(join(tmpdir(), "thin-"));
    mkdirSync(join(dir, "db", "npcs"), { recursive: true });
    writeFileSync(join(dir, "db", "npcs", "1.html"), page("短").replace(ROBOTS, ""));
    writeFileSync(join(dir, "sitemap.xml"), sitemap(["/db/npcs/1"]));
    expect(() => hideThinPages(dir)).toThrow(/robots/);
  });
});
