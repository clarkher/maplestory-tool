/**
 * 傷害計算機頁下面的問答（v2.55）：伺服器就畫好，不跑 JavaScript 的爬蟲、會上網的 GPT 也讀得到。
 * 以前伺服器吐的正文只有「整理資料中…」共 43 字。
 */
import { Suspense, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Page from "@/app/plan/damage/page";
import { DamageFaq } from "@/app/plan/damage/DamageFaq";
import { JOB_OPTIONS } from "@/lib/jobs";

const html = renderToStaticMarkup(createElement(DamageFaq));
const text = html.replace(/<[^>]+>/g, "");

describe("傷害計算機問答", () => {
  it("五題都是小標，答案是純文字", () => {
    expect(html.match(/<h2/g)).toHaveLength(5);
    for (const q of ["楓之谷經典版打一下多痛怎麼算？", "兩套點法、兩把武器差多少？", "哪些怪一下、兩下就打死？", "哪些職業能算？", "算出來準嗎？"]) {
      expect(html).toContain(q);
    }
  });

  it("職業數跟選單一致（選單加職業，文案跟著變）", () => {
    expect(text).toContain(`一轉到三轉 ${JOB_OPTIONS.length} 個職業都能選`);
  });

  it("照實寫哪些公式沒驗證", () => {
    expect(text).toContain("舊版國際服公式");
    expect(text).toContain("台服經典版還沒人實測");
  });

  it("問答在計算機下面、不在 Suspense 裡（不等程式就有）", () => {
    const children = ([] as ReactNode[]).concat((Page() as ReactElement<{ children: ReactNode }>).props.children);
    const types = children.filter(isValidElement).map(child => child.type);
    expect(types).toEqual([Suspense, DamageFaq]);
  });
});
