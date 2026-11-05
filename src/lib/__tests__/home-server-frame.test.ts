/**
 * 首頁「伺服器畫的版本」（硬重新整理第一格）的結構：第一次來的人第一格就是選單；存過角色的人靠 <html data-profile="saved"> 換成讀取中。
 * 全站內容區至少一個螢幕高，頁尾第一格就在畫面外。
 * 這些 class 拿掉，頁面就會跳（CLS 超過 0.1）；真的畫面數字看 scripts/verify/page-cls.mjs。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AboutContent } from "@/app/about/AboutContent";
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

  it("存過角色的人：選單藏起來", () => {
    expect(html).toMatch(/<section aria-label="你的角色" class="[^"]*\[\[data-profile=saved\]_&amp;\]:hidden"/);
  });
});

describe("資料從哪來", () => {
  it("版本、資料筆數第一格就在（不等程式載資料，不然下面的區塊全被推走，手機 0.74）", () => {
    const meta = JSON.parse(fs.readFileSync(fileURLToPath(new URL("../../../public/data/meta.json", import.meta.url)), "utf8"));
    const html = renderToString(createElement(AboutContent, { meta }));
    expect(html).toContain("這個站是對應哪個版本");
    expect(html).toContain("目前這份資料");
  });

  it("開放到第幾轉照資料寫（版本那句、開放範圍那行都要換）", () => {
    const meta = JSON.parse(fs.readFileSync(fileURLToPath(new URL("../../../public/data/meta.json", import.meta.url)), "utf8"));
    const render = (order: number) => renderToString(createElement(AboutContent, { meta: { ...meta, release: { ...meta.release, maxAdvancementOrder: order } } }));
    expect(render(3).match(/三轉/g)).toHaveLength(2);
    expect(render(3)).not.toContain("二轉");
    expect(render(2).match(/二轉/g)).toHaveLength(2);
    expect(render(2)).not.toContain("三轉");
  });
});

describe("全站版面", () => {
  it("內容區至少一個螢幕高（頁尾第一格就在畫面外）", () => {
    const layout = fs.readFileSync(fileURLToPath(new URL("../../app/layout.tsx", import.meta.url)), "utf8");
    expect(layout).toMatch(/<main id="main" className="[^"]*\bmin-h-dvh\b/);
  });
});
