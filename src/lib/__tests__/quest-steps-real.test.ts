/**
 * 真資料（public/data）跑一遍「一步一步怎麼解」：句子不能缺字、49 等以下不能推傑夫。
 * QUEST_STEP_STATS=1 會印出每個任務幾步的分佈（回報用）。
 */
import { describe, expect, it } from "vitest";
import { questLevel, questSteps, stepText } from "@/lib/quest-steps";
import { staticQuests, staticQuestStepContext } from "@/lib/static-data";

describe("questSteps（真資料）", () => {
  const ctx = staticQuestStepContext();
  const all = staticQuests().map(quest => ({ quest, steps: questSteps(quest, ctx) }));

  it("每個有接任務 NPC 的任務都有「去哪接」", () => {
    const missing = all.filter(({ quest, steps }) => quest.sNpc && steps[0]?.kind !== "start").map(({ quest }) => quest.id);
    expect(missing).toEqual([]);
  });

  it("沒有缺字的句子（找的、到找、空連結）", () => {
    const bad = all.flatMap(({ quest, steps }) =>
      steps.flatMap(step => [
        ...stepText(step).filter(text => /找的|到找|在的|：。|、。|^。/.test(text)).map(text => `${quest.id} ${text}`),
        ...step.lines.flat().flatMap(seg => (typeof seg !== "string" && !seg.t.trim() ? [`${quest.id} 空連結 ${seg.href}`] : [])),
      ]),
    );
    expect(bad).toEqual([]);
  });

  it("49 等以下（含沒寫等級）的任務不出現傑夫路線", () => {
    const bad = all
      .filter(({ quest }) => questLevel(quest) < 50)
      .flatMap(({ quest, steps }) => steps.flatMap(stepText).filter(text => text.includes("找傑夫")).map(text => `${quest.id} ${text}`));
    expect(bad).toEqual([]);
  });

  it("道具哪隻怪掉：同一區（接任務那張圖的世界地圖）的怪排前面，不叫天空之城的人回維多利亞島（波達「妖精的號角」）", () => {
    const found = all.find(({ quest }) => quest.id === "3054")!;
    const items = found.steps.find(step => step.kind === "items")!;
    const region = ctx.maps["200000000"].rg;
    for (const line of items.lines) {
      const firstMap = line.find((seg): seg is { t: string; href: string } => typeof seg !== "string" && seg.href.startsWith("/db/maps/"));
      if (!firstMap) continue;
      const id = firstMap.href.split("/").pop()!;
      const record = ctx.maps[id];
      const rg = record.rg ?? ctx.maps[String(record.ret)]?.rg;
      expect(rg, `${stepText(items).join(" / ")}`).toBe(region);
    }
  });

  it("要打的怪：同一區有這隻怪就先寫同一區的圖（楓之島麥加要的綠水靈、肥肥不叫人去維多利亞島）", () => {
    const rgOf = (id: string) => ctx.maps[id]?.rg ?? ctx.maps[String(ctx.maps[id]?.ret)]?.rg;
    for (const id of ["1043", "1044", "1041", "1042"]) {
      const mobs = all.find(({ quest }) => quest.id === id)!.steps.find(step => step.kind === "mobs")!;
      const firstMap = mobs.lines[0].find((seg): seg is { t: string; href: string } => typeof seg !== "string" && seg.href.startsWith("/db/maps/"));
      expect(firstMap && rgOf(firstMap.href.split("/").pop()!), `${id} ${stepText(mobs).join(" / ")}`).toBe("WorldMap000");
    }
  });

  it("別的任務會給：不列開發測試用的任務（9999）", () => {
    const bad = all.filter(({ steps }) => steps.some(step => step.lines.flat().some(seg => typeof seg !== "string" && seg.href === "/db/quests/9999"))).map(({ quest }) => quest.id);
    expect(bad).toEqual([]);
  });

  it.runIf(process.env.QUEST_STEP_STATS)("統計", () => {
    const count = new Map<number, number>();
    const kinds = new Map<string, number>();
    for (const { steps } of all) {
      count.set(steps.length, (count.get(steps.length) ?? 0) + 1);
      for (const step of steps) kinds.set(step.kind, (kinds.get(step.kind) ?? 0) + 1);
    }
    const routes = all.filter(({ steps }) => steps[0]?.kind === "start" && steps[0].lines.length > 1).length;
    for (const id of (process.env.QUEST_STEP_STATS ?? "").split(",").filter(Boolean)) {
      const found = all.find(({ quest }) => quest.id === id);
      if (found) console.log(id, found.steps.map(step => `${step.title}｜${stepText(step).join(" / ")}`).join("\n"));
    }
    console.log(JSON.stringify({ quests: all.length, bySteps: Object.fromEntries([...count].sort((a, b) => a[0] - b[0])), kinds: Object.fromEntries(kinds), startWithRoute: routes, withGo: all.filter(({ steps }) => steps.some(step => step.go)).length }));
  });
});
