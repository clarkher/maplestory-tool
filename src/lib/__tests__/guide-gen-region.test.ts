/**
 * 地區任務懶人包的產生器（v2.27）：一區一篇，列這區所有一般任務；楓之島照接的順序、其他照等級分段，標必解跟系列文。
 */
import { describe, expect, it } from "vitest";
import { isLineQuest, questLines } from "@/lib/guide-gen/quest-lines";
import { REGIONS, regionMarkdown } from "@/lib/guide-gen/region-quests";
import { mustDoIndex } from "@/lib/route-planner";
import { staticGuideCommon, staticQuests } from "@/lib/static-data";

const quests = staticQuests();
const lines = questLines(quests);
const mustDo = mustDoIndex(staticGuideCommon());
const region = (slug: string) => REGIONS.find(entry => entry.slug === slug)!;
const linked = new Set(["3053"]);
const lineHref = (lineId: string) => (linked.has(lineId) ? `/guides/quest-line-${lineId}` : undefined);
const md = (slug: string) => regionMarkdown(region(slug), quests, lines, mustDo, lineHref);
const rows = (text: string) => [...text.matchAll(/^\| \[([^\]]+)\]\(\/db\/quests\/(\d+)\)/gm)].map(match => match[2]);

describe("regionMarkdown", () => {
  it("三區：楓之島、維多利亞島、冰原雪域", () => {
    expect(REGIONS.map(entry => entry.cat)).toEqual(["楓之島", "維多利亞島", "冰原雪域"]);
  });

  it("每區列的任務＝資料裡這區的一般任務，不多不少不重複", () => {
    for (const entry of REGIONS) {
      const want = quests.filter(quest => quest.cat === entry.cat && isLineQuest(quest)).map(quest => quest.id).sort();
      const got = rows(md(entry.slug).table);
      expect(new Set(got).size, entry.cat).toBe(got.length);
      expect([...got].sort(), entry.cat).toEqual(want);
    }
  });

  it("楓之島照接的順序：前置排在前面", () => {
    const order = rows(md("maple-island").table);
    const index = new Map(order.map((id, i) => [id, i]));
    for (const quest of quests.filter(entry => index.has(entry.id))) {
      for (const pre of quest.pre ?? []) if (index.has(pre)) expect(index.get(pre)!, quest.n).toBeLessThan(index.get(quest.id)!);
    }
  });

  it("維多利亞島照等級分段：有「不限等級」段、沒有「0 等」", () => {
    const text = md("victoria").table;
    expect(text).toContain("### 不限等級");
    expect(text).toMatch(/### 1～10 等/);
    expect(text).not.toMatch(/(^|[^\d])0 等/);
  });

  it("系列有文章的才連過去，沒有的只寫名字", () => {
    const text = md("el-nath").table;
    expect(text).toContain("](/guides/quest-line-3053)");
    expect(text).not.toMatch(/\/guides\/quest-line-(?!3053)/);
  });

  it("必解只標在必解索引裡有的任務", () => {
    for (const entry of REGIONS) {
      for (const [, id] of md(entry.slug).table.matchAll(/\/db\/quests\/(\d+)\)[^\n]*\*\*必解\*\*/g)) expect(mustDo.has(id), id).toBe(true);
    }
  });

  it("summary 寫這區幾個任務、幾個必解", () => {
    expect(md("victoria").summary).toMatch(/\*\*\d+ 個任務\*\*/);
    expect(md("victoria").summary).toContain("必解");
  });
});
