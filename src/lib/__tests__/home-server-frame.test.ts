/**
 * 首頁「伺服器畫的版本」（硬重新整理第一格）的結構：第一次來的人第一格就是選單；存過角色的人靠 <html data-profile="saved"> 換成讀取中、頁尾擠到畫面外。
 * 這些 class 拿掉，首頁就會跳（CLS 超過 0.1）；真的畫面數字看 scripts/verify/home-cls.mjs。
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RouteHome } from "@/components/route/RouteHome";

describe("首頁伺服器畫的版本", () => {
  const html = renderToString(createElement(RouteHome));

  it("第一次來的人第一格就有選單", () => {
    expect(html).toContain('aria-label="你的等級"');
    expect(html).toContain("先選職業跟等級");
  });

  it("讀取中平常不顯示，只有存過角色的人看得到", () => {
    expect(html).toMatch(/<div class="hidden \[\[data-profile=saved\]_&amp;\]:block"><div role="status"/);
    expect(html).toContain("讀取你的角色…");
  });

  it("存過角色的人：選單藏起來、整頁至少一個螢幕高（頁尾第一格就在畫面外）", () => {
    expect(html).toMatch(/<section aria-label="你的角色" class="[^"]*\[\[data-profile=saved\]_&amp;\]:hidden"/);
    expect(html).toMatch(/^<div class="[^"]*\[\[data-profile=saved\]_&amp;\]:min-h-dvh"/);
  });
});
