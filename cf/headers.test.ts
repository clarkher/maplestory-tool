import { describe, expect, it } from "vitest";
import { CACHE_HEADERS } from "../cache-headers.mjs";
import { toHeadersFile } from "../scripts/cf/build.mjs";

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
