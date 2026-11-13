/**
 * 系列任務文章的產生器（v2.26，docs/superpowers/specs/2026-11-13-article-batch-quests-builds-design.md）：
 * 用前置任務把一般任務串成系列，5 個以上或有人搜的才收；主線照前置順序，分叉另成段。
 */
import { describe, expect, it } from "vitest";
import { questLineMarkdown, questLines, QUEST_LINE_EXTRA, type QuestLine } from "@/lib/guide-gen/quest-lines";
import { staticQuestStepContext, staticQuests } from "@/lib/static-data";

const quests = staticQuests();
const lines = questLines(quests);
const lineOf = (questId: string) => lines.find(line => [...line.quests, ...line.branches.flatMap(branch => branch.quests)].some(quest => quest.id === questId));
const all = (line: QuestLine) => [...line.quests, ...line.branches.flatMap(branch => branch.quests)];

describe("questLines：挑哪些系列", () => {
  it("波達的請求（3059）那條有 11 個任務", () => {
    const line = lineOf("3059")!;
    expect(line).toBeDefined();
    expect(all(line)).toHaveLength(11);
  });

  it("萬聖節、冒險家的戒指、活動、組隊、稱號、職業、其他任務都不在任何系列", () => {
    const banned = lines.flatMap(all).filter(quest => /萬聖節|冒險家的戒指/.test(quest.n) || ["活動", "組隊任務", "稱號", "職業", "其他任務"].includes(quest.cat));
    expect(banned).toEqual([]);
  });

  it("不到 5 個但有人搜的也收：珍的挑戰、阿勒斯（說服長老斯坦）、酋長蓋房子", () => {
    for (const id of QUEST_LINE_EXTRA) expect(lineOf(id), id).toBeDefined();
    expect(all(lineOf("2015")!).map(quest => quest.n)).toContain("說服長老斯坦");
  });

  it("其他系列都至少 5 個任務", () => {
    for (const line of lines) {
      if (QUEST_LINE_EXTRA.some(id => all(line).some(quest => quest.id === id))) continue;
      expect(all(line).length, line.name).toBeGreaterThanOrEqual(5);
    }
  });

  it("每個系列的任務（主線＋分支）不重複，跨系列也不重複", () => {
    const ids = lines.flatMap(all).map(quest => quest.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("主線照前置順序：每個任務的系列內前置都排在它前面", () => {
    for (const line of lines) {
      const order = new Map(line.quests.map((quest, index) => [quest.id, index]));
      for (const [index, quest] of line.quests.entries()) {
        for (const pre of quest.pre ?? []) if (order.has(pre)) expect(order.get(pre)!, `${line.name}：${quest.n}`).toBeLessThan(index);
      }
    }
  });

  it("古代之書 32 個是一直線，沒有分支", () => {
    expect(lineOf("3004")!.quests).toHaveLength(32);
    expect(lineOf("3004")!.branches).toEqual([]);
  });

  it("神秘書的線索那條會分叉：分支不為空，每個分支的 after 都在本系列內", () => {
    const line = lineOf("2019")!;
    expect(line.branches.length).toBeGreaterThan(0);
    const ids = new Set(all(line).map(quest => quest.id));
    for (const branch of line.branches) if (branch.after) expect(ids.has(branch.after), branch.after).toBe(true);
  });

  it("兩個起點都要先做的（木妖好可怕、研究菇菇怪物 → 尋找女兒）：兩個起點都在主線、排在尋找女兒前面", () => {
    const order = lineOf("2092")!.quests.map(quest => quest.id);
    for (const head of ["2082", "2088"]) expect(order.indexOf(head), head).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("2092")).toBeGreaterThan(Math.max(order.indexOf("2082"), order.indexOf("2088")));
  });

  it("同一個任務後面分出去的合成一段（謠言的真相後面 5 個不分 5 段）", () => {
    const afters = lineOf("2144")!.branches.map(branch => branch.after).filter(Boolean);
    expect(new Set(afters).size).toBe(afters.length);
  });

  it("轉職那串（推薦職業、法師轉職）不收", () => {
    expect(lines.flatMap(all).filter(quest => /^推薦職業$|轉職$/.test(quest.n))).toEqual([]);
  });

  it("系列網址用第一個任務 id、總經驗是全部任務加起來", () => {
    for (const line of lines) {
      expect(line.id).toBe(line.quests[0].id);
      expect(line.totalExp).toBe(all(line).reduce((sum, quest) => sum + (quest.exp ?? 0), 0));
    }
  });
});

describe("questLineMarkdown：寫進文章的表格段落", () => {
  const ctx = staticQuestStepContext();
  const md = questLineMarkdown(lineOf("3059")!, ctx);

  it("summary 寫幾個任務、總經驗", () => {
    expect(md.summary).toContain("11 個任務");
    expect(md.summary).toMatch(/總經驗 [\d,]+/);
  });

  it("steps 每個任務一個 ###、最後有遊戲資料標籤", () => {
    expect(md.steps.match(/^### /gm)).toHaveLength(11);
    expect(md.steps).toContain("{{src:game}}");
  });

  it("沒寫接取等級的寫「不限等級」，不寫 0 等", () => {
    const line = lines.find(entry => all(entry).some(quest => quest.minLv === undefined))!;
    const text = Object.values(questLineMarkdown(line, ctx)).join("\n");
    expect(text).toContain("不限等級");
    expect(text).not.toMatch(/(^|[^\d])0 等/);
  });

  it("連結都是單獨頁給的（沒單獨頁的不連）", () => {
    for (const line of lines.slice(0, 8)) {
      const text = Object.values(questLineMarkdown(line, ctx)).join("\n");
      for (const [, href] of text.matchAll(/\]\(([^)]+)\)/g)) expect(href, line.name).toMatch(/^\/(db|go|guides)\b/);
    }
  });
});
