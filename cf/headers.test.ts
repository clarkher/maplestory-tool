import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CACHE_HEADERS } from "../cache-headers.mjs";
import { toHeadersFile, trimItemPageFiles } from "../scripts/cf/build.mjs";

describe("快取規則轉成 Cloudflare _headers", () => {
  const file = toHeadersFile(CACHE_HEADERS);

  it(":path* 換成 *，長快取在前", () => {
    expect(file.startsWith("/data/*\n  Cache-Control: public, max-age=31536000, immutable\n")).toBe(true);
    expect(file).toContain("/assets/*\n");
  });

  it("入口檔先拿掉前面規則的 Cache-Control 再設 must-revalidate（Cloudflare 會把多條命中的值串起來）", () => {
    expect(file).toContain("/data/meta.json\n  ! Cache-Control\n  Cache-Control: public, max-age=0, must-revalidate");
    expect(file).not.toContain("/data/*\n  ! Cache-Control");
  });

  it("測試機整站加 noindex，正式機不加", () => {
    expect(file).not.toContain("X-Robots-Tag");
    expect(toHeadersFile(CACHE_HEADERS, { noindex: true }).endsWith("\n/*\n  X-Robots-Tag: noindex\n")).toBe(true);
  });
});

describe("trimItemPageFiles：道具頁只留 html", () => {
  it("刪編號的 txt 跟資料夾，留 html 跟清單頁自己的檔", () => {
    const out = mkdtempSync(join(tmpdir(), "item-trim-"));
    const items = join(out, "db", "items");
    mkdirSync(join(items, "123"), { recursive: true });
    mkdirSync(join(items, "__next.db"), { recursive: true });
    writeFileSync(join(items, "123.html"), "x");
    writeFileSync(join(items, "123.txt"), "x");
    writeFileSync(join(items, "123", "__next._full.txt"), "x");
    writeFileSync(join(items, "__next._full.txt"), "x");
    writeFileSync(join(items, "__next.db", "a.txt"), "x");
    writeFileSync(join(out, "db", "items.html"), "x");
    expect(trimItemPageFiles(out)).toBe(1);
    expect(readdirSync(items).sort()).toEqual(["123.html", "__next._full.txt", "__next.db"]);
    expect(readdirSync(join(out, "db"))).toContain("items.html");
    rmSync(out, { recursive: true, force: true });
  });
});
