/**
 * 地區任務懶人包的產生器（v2.28）：一區一篇，列這區所有一般任務；楓之島照接的順序、其他照等級分段，標必解跟系列文。
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

  it("必解只標每組推薦的主任務（不是整條系列每一個都標），維多利亞島 40 個以內", () => {
    const heads = new Set(staticGuideCommon().mustDo.map(rec => rec.q));
    const marked = [...md("victoria").table.matchAll(/\/db\/quests\/(\d+)\) \*\*必解\*\*/g)].map(match => match[1]);
    expect(marked.length).toBeLessThanOrEqual(40);
    for (const id of marked) expect(heads.has(id), id).toBe(true);
  });

  it("每段有必解的，表格上面先寫「這段先解」（最多 5 個，連到任務）", () => {
    const text = md("victoria").table;
    const sections = text.split(/^### /m).slice(1);
    for (const section of sections) {
      const hasMust = /\*\*必解\*\*/.test(section);
      const pick = /^這段先解：(.+)$/m.exec(section);
      expect(Boolean(pick), section.split("\n")[0]).toBe(hasMust);
      if (pick) expect((pick[1].match(/\]\(\/db\/quests\//g) ?? []).length).toBeLessThanOrEqual(5);
    }
  });

  it("隨機給一樣的獎勵寫「隨機一樣（共 N 種）」，不寫成全部都給（珍和黑肥肥）", () => {
    const row = md("victoria").table.split("\n").find(line => line.includes("/db/quests/2010)"))!;
    expect(row).toMatch(/隨機一樣（共 \d+ 種）/);
    expect(row).not.toMatch(/等 \d+ 樣/);
  });

  it("只有某些職業能接的任務名字後面寫（限法師）", () => {
    const row = md("victoria").table.split("\n").find(line => line.includes("/db/quests/2036)"))!;
    expect(row).toContain("（限法師）");
  });

  it("summary 寫這區幾個任務、幾個必解", () => {
    expect(md("victoria").summary).toMatch(/\*\*\d+ 個任務\*\*/);
    expect(md("victoria").summary).toContain("必解");
  });
});
