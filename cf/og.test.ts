/**
 * 每頁自己的分享預覽圖（v2.31）：建置後讀每頁 html 的 og:image，指到 /og/ 的就照那頁的 og:title、og:description 產圖，
 * 配那筆資料的遊戲圖（怪、NPC、道具、技能、地圖；任務用接任務的 NPC）。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error 純 js 腳本
import { ogImagePath, readOgMeta, spriteFor, wrapText, renderCard, buildOgImages } from "../scripts/og/build-og.mjs";
import { ogImageFor } from "../src/lib/seo";

describe("網址跟圖檔對得上", () => {
  it("頁面寫的 og:image 跟產圖程式寫的檔名同一套", () => {
    expect(ogImageFor("/db/monsters/1210102")).toBe("/og/db/monsters/1210102.jpg");
    expect(ogImageFor("/plan/damage")).toBe("/og/plan/damage.jpg");
    expect(ogImagePath("/og/db/monsters/1210102.jpg")).toBe(path.join("og", "db", "monsters", "1210102.jpg"));
  });
  it("首頁、不是 /og/ 的（攻略文主圖）不產", () => {
    expect(ogImagePath("/og.jpg")).toBeNull();
    expect(ogImagePath("/assets/guides/quests-el-nath/hero.jpg")).toBeNull();
    expect(ogImagePath("https://maplehelper.tw/og/db/items/1302000.jpg")).toBe(path.join("og", "db", "items", "1302000.jpg"));
  });
});

describe("讀 html 的 og 標籤", () => {
  const html = `<head><meta property="og:title" content="菇菇寶貝｜楓谷幫手"/><meta property="og:description" content="菇菇寶貝是 Lv.8 的怪物&amp;好打。"/><meta property="og:image" content="https://maplehelper.tw/og/db/monsters/1210102.jpg"/></head>`;
  it("標題拿掉站名、描述解 html 跳脫", () => {
    expect(readOgMeta(html)).toEqual({ title: "菇菇寶貝", description: "菇菇寶貝是 Lv.8 的怪物&好打。", image: "https://maplehelper.tw/og/db/monsters/1210102.jpg" });
  });
  it("標題有副標（｜分段）只留第一段當大標，其他當副標", () => {
    expect(readOgMeta(`<meta property="og:title" content="傷害計算機｜兩套點法並排比｜楓谷幫手"/>`).title).toBe("傷害計算機");
    expect(readOgMeta(`<meta property="og:title" content="傷害計算機｜兩套點法並排比｜楓谷幫手"/>`).subtitle).toBe("兩套點法並排比");
  });
});

describe("配哪張遊戲圖", () => {
  const quests = [{ id: "2136", sNpc: { id: 1012100 } }];
  it("怪、NPC、道具、技能、地圖各用自己的圖；任務用接任務的 NPC", () => {
    expect(spriteFor("/db/monsters/1210102", quests)).toEqual({ kind: "sprite", files: ["assets/monster_frames/1210102.png", "assets/monsters/1210102.png"] });
    expect(spriteFor("/db/npcs/1012100", quests)?.files).toEqual(["assets/npcs/1012100.png"]);
    expect(spriteFor("/db/items/1302000", quests)?.files).toEqual(["assets/items/1302000.png"]);
    expect(spriteFor("/db/skills/1001004", quests)?.files).toEqual(["assets/skills/1001004.png"]);
    expect(spriteFor("/db/maps/100000000", quests)).toEqual({ kind: "map", files: ["assets/map_renders/100000000.webp"] });
    expect(spriteFor("/db/quests/2136", quests)?.files).toEqual(["assets/npcs/1012100.png"]);
  });
  it("工具頁、清單頁沒有遊戲圖", () => {
    expect(spriteFor("/plan/damage", quests)).toBeNull();
    expect(spriteFor("/db/quests/9", quests)).toBeNull();
  });
});

describe("折行", () => {
  const measure = (s: string) => s.length * 10;
  it("照寬度折、超過行數最後一行加…", () => {
    expect(wrapText("一二三四五六七八九十", 50, 3, measure)).toEqual(["一二三四五", "六七八九十"]);
    expect(wrapText("一二三四五六七八九十一二三四五六", 50, 2, measure)).toEqual(["一二三四五", "六七八九…"]);
  });
  it("左括號不掛在行尾，跟後面的字一起換行", () => {
    expect(wrapText("一二三四（五六）", 50, 3, measure)).toEqual(["一二三四", "（五六）"]);
    expect(wrapText("一二三四「五」", 50, 3, measure)).toEqual(["一二三四", "「五」"]);
  });
  it("句讀不放行首：擠在上一行尾巴", () => {
    expect(wrapText("一二三四五、六", 50, 3, measure)).toEqual(["一二三四五、", "六"]);
    expect(wrapText("一二三四五）。六", 50, 3, measure)).toEqual(["一二三四五）。", "六"]);
  });
  it("英數字串不從中間切（Lv.8、760,500）", () => {
    expect(wrapText("怪物Lv.80好", 50, 3, measure)).toEqual(["怪物", "Lv.80", "好"]);
  });
});

describe("真的畫出來", () => {
  it("1200×630 的 jpg，200KB 內", async () => {
    const buf: Buffer = await renderCard({ title: "菇菇寶貝", subtitle: "", description: "菇菇寶貝是 Lv.8 的怪物，HP 80、經驗 15。", label: "怪物" }, { kind: "sprite", files: ["assets/monster_frames/1210102.png"] }, path.resolve("public"));
    expect(buf.subarray(0, 2).toString("hex")).toBe("ffd8");
    expect(buf.length).toBeLessThan(200 * 1024);
    const sharp = (await import("sharp")).default;
    expect(await sharp(buf).metadata()).toMatchObject({ width: 1200, height: 630 });
  });

  it("掃 out/：有指到 /og/ 的頁才產，產在 out/og/...", async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "og-test-"));
    fs.mkdirSync(path.join(out, "db", "monsters"), { recursive: true });
    fs.mkdirSync(path.join(out, "guides"), { recursive: true });
    fs.mkdirSync(path.join(out, "data"), { recursive: true });
    fs.writeFileSync(path.join(out, "data", "quests.json"), "[]");
    fs.writeFileSync(path.join(out, "db", "monsters", "1210102.html"), `<meta property="og:title" content="菇菇寶貝｜楓谷幫手"/><meta property="og:description" content="Lv.8"/><meta property="og:image" content="https://maplehelper.tw/og/db/monsters/1210102.jpg"/>`);
    fs.writeFileSync(path.join(out, "guides", "a.html"), `<meta property="og:title" content="文｜楓谷幫手"/><meta property="og:image" content="https://maplehelper.tw/assets/guides/a/hero.jpg"/>`);
    const made = await buildOgImages(out, { assetsDir: path.resolve("public") });
    expect(made).toBe(1);
    expect(fs.existsSync(path.join(out, "og", "db", "monsters", "1210102.jpg"))).toBe(true);
    fs.rmSync(out, { recursive: true, force: true });
  });
});
