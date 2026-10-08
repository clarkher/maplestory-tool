/**
 * 技能卡（查資料・技能）的「各等級數值」表。
 * 前半是手寫的技能，後半直接讀 public/data/skills.json，確認每個技能都算得出來、不會整頁掛掉
 * （2026-10-07 神匠之魂 1003 等 7 個技能在 skills.json 沒有 levels，一點開整頁「This page couldn't load」）。
 *
 * 用法：npx vitest run src/lib/__tests__/skill-view.test.ts
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { skillLevels } from "@/lib/skill-view";
import type { Skill } from "@/lib/types";

describe("技能卡的各等級數值", () => {
  it("遊戲資料沒有分等級的資料（skills.json 沒有 levels，像神匠之魂）：沒有表，回 noLevels（卡片寫原因）", () => {
    expect(skillLevels({ labels: {} })).toEqual({ kind: "noLevels" });
  });

  it("levels 是空陣列也一樣是 noLevels（建置資料哪天改成保留空陣列）", () => {
    expect(skillLevels({ levels: [], labels: {} })).toEqual({ kind: "noLevels" });
  });

  it("有分等級、但每一級都沒有數值（像英雄共鳴）：沒有表，也不算 noLevels（不能寫「遊戲資料沒有」）", () => {
    expect(skillLevels({ levels: [{}], labels: {} })).toEqual({ kind: "noValues" });
  });

  it("中間某一級整列沒有數值：那一列照樣列出來、都是空的，後面的級數不往前移", () => {
    expect(skillLevels({ labels: { x: "效果" }, levels: [{ x: 1 }, {}, { x: 3 }] })).toEqual({
      kind: "table",
      fields: [{ key: "x", label: "效果" }],
      rows: [[1], [null], [3]],
    });
  });

  it("有數值：一級一列；欄位照第一次出現的順序、表頭用中文名（沒給的照原本的鍵）；後面幾級才有的數值也有一欄，前面幾級是空的；0 照列", () => {
    const result = skillLevels({
      labels: { mpCon: "消耗 MP", damage: "攻擊力" },
      levels: [
        { mpCon: 0, damage: 110 },
        { mpCon: 5, damage: 120, mobCount: 2 },
      ],
    });
    expect(result).toEqual({
      kind: "table",
      fields: [
        { key: "mpCon", label: "消耗 MP" },
        { key: "damage", label: "攻擊力" },
        { key: "mobCount", label: "mobCount" },
      ],
      rows: [
        [0, 110, null],
        [5, 120, 2],
      ],
    });
  });
});

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const skills = JSON.parse(fs.readFileSync(`${DATA}skills.json`, "utf8")) as Skill[];
const byId = (id: number) => skills.find(skill => skill.id === id);

describe("真資料：skills.json 每個技能的各等級數值", () => {
  it("每個技能都算得出來、不丟例外", () => {
    expect(skills.length).toBeGreaterThan(0);
    for (const skill of skills) {
      expect(() => skillLevels(skill), `${skill.id} ${skill.n}`).not.toThrow();
    }
  });

  it("神匠之魂、怪物騎乘、宇宙衝鋒、宇宙光束、肥肥／木妖／綠水靈的弱點攻擊：遊戲資料沒有分等級的資料，回 noLevels", () => {
    for (const id of [1003, 1004, 1014, 1015, 9000, 9001, 9002]) {
      const skill = byId(id);
      expect(skill, String(id)).toBeTruthy();
      expect(skillLevels(skill!), `${id} ${skill!.n}`).toEqual({ kind: "noLevels" });
    }
  });

  it("嫩寶丟擲術：3 級，消耗 MP 3／5／7、固定傷害 10／25／40（遊戲資料原值）", () => {
    expect(skillLevels(byId(1000)!)).toEqual({
      kind: "table",
      fields: [
        { key: "mpCon", label: "消耗 MP" },
        { key: "fixdamage", label: "固定傷害" },
      ],
      rows: [
        [3, 10],
        [5, 25],
        [7, 40],
      ],
    });
  });

  it("英雄共鳴：有 1 級但沒有數值，回 noValues（效果寫在「效果：」那行）", () => {
    expect(skillLevels(byId(1005)!)).toEqual({ kind: "noValues" });
  });
});
