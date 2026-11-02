import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config.mjs";
import { SITE_URL } from "../seo";

describe("正式網域 maplehelper.tw（v1.28）", () => {
  it("網址都用新網域", () => {
    expect(SITE_URL).toBe("https://maplehelper.tw");
  });

  it("舊正式機整站 301 到新網域，路徑照帶", async () => {
    const rules = await nextConfig.redirects!();
    const rule = rules.find(entry => entry.has?.some(has => has.type === "host"));
    expect(rule).toMatchObject({
      source: "/:path*",
      has: [{ type: "host", value: "maplestory-tool-three.vercel.app" }],
      destination: `${SITE_URL}/:path*`,
      statusCode: 301,
    });
  });

  it("只轉舊正式機：測試機、分支預覽不能被轉走", async () => {
    const rules = await nextConfig.redirects!();
    expect(rules.every(entry => entry.has?.length)).toBe(true);
    expect(JSON.stringify(rules)).not.toContain("git-dev");
  });
});
