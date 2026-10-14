// src/lib/speed/__tests__/privacy-copy.test.ts
/**
 * 隱私頁（src/app/privacy/page.tsx）講練功測速帶上的職業（10/14）：職業是全站共用的設定（src/lib/profile.ts，
 * 我的路線、算傷害、查資料都讀同一份），不是只有「我的路線」選得到，所以寫「你在本站選的職業」。
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Page from "@/app/privacy/page";

describe("隱私頁：練功測速帶上的職業", () => {
  const html = renderToString(Page()).replace(/<!-- -->/g, "");

  it("寫「你在本站選的職業」（例外那句、存的內容那一條）", () => {
    expect(html).toContain("存一筆紀錄會帶上你在本站選的職業。");
    expect(html).toContain("職業（認不出來時用你在本站選的職業）");
  });

  it("不再寫「我的路線」選的", () => {
    expect(html).not.toContain("我的路線");
  });
});
