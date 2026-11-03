import { describe, expect, it } from "vitest";
import { withoutCiOverride } from "../scripts/cf/deploy.mjs";

describe("Cloudflare 部署：道具圖那次不吃 Workers Builds 的改名", () => {
  it("拿掉 WRANGLER_CI_* 開頭的，其他照留", () => {
    const env = { WRANGLER_CI_OVERRIDE_NAME: "maplehelper-dev", WRANGLER_CI_MATCH_TAG: "abc", CLOUDFLARE_API_TOKEN: "t", APP_ENV: "preview" };
    expect(withoutCiOverride(env)).toEqual({ CLOUDFLARE_API_TOKEN: "t", APP_ENV: "preview" });
  });
});
