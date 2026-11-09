import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const CLIENT = "ca-pub-1234567890123456";

async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const ads = await import("../ads");
  const { AdSlot } = await import("@/components/AdSlot");
  return { ads, html: (unit: "detail" | "article") => renderToStaticMarkup(createElement(AdSlot, { unit })) };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("廣告版位（v1.77）", () => {
  it("預設用使用者的發布商編號，ads.txt 跟它一致", async () => {
    const { ads } = await load();
    expect(ads.ADSENSE_CLIENT).toBe(ads.PUBLISHER_ID);
    expect(ads.adsenseMeta()).toEqual({ "google-adsense-account": ads.PUBLISHER_ID });
    const adsTxt = fs.readFileSync(path.resolve(process.cwd(), "public/ads.txt"), "utf8").trim();
    expect(adsTxt).toBe(`google.com, ${ads.PUBLISHER_ID.replace("ca-", "")}, DIRECT, f08c47fec0942fa0`);
  });

  it("編號關掉（空字串）：什麼都不畫", async () => {
    const { ads, html } = await load({ NEXT_PUBLIC_ADSENSE_CLIENT: "" });
    expect(ads.ADSENSE_CLIENT).toBe("");
    expect(ads.adsenseMeta()).toEqual({});
    expect(html("detail")).toBe("");
  });

  it("有編號、還沒有版位編號（審核中）：只放驗證網站用的標記，不畫空框", async () => {
    const { ads, html } = await load({ NEXT_PUBLIC_ADSENSE_CLIENT: CLIENT });
    expect(ads.adsenseMeta()).toEqual({ "google-adsense-account": CLIENT });
    expect(html("detail")).toBe("");
  });

  it("都有了：第一格就留好固定高度並標明是廣告，畫面不會跳", async () => {
    const { html } = await load({ NEXT_PUBLIC_ADSENSE_CLIENT: CLIENT, NEXT_PUBLIC_AD_UNIT_DETAIL: "111" });
    const out = html("detail");
    expect(out).toContain("廣告");
    expect(out).toContain("h-[280px]");
    expect(out).toContain('data-ad-client="ca-pub-1234567890123456"');
    expect(out).toContain('data-ad-slot="111"');
    expect(html("article")).toBe("");
  });

  it("只有正式網域才真的載廣告：測試機、本機不灌假曝光", async () => {
    const { ads } = await load({ NEXT_PUBLIC_ADSENSE_CLIENT: "" });
    expect(ads.adsEnabledFor("maplehelper.tw", CLIENT)).toBe(true);
    expect(ads.adsEnabledFor("maplehelper-dev.pipicards.workers.dev", CLIENT)).toBe(false);
    expect(ads.adsEnabledFor("localhost", CLIENT)).toBe(false);
    expect(ads.adsEnabledFor("maplehelper.tw", "")).toBe(false);
  });
});

describe("放廣告的頁面", () => {
  const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

  it("單筆資料頁跟攻略文放，工具頁不放", () => {
    expect(read("src/components/SeoPage.tsx")).toContain('<AdSlot unit="detail" />');
    expect(read("src/components/JobArticleView.tsx")).toContain('<AdSlot unit="article" />');
    for (const tool of ["src/app/plan/damage/page.tsx", "src/app/plan/speed/page.tsx", "src/app/db/monsters/page.tsx", "src/app/page.tsx"]) {
      expect(read(tool)).not.toContain("AdSlot");
    }
  });

  it("隱私權頁照實寫：主機、分析、廣告 Cookie、外部請求", () => {
    const page = read("src/app/privacy/page.tsx");
    for (const stale of ["Vercel", "沒有另外建立分析", "不會即時向外部服務請求"]) expect(page).not.toContain(stale);
    for (const must of ["Cloudflare", "Google Analytics", "AdSense", "第三方供應商", "adssettings.google.com", "aboutads.info", "maplestory.io", "野王計時"]) {
      expect(page).toContain(must);
    }
  });
});
