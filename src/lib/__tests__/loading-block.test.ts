/**
 * 全站的「讀取中」區塊：讀螢幕軟體要唸得出「讀取你的角色…」這類字，轉圈本身不唸。
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoadingBlock } from "@/components/PlanShell";

describe("讀取中的區塊", () => {
  it("讀螢幕軟體會唸出讀取的字（role=status），轉圈本身藏起來不唸", () => {
    const html = renderToString(createElement(LoadingBlock, { label: "讀取你的角色…" }));
    expect(html).toMatch(/<div[^>]*role="status"[^>]*>/);
    expect(html).toContain("讀取你的角色…");
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>/);
  });

  it("沒給字時唸預設的「整理資料中…」", () => {
    const html = renderToString(createElement(LoadingBlock));
    expect(html).toMatch(/role="status"/);
    expect(html).toContain("整理資料中…");
  });
});
