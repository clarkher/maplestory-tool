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
import { staticAtlasMaps, staticGuideCards, staticGuideDocs, staticItemPages, staticMonsters, staticNpcs, staticQuests, staticSkills } from "@/lib/static-data";

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

const LINK_KINDS = /"href":"\/db\/(items|quests|monsters|npcs|maps|skills)\/([^"?#]+)"/g;

describe("來源標籤（v2.26）", () => {
  it("行內 {{src:legacy}} 變成標籤，不認的 {{src:xx}} 照原文", () => {
    expect(parseInline("點法 {{src:legacy}}")).toEqual([{ t: "text", v: "點法 " }, { t: "src", tag: "legacy" }]);
    expect(parseInline("{{src:xx}}")).toEqual([{ t: "text", v: "{{src:xx}}" }]);
  });

  it("頁面畫出「參考舊版資料」「遊戲資料」「站上計算」，純文字不含標籤字", () => {
    const doc = parseGuide("src-tag", SAMPLE.replace("楓之谷經典版的第一段", "楓之谷經典版的第一段 {{src:legacy}} {{src:game}} {{src:calc}}"));
    const html = renderToString(createElement(GuideDocView, { doc, hero: null, jsonLd: [] }));
    for (const label of ["參考舊版資料", "遊戲資料", "站上計算"]) expect(html).toContain(label);
    expect(guideText(doc.blocks)).not.toContain("{{src");
  });
});

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

  it("楓葉商會（v1.95 陸服情報 → v2.15 台服 11/12 公告後改台服版）：開頭講台服公告，19 把武器都有台服道具圖，卷軸照台服道具說明", () => {
    const doc = docs.find(entry => entry.slug === "maple-leaf-shop")!;
    expect(doc.category).toBe("活動");
    expect(doc.title).toContain("楓之谷經典版楓葉商會");
    const text = guideText(doc.blocks);
    expect(text.split("\n")[0]).toContain("楓之谷經典版台服 11/12 公告了");
    expect(text).not.toContain("台服未公布");
    expect(JSON.stringify(doc.blocks)).toContain("eventAdId=20216");
    expect(text).toContain("武器 數值 兌換價");
    // 台服公告只秀劍士：其他職業的價錢要標「照陸服」
    expect(text.match(/公告沒秀，價錢照陸服/g)).toHaveLength(4);
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
    // v2.16 懶人包：流程圖在、機率表最好／最糟兩列都在，各列機率加起來 100%
    expect(guideImages(doc.blocks)).toContain("/assets/guides/maple-leaf-shop/plan.svg");
    expect(exists("/assets/guides/maple-leaf-shop/plan.svg")).toBe(true);
    // v2.17 使用者：最上面放台服官方圖，不要全是字
    const official = guideImages(doc.blocks).filter(src => src.includes("/maple-leaf-shop/tw-"));
    expect(official.length).toBeGreaterThanOrEqual(7);
    for (const src of official) expect(exists(src), src).toBe(true);
    expect(guideImages(doc.blocks)[0]).toContain("/maple-leaf-shop/tw-");
    // v2.17 手機 375 寬放得下：只留 4 欄、第一欄短（共用表格第一欄不折行，長了會撐寬整張表）
    expect(text).toMatch(/^結果 機率 平均攻擊 收工$/m);
    expect(text).toMatch(/^最好 1\.8% \+17 DAY 9$/m);
    expect(text).toMatch(/^最糟 0\.008% \+0 DAY 21$/m);
    const paths = [...text.matchAll(/^(?:第 \d 把中|都沒中) ([\d.]+)%/gm)].map(m => +m[1]);
    expect(paths).toHaveLength(4);
    expect(paths.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
    expect(text).not.toContain("不會爆裝");
    // 台服公告商店圖：35 級楓葉之劍（1302020）100 枚
    expect(text).toMatch(/楓葉之劍 35 等 單手劍，不限職業；[^\n]* 100\s枚$/m);
    // 表格裡的道具小圖要 max-w-none，不然算欄寬時被當 0 寬，名字壓到隔壁欄
    const html = renderToString(createElement(GuideDocView, { doc, hero: null, jsonLd: [] }));
    const icon = /<td[^>]*><img [^>]*src="\/assets\/items\/1302020\.png"[^>]*>/.exec(html)![0];
    expect(icon).toContain("max-w-none");
  });

  it("文章連到 /db 單獨頁（道具、任務、怪物，v2.26 加 NPC、地圖、技能）的，那一頁都要真的有（v1.98，404 會被 Google 抓）", () => {
    const pages = {
      items: new Set(staticItemPages().map(item => String(item.id))),
      quests: new Set(staticQuests().map(quest => quest.id)),
      monsters: new Set(staticMonsters().map(monster => String(monster.id))),
      npcs: new Set(staticNpcs().map(npc => String(npc.id))),
      maps: new Set(staticAtlasMaps().map(map => String(map.id))),
      skills: new Set(staticSkills().map(skill => String(skill.id))),
    };
    expect(LINK_KINDS.test('"href":"/db/npcs/1"')).toBe(true);
    for (const doc of docs) {
      for (const [, kind, id] of JSON.stringify(doc.blocks).matchAll(LINK_KINDS)) {
        expect(pages[kind as keyof typeof pages].has(id), `${doc.slug} → /db/${kind}/${id}`).toBe(true);
      }
    }
  });

  const questLinks = (slug: string) => {
    const doc = docs.find(entry => entry.slug === slug)!;
    return { doc, text: guideText(doc.blocks), quests: new Set([...JSON.stringify(doc.blocks).matchAll(/"href":"\/db\/quests\/(\d+)"/g)].map(match => match[1])) };
  };

  it("冒險家的戒指（v1.98，使用者拍板 1A）：資料裡整條任務線每個任務都連到、經驗合計對得上、三枚戒指能力照資料", () => {
    const { doc, text, quests } = questLinks("adventurer-ring");
    expect(doc.category).toBe("任務");
    const chain = staticQuests().filter(quest => quest.n.includes("[冒險家的戒指]"));
    expect(chain.length).toBe(56);
    for (const quest of chain) expect(quests.has(quest.id), `${quest.id} ${quest.n}`).toBe(true);
    const exp = chain.reduce((sum, quest) => sum + (quest.exp ?? 0), 0);
    expect(text).toContain(`合計 ${exp.toLocaleString("en-US")}`);
    // 缺的那一步照實寫
    expect(chain.some(quest => quest.id === "69044")).toBe(false);
    expect(text).toContain("69044");
    const items = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/items.json"), "utf8")) as { id: number; eq?: Record<string, number> }[];
    const ring = (id: number) => items.find(item => item.id === id)!.eq!;
    expect(text).toContain(`生命 HP +${ring(1113372).incMHP}`);
    expect(text).toContain(`靈魂 MP +${ring(1113373).incMMP}`);
    expect(text).toContain(`調和 HP、MP 各 +${ring(1113374).incMHP}`);
  });

  it("勳章總整理（v1.98，使用者拍板 2A）：查得到取得方式的勳章全部列出、每個都連到給它的任務", () => {
    const { doc, text, quests } = questLinks("medals");
    const items = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/items.json"), "utf8")) as { id: number; n: string; s?: string; c: string; qr?: string[] }[];
    const medals = items.filter(item => item.c === "裝備" && item.s === "勳章");
    const known = medals.filter(item => item.qr?.length);
    expect(text).toContain(`${known.length} 個`);
    expect(text).toContain(`${medals.length} 個勳章`);
    expect(text).toContain(`另外 ${medals.length - known.length} 個`);
    const blocks = JSON.stringify(doc.blocks);
    for (const medal of known) {
      expect(blocks, medal.n).toContain(`"href":"/db/items/${medal.id}"`);
      expect(medal.qr!.some(id => quests.has(id)), `${medal.n} 的任務`).toBe(true);
    }
  });

  it("愛情象徵（v1.98，使用者拍板 3A）：五個都列、照實寫目前沒有地方收", () => {
    const { text, quests } = questLinks("love-symbols");
    for (const id of ["1115", "1116", "1117", "1118", "1119"]) expect(quests.has(id), id).toBe(true);
    expect(text).toContain("找不到任何任務、商店或 NPC 收它");
    // 真的沒有任務要交愛情象徵：之後有了，這篇要改
    const symbols = new Set([4031683, 4031684, 4031685, 4031686, 4031687, 4031692]);
    for (const quest of staticQuests()) for (const need of quest.needItems ?? []) expect(symbols.has(need.id), `${quest.id} 收愛情象徵了，改文章`).toBe(false);
  });

  it("頁面畫得出來：標題、主圖、麵包屑回攻略專區", () => {
    const doc = docs.find(entry => entry.slug === "third-job")!;
    const html = renderToString(createElement(GuideDocView, { doc, hero: { src: "/assets/guides/third-job/hero.webp", w: 1536, h: 864 }, jsonLd: [] }));
    expect(html).toContain(doc.title);
    expect(html).toContain('src="/assets/guides/third-job/hero.webp"');
    expect(html).toContain('href="/guides"');
  });
});
