/**
 * 單獨頁的小標籤清單（SeoLinks）：React key 不准長得像網址（v1.93）。
 * key 會原樣寫進頁面裡的 RSC 資料，Googlebot 把裡面像路徑的字串當連結去抓。
 * 之前 key 是 href＋名稱（/db/npcs/9402807樂師），Search Console 因此多出 141 個 404。
 */
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { SeoLinks } from "../SeoPage";

describe("SeoLinks 的 key", () => {
  it("不含 href，也不是 / 開頭", () => {
    const links = [
      { href: "/db/npcs/9402807", text: "樂師", note: "回報" },
      { href: "/db/items/2044901", text: "火槍攻擊卷軸60%" },
      { href: "/db/npcs/9402807", text: "樂師", note: "接任務" },
    ];
    const list = SeoLinks({ links }) as ReactElement<{ children: ReactElement[] }>;
    const keys = list.props.children.map(item => String(item.key));
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
    for (const key of keys) {
      expect(key.startsWith("/")).toBe(false);
      for (const { href } of links) expect(key).not.toContain(href);
    }
  });
});
