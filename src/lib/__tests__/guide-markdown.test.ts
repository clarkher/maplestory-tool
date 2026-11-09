/**
 * 一般攻略文（v1.88，src/content/guides/*.md）：讀 Markdown 成區塊、防呆（11/09 使用者規則：標題、內文都要寫「楓之谷經典版」）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuideDocView } from "@/components/GuideDocView";
import { GUIDE_CATEGORIES } from "@/lib/guide-catalog";
import { guideImages, guideProblems, guideText, parseGuide, parseInline } from "@/lib/guide-markdown";
import { staticGuideCards, staticGuideDocs } from "@/lib/static-data";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const exists = (publicPath: string) => fs.existsSync(path.join(ROOT, "public", publicPath));

const SAMPLE = `---
title: 楓之谷經典版測試攻略
description: 摘要
category: 轉職
tags: 三轉, 法師，70 等
published: 2026-11-09
updated: 2026-11-10
heroAlt: 主圖
---

# 這行大標頁面自己畫，拿掉

楓之谷經典版的第一段，**粗體**跟[連結](/guides)。
接在同一段。

<!-- 這是註解，不上頁面 -->

## 準備
### 準備

- 第一項
  縮排接同一項
- 第二項 ![小圖](/assets/items/2000000.png)

1. 一
2. 二

| 職業 | 找誰 |
|---|---|
| 法師 | 長老 |

> 引言第一行
> - 引言清單

![地圖](/assets/maps/x.png)

---
`;

describe("讀 Markdown", () => {
  const doc = parseGuide("sample", SAMPLE.replace(/\n/g, "\r\n"));

  it("設定區（CRLF 也行）：tags 中英文逗號都分", () => {
    expect(doc).toMatchObject({ slug: "sample", title: "楓之谷經典版測試攻略", category: "轉職", published: "2026-11-09", updated: "2026-11-10", heroAlt: "主圖" });
    expect(doc.tags).toEqual(["三轉", "法師", "70 等"]);
  });

  it("區塊：# 大標拿掉、段落併行、註解不留、重複標題錨點補 -2", () => {
    expect(doc.blocks.map(block => block.t)).toEqual(["p", "h", "h", "list", "list", "table", "quote", "img", "hr"]);
    expect(guideText(doc.blocks)).not.toContain("這行大標");
    expect(guideText(doc.blocks)).not.toContain("註解");
    expect(guideText(doc.blocks)).toContain("粗體跟連結。接在同一段。");
    const [, h2, h3] = doc.blocks;
    expect(h2).toMatchObject({ t: "h", level: 2, id: "準備" });
    expect(h3).toMatchObject({ t: "h", level: 3, id: "準備-2" });
  });

  it("清單：縮排接同一項、有序無序分開", () => {
    const [list, ordered] = doc.blocks.filter(block => block.t === "list");
    expect(list).toMatchObject({ ordered: false });
    expect(ordered).toMatchObject({ ordered: true });
    expect(guideText([list])).toContain("第一項縮排接同一項");
  });

  it("行內：粗體、連結、圖片；沒配對的括號照原文", () => {
    expect(parseInline("a **b** [c](/d) ![e](/f.png)")).toEqual([
      { t: "text", v: "a " },
      { t: "b", c: [{ t: "text", v: "b" }] },
      { t: "text", v: " " },
      { t: "a", href: "/d", c: [{ t: "text", v: "c" }] },
      { t: "text", v: " " },
      { t: "img", src: "/f.png", alt: "e" },
    ]);
    expect(parseInline("[沒配對 **也照留")).toEqual([{ t: "text", v: "[沒配對 **也照留" }]);
  });

  it("圖：段落、清單、引言裡的都抓得到", () => {
    expect(guideImages(doc.blocks)).toEqual(["/assets/items/2000000.png", "/assets/maps/x.png"]);
  });

  it("少設定直接報錯", () => {
    expect(() => parseGuide("bad", "沒有設定區")).toThrow("設定區");
    expect(() => parseGuide("bad", "---\ntitle: x\n---\n")).toThrow("description");
  });
});

describe("讀 Markdown 的邊角", () => {
  const md = (body: string) => parseGuide("x", `---
title: t
description: d
category: 轉職
published: 2026-11-09
updated: 2026-11-09
heroAlt: a
---
${body}`);

  it("第二個 # 以後當 ## 不吃掉；錨點不帶連結網址", () => {
    const doc = md(["# 大標", "", "# 中間大段", "", "## 去找 [教官](/db/npcs/1022000)"].join("\n"));
    expect(doc.blocks).toMatchObject([{ t: "h", level: 2, id: "中間大段" }, { t: "h", level: 2, id: "去找-教官" }]);
  });

  it("有序清單照起始號碼；項目中間隔空行還是同一個清單", () => {
    const doc = md(["1. a", "", "2. b", "", "說明", "", "3. c"].join("\n"));
    expect(doc.blocks).toMatchObject([{ t: "list", ordered: true, items: [[{ v: "a" }], [{ v: "b" }]] }, { t: "p" }, { t: "list", start: 3 }]);
    expect(doc.blocks[0]).not.toHaveProperty("start");
  });
});

describe("防呆", () => {
  const ok = parseGuide("ok", SAMPLE);
  it("標題、內文都要「楓之谷經典版」；日期格式；圖要存在", () => {
    expect(guideProblems(ok, () => true)).toEqual([]);
    expect(guideProblems({ ...ok, title: "三轉攻略" }, () => true)[0]).toContain("標題");
    expect(guideProblems({ ...ok, blocks: ok.blocks.slice(1) }, () => true)[0]).toContain("內文");
    expect(guideProblems({ ...ok, updated: "11/10" }, () => true)[0]).toContain("YYYY-MM-DD");
    expect(guideProblems(ok, src => src !== "/assets/maps/x.png")).toEqual(["ok：圖不存在 /assets/maps/x.png"]);
  });
});

describe("站上的文章（src/content/guides）", () => {
  const docs = staticGuideDocs();

  it("三轉攻略在，每篇都過防呆、分類在清單裡、主圖在", () => {
    expect(docs.map(doc => doc.slug)).toContain("third-job");
    for (const doc of docs) {
      expect(guideProblems(doc, exists), doc.slug).toEqual([]);
      expect(GUIDE_CATEGORIES as readonly string[], doc.slug).toContain(doc.category);
      expect(exists(`/assets/guides/${doc.slug}/hero.webp`), doc.slug).toBe(true);
      expect(exists(`/assets/guides/${doc.slug}/hero.jpg`), doc.slug).toBe(true);
    }
  });

  const cards = staticGuideCards();

  it("站內連到 /guides/<slug> 的都要真的有那篇", () => {
    const pages = new Set(cards.map(card => card.href));
    for (const doc of docs) {
      for (const [, href] of JSON.stringify(doc.blocks).matchAll(/"href":"(\/guides\/[^"#]+)/g)) expect(pages.has(href), `${doc.slug} → ${href}`).toBe(true);
    }
  });

  it("文章裡的 #錨點連結都對得到標題", () => {
    for (const doc of docs) {
      const ids = new Set(JSON.stringify(doc.blocks).match(/"id":"[^"]+"/g)?.map(raw => raw.slice(6, -1)));
      for (const [, id] of JSON.stringify(doc.blocks).matchAll(/"href":"#([^"]+)"/g)) expect(ids.has(id), `${doc.slug} #${id}`).toBe(true);
    }
  });

  it("文章裡的圖有圖說時，圖本身 alt 留空（螢幕閱讀器不念兩次）", () => {
    const doc = docs.find(entry => entry.slug === "third-job")!;
    const html = renderToString(createElement(GuideDocView, { doc, hero: null, jsonLd: [] }));
    const figure = /<figure[^>]*>([\s\S]*?)<\/figure>/.exec(html)![1];
    expect(figure).toContain('alt=""');
    expect(figure).toContain("<figcaption");
  });

  it("攻略專區的卡片：每張的標題都有「楓之谷經典版」、主圖都在", () => {
    expect(cards.length).toBeGreaterThan(docs.length);
    for (const card of cards) {
      expect(card.title, card.href).toContain("楓之谷經典版");
      expect(exists(card.image), card.image).toBe(true);
    }
  });

  it("陸服楓葉商會情報（v1.95，使用者拍板 2A）：標題、開頭講明陸服＋台服未公布，19 把武器都有台服道具圖，卷軸照台服道具說明", () => {
    const doc = docs.find(entry => entry.slug === "maple-leaf-shop")!;
    expect(doc.category).toBe("活動");
    expect(doc.title).toMatch(/陸服.*台服未公布/);
    const text = guideText(doc.blocks);
    expect(text.split("\n")[0]).toContain("這是陸服情報，台服還沒公布");
    expect(text).toContain("台服名稱、等級、數值：楓之谷經典版台服遊戲檔案已有");
    expect(text).toContain("武器（台服名稱） 台服數值 陸服");
    // v1.96 手機表格改窄：卷軸第一欄只留成功率，完整台服名稱＋ID 寫在表上方
    expect(text).toMatch(/^\s*15% 攻擊力 \+5，STR \+3，物理防禦力 \+1 /m);
    expect(text).not.toContain("台服遊戲檔案還沒有");
    // 21 張卷軸的台服名稱照站上道具資料（public/data/items.json 的 n），成功率跟說明 d 對得上
    const items = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/items.json"), "utf8")) as { id: number; n: string; d?: string }[];
    const scrolls = items.filter(item => item.id >= 2046414 && item.id <= 2046434);
    expect(scrolls).toHaveLength(21);
    for (const scroll of scrolls) {
      expect(text, String(scroll.id)).toContain(`${scroll.n}（${scroll.id}）`);
      expect(scroll.d, String(scroll.id)).toContain(`${/(\d+)%$/.exec(scroll.n)![1]}%`);
    }
    const icons = guideImages(doc.blocks).filter(src => src.startsWith("/assets/items/"));
    expect(new Set(icons).size).toBe(19 + 21);
    // 兩把劍名稱對調：陸服「楓葉戰劍」＝台服 35 級楓葉之劍（1302020）
    expect(text).toMatch(/楓葉之劍 35 等 單手劍，不限職業；[^\n]* 100\s枚，叫楓葉戰劍$/m);
    // 表格裡的道具小圖要 max-w-none，不然算欄寬時被當 0 寬，名字壓到隔壁欄
    const html = renderToString(createElement(GuideDocView, { doc, hero: null, jsonLd: [] }));
    const icon = /<td[^>]*><img [^>]*src="\/assets\/items\/1302020\.png"[^>]*>/.exec(html)![0];
    expect(icon).toContain("max-w-none");
  });

  it("頁面畫得出來：標題、主圖、麵包屑回攻略專區", () => {
    const doc = docs.find(entry => entry.slug === "third-job")!;
    const html = renderToString(createElement(GuideDocView, { doc, hero: { src: "/assets/guides/third-job/hero.webp", w: 1536, h: 864 }, jsonLd: [] }));
    expect(html).toContain(doc.title);
    expect(html).toContain('src="/assets/guides/third-job/hero.webp"');
    expect(html).toContain('href="/guides"');
  });
});
