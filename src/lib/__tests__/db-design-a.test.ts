/**
 * 查資料照 A「攻略工具」（v1.99 第 4 輪，候選圖 docs/design-candidates/A-db.png、A-mob.png）：
 * 入口頁圖鑑橫排卡、工具收成清單卡；單筆頁數值格（小灰字在上、大粗數字在下、1px 線分）、刷怪點長條、小標字距加寬。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeoBars, SeoSection, SeoStats } from "@/components/SeoPage";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => fs.readFileSync(`${root}/${path}`, "utf8");

describe("查資料入口頁（v1.99）", () => {
  const page = read("app/db/page.tsx");

  it("排行與規劃、行情各收成一張清單卡，列之間 1px 線，右邊箭頭", () => {
    const list = page.match(/function EntryList[\s\S]*?\r?\n}\r?\n/)?.[0] ?? "";
    expect(list).toContain("divide-y divide-[color:var(--paper-edge)]");
    expect(page.match(/<EntryList entries=\{(TOOLS|MARKET)\} \/>/g)?.length).toBe(2);
    expect(page).toContain("ChevronRight");
  });

  it("不再滑過往上浮（A：卡片不動、只換底色）", () => {
    expect(page).not.toContain("hover:-translate-y");
  });

  it("小標是小字加寬字距", () => {
    expect(page).toContain("tracking-[0.1em]");
  });
});

describe("單筆頁數值格（v1.99）", () => {
  const rows: [string, string][] = [["等級", "50"], ["HP", "3,200"], ["經驗", "135"], ["命中", "75"], ["迴避", "18"], ["不死", "否"]];

  it("標籤在上、數字在下（大粗字、等寬）", () => {
    const html = renderToStaticMarkup(SeoStats({ rows }));
    expect(html).toMatch(/<dt[^>]*>等級<\/dt><dd[^>]*text-\[20px\][^>]*>50<\/dd>/);
    expect(html).toContain("tabular-nums");
  });

  it("accent 指定前幾格用橘字（怪物頁的等級、HP、經驗）", () => {
    const html = renderToStaticMarkup(SeoStats({ rows, accent: 3 }));
    const values = [...html.matchAll(/<dd class="([^"]*)">/g)].map(match => match[1]);
    expect(values.slice(0, 3).every(cls => cls.includes("text-[color:var(--maple)]"))).toBe(true);
    expect(values.slice(3).some(cls => cls.includes("--maple"))).toBe(false);
  });

  it("格子之間用 1px 線分，不是一塊灰底", () => {
    const html = renderToStaticMarkup(SeoStats({ rows }));
    expect(html).toContain("gap-px");
    expect(html).not.toContain("rounded-xl bg-[color:var(--paper-deep)] p-3");
  });

  it("6 格以上電腦版排 6 欄，少的排 3 欄（道具頁兩三格不會留一排空格）", () => {
    expect(renderToStaticMarkup(SeoStats({ rows }))).toContain("lg:grid-cols-6");
    expect(renderToStaticMarkup(SeoStats({ rows: rows.slice(0, 3) }))).not.toContain("lg:grid-cols-6");
    // 手機：6 格以上（怪物頁 11 格都是短數字）一排 3 格，不然要捲 6 排；少的（道具「普通（6）」這種長值）一排 2 格
    expect(renderToStaticMarkup(SeoStats({ rows }))).toMatch(/class="grid grid-cols-3 /);
    expect(renderToStaticMarkup(SeoStats({ rows: rows.slice(0, 3) }))).toMatch(/class="grid grid-cols-2 /);
  });
});

describe("數值格審查修正（v1.99）", () => {
  it("格線用 1px 擴散陰影：交叉點、外框旁都補滿，不會斷一格", () => {
    const html = renderToStaticMarkup(SeoStats({ rows: [["等級", "50"], ["HP", "3,200"]] }));
    expect(html).toContain("shadow-[0_0_0_1px_var(--paper-edge)]");
    expect(html).not.toContain("shadow-[1px_1px_0_0");
  });

  it("有長的值（「上衣＋褲裙（佔兩格）」、「672,000」）就算 6 格以上，手機也排 2 欄、電腦 4 欄", () => {
    const long: [string, string][] = [["需求等級", "50"], ["類型", "上衣＋褲裙（佔兩格）"], ["攻擊速度", "普通（6）"], ["力量", "3"], ["敏捷", "3"], ["防禦", "40"]];
    const html = renderToStaticMarkup(SeoStats({ rows: long }));
    expect(html).toMatch(/class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 /);
    const hp: [string, string][] = [["等級", "120"], ["HP", "672,000"], ["經驗", "1,500"], ["命中", "200"], ["迴避", "40"], ["不死", "否"]];
    expect(renderToStaticMarkup(SeoStats({ rows: hp }))).toMatch(/class="grid grid-cols-2 /);
  });

  it("長的值字小一號，不在格子裡斷成三四行", () => {
    const html = renderToStaticMarkup(SeoStats({ rows: [["類型", "上衣＋褲裙（佔兩格）"], ["力量", "3"]] }));
    const values = [...html.matchAll(/<dd class="([^"]*)">/g)].map(match => match[1]);
    expect(values[0]).toContain("text-[16px]");
    expect(values[1]).toContain("text-[20px]");
  });
});

describe("刷怪點長條：沒有數量的列（v1.99 審查）", () => {
  it("value 沒給或是 0：不畫長條、不寫 0", () => {
    const html = renderToStaticMarkup(
      SeoBars({ rows: [{ href: "/db/maps/1", text: "龍穴", value: 25, unit: "個刷怪點" }, { href: "/db/maps/2", text: "神秘之地", unit: "個刷怪點" }, { href: "/db/maps/3", text: "空地", value: 0, unit: "個刷怪點" }] }),
    );
    expect(html.match(/width:/g)?.length).toBe(1);
    expect(html).not.toContain(">0 個刷怪點");
    expect(html).not.toContain("undefined");
  });
});

describe("刷怪點長條（v1.99）", () => {
  it("每列一條，長度照最多的那張圖比例", () => {
    const html = renderToStaticMarkup(
      SeoBars({ rows: [{ href: "/db/maps/1", text: "龍穴", value: 25, unit: "個刷怪點" }, { href: "/db/maps/2", text: "龍族之地", value: 10, unit: "個刷怪點" }] }),
    );
    expect(html).toContain("width:100%");
    expect(html).toContain("width:40%");
    expect(html).toContain("25 個刷怪點");
  });
});

describe("小標（v1.99）", () => {
  it("12～13px、粗、字距加寬", () => {
    const html = renderToStaticMarkup(SeoSection({ title: "出沒地圖", children: null }));
    expect(html).toMatch(/<h2 class="[^"]*text-\[12px\][^"]*font-black[^"]*tracking-\[0\.1em\]/);
  });
});

describe("怪物頁（v1.99）", () => {
  const page = read("app/db/monsters/[id]/page.tsx");

  it("出沒地圖用長條、電腦版出沒地圖跟掉落物左右兩欄", () => {
    expect(page).toContain("<SeoBars");
    expect(page).toContain("lg:grid-cols-2");
    expect(page).toContain("accent={3}");
  });
});
