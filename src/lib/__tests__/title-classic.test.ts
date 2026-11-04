import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HOME_TITLE, TITLE_TEMPLATE } from "../seo";

function pageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pageFiles(path);
    return name === "page.tsx" ? [path] : [];
  });
}

describe("全站標題帶「楓之谷經典版」（v1.42）", () => {
  it("首頁跟其他頁的標題都有這幾個字", () => {
    expect(HOME_TITLE).toContain("楓之谷經典版");
    expect(TITLE_TEMPLATE).toBe("%s｜楓之谷經典版｜楓谷幫手");
  });

  it("首頁標題不會變成「新楓之谷經典版」", () => {
    expect(HOME_TITLE).not.toContain("新楓之谷經典版");
  });

  it("各頁自己的標題不重複寫經典版（模板會補上）", () => {
    const repeated = pageFiles(join(process.cwd(), "src/app")).filter(file =>
      /^\s*title: [`"][^`"]*經典版/m.test(readFileSync(file, "utf8")),
    );
    expect(repeated).toEqual([]);
  });
});
