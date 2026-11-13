/**
 * 產生區塊（v2.26）：文章 md 裡 <!-- gen:<key> --> 到 <!-- /gen --> 之間是程式從資料產的表格，外面是人寫的字。
 * 資料更新後沒重跑 npm run guide:gen，這裡會紅（不然文章表格跟查資料頁對不上）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { expectedSections, GEN_PREFIXES } from "@/lib/guide-gen/expected";
import { readGenSections, replaceGenSections } from "@/lib/guide-gen/sections";
import { articleSkeleton } from "@/lib/guide-gen/skeleton";
import { parseGuide } from "@/lib/guide-markdown";

const DIR = fileURLToPath(new URL("../../content/guides/", import.meta.url));

describe("replaceGenSections／readGenSections", () => {
  const md = ["# 標題", "", "人寫的開頭", "", "<!-- gen:summary -->", "", "舊的", "", "<!-- /gen -->", "", "人寫的結尾", ""].join("\n");

  it("只換標記裡面，外面一字不動", () => {
    const { md: out, missing } = replaceGenSections(md, { summary: "新的 | 表格" });
    expect(out).toBe(md.replace("舊的", "新的 | 表格"));
    expect(missing).toEqual([]);
  });

  it("CRLF 也行，換完還是 CRLF", () => {
    const { md: out } = replaceGenSections(md.replace(/\n/g, "\r\n"), { summary: "新的" });
    expect(out).toBe(md.replace("舊的", "新的").replace(/\n/g, "\r\n"));
  });

  it("md 裡有標記但沒給內容的列進 missing，原文不動", () => {
    const { md: out, missing } = replaceGenSections(md, {});
    expect(out).toBe(md);
    expect(missing).toEqual(["summary"]);
  });

  it("讀得出每個區塊（頭尾空行拿掉）", () => {
    expect(readGenSections(md.replace(/\n/g, "\r\n"))).toEqual({ summary: "舊的" });
  });
});

describe("文章裡的產生區塊跟資料一致", () => {
  const files = fs.readdirSync(DIR).filter(file => file.endsWith(".md") && GEN_PREFIXES.some(prefix => file.startsWith(prefix)));

  it("不是這三種的文章 expectedSections 回 null", () => {
    expect(expectedSections("medals")).toBeNull();
  });

  for (const file of files) {
    it(file, () => {
      const slug = file.slice(0, -3);
      const want = expectedSections(slug);
      expect(want, `${slug}：對不到系列／地區／職業，網址打錯了？`).not.toBeNull();
      const text = fs.readFileSync(path.join(DIR, file), "utf8");
      expect(text, `${slug} 還有骨架沒寫完的「<!-- 寫」`).not.toContain("<!-- 寫");
      const got = readGenSections(text);
      for (const key of Object.keys(want!)) {
        expect(got[key], `${slug} 的 gen:${key} 跟現在資料不一樣，跑 npm run guide:gen 重產`).toBe(want![key]);
      }
    });
  }
});

describe("articleSkeleton：新文章骨架（npm run guide:gen -- new …）", () => {
  it("三種都產得出：網址、標題有楓之谷經典版、標記齊、填完表格讀得成文章", () => {
    for (const [kind, key, slug] of [["quest-line", "3053", "quest-line-3053"], ["quests", "victoria", "quests-victoria"], ["skill-build", "130", "skill-build-spearman"]] as const) {
      const skeleton = articleSkeleton(kind, key, "2026-11-13");
      expect(skeleton.slug).toBe(slug);
      const want = expectedSections(slug)!;
      expect(Object.keys(readGenSections(skeleton.md)).sort()).toEqual(Object.keys(want).sort());
      const doc = parseGuide(slug, replaceGenSections(skeleton.md, want).md);
      expect(doc.title).toContain("楓之谷經典版");
    }
  });

  it("對不到的系列、地區、職業丟錯", () => {
    expect(() => articleSkeleton("quest-line", "999999", "2026-11-13")).toThrow();
    expect(() => articleSkeleton("skill-build", "100", "2026-11-13")).toThrow();
  });
});
