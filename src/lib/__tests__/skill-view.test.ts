/**
 * 技能卡（查資料・技能）的「效果」那一行跟「各等級數值」。
 * 前半是手寫的技能，後半直接讀 public/data/skills.json，確認每個技能都算得出來、不會整頁掛掉
 * （2026-10-07 神匠之魂 1003 等 7 個技能在 skills.json 沒有 levels，一點開整頁「This page couldn't load」），
 * 也不會露出 #mpCon 這種樣板代號（2026-10-08 使用者選 B：效果行改成滿級那一級的遊戲原文）。
 *
 * 用法：npx vitest run src/lib/__tests__/skill-view.test.ts
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { skillEffect, skillLevels } from "@/lib/skill-view";
import type { Skill } from "@/lib/types";

describe("技能卡的各等級數值", () => {
  it("遊戲資料沒有分等級的資料（skills.json 沒有 levels，像神匠之魂）：沒有表，回 noLevels（卡片寫原因）", () => {
    expect(skillLevels({ labels: {} })).toEqual({ kind: "noLevels" });
  });

  it("levels 是空陣列也一樣是 noLevels（建置資料哪天改成保留空陣列）", () => {
    expect(skillLevels({ levels: [], labels: {} })).toEqual({ kind: "noLevels" });
  });

  it("只有一級、沒有數值（像英雄共鳴）：沒有表，也不算 noLevels（效果寫在「效果：」那行，不能寫「遊戲資料沒有」）", () => {
    expect(skillLevels({ levels: [{}], labels: {} })).toEqual({ kind: "noValues" });
  });

  it("中間某一級整列沒有數值、也沒有原文：那一列照樣列出來、都是空的，後面的級數不往前移", () => {
    expect(skillLevels({ labels: { x: "效果" }, levels: [{ x: 1 }, {}, { x: 3 }] })).toEqual({
      kind: "table",
      fields: [{ key: "x", label: "效果" }],
      rows: [[1], [null], [3]],
    });
  });

  it("整列沒有數值、有那一級的原文（隱身術 20 級）：rowText 帶那一句（畫面整列放原文）；有數值的列就算有原文也不帶", () => {
    expect(
      skillLevels({
        labels: { x: "效果" },
        levels: [{ x: 1 }, {}, { x: 3 }],
        levelText: { 2: "消耗MP5, 隱身200秒，移動速度 正常", 3: "滿級那一句" },
      }),
    ).toEqual({
      kind: "table",
      fields: [{ key: "x", label: "效果" }],
      rows: [[1], [null], [3]],
      rowText: { 2: "消耗MP5, 隱身200秒，移動速度 正常" },
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

  it("好幾級、每一級都沒有數值、有每一級的原文（槍連擊）：一級一列放原文", () => {
    expect(
      skillLevels({
        levels: [{}, {}, {}],
        levelText: {
          1: "消耗MP10, 攻擊力55%, 對一名怪物兩次攻擊",
          2: "消耗MP10, 攻擊力60%, 對一名怪物兩次攻擊",
          3: "消耗MP10, 攻擊力65%, 對一名怪物兩次攻擊",
        },
      }),
    ).toEqual({
      kind: "text",
      rows: ["消耗MP10, 攻擊力55%, 對一名怪物兩次攻擊", "消耗MP10, 攻擊力60%, 對一名怪物兩次攻擊", "消耗MP10, 攻擊力65%, 對一名怪物兩次攻擊"],
    });
  });

  it("好幾級沒有數值、其中一級沒有原文：那一列是 null（畫面寫「—」），後面的級數不往前移", () => {
    expect(skillLevels({ levels: [{}, {}, {}], levelText: { 1: "第一級", 3: "第三級" } })).toEqual({
      kind: "text",
      rows: ["第一級", null, "第三級"],
    });
  });

  it("好幾級沒有數值、每一級的原文都一樣（魔力淨化）：不列一排一樣的字，回 sameText 跟級數", () => {
    expect(
      skillLevels({ levels: [{}, {}, {}], levelText: { 1: "增加一定量的MP的恢復量", 2: "增加一定量的MP的恢復量", 3: "增加一定量的MP的恢復量" } }),
    ).toEqual({ kind: "sameText", count: 3 });
  });

  it("好幾級沒有數值、也沒有任何原文：回 noLevels（這時「遊戲資料沒有每一級的數值」才是真的）", () => {
    expect(skillLevels({ levels: [{}, {}] })).toEqual({ kind: "noLevels" });
  });
});

describe("技能卡的效果那一行", () => {
  it("效果樣板沒有代號（英雄共鳴）：照原句，標「效果」", () => {
    expect(skillEffect({ formula: "消耗MP 30，在40分鐘內提升物理攻擊力與魔法攻擊力4%", levels: [{}] })).toEqual({
      label: "效果",
      text: "消耗MP 30，在40分鐘內提升物理攻擊力與魔法攻擊力4%",
    });
  });

  it("樣板有 #代號（劍氣縱橫）：換成滿級那一級的遊戲原文，標「滿級效果（N 級）」", () => {
    expect(
      skillEffect({
        formula: "消耗HP#hpCon和MP#mpCon, 攻擊力#damage%",
        levels: [{ hpCon: 8 }, { hpCon: 12 }, { hpCon: 16 }],
        levelText: { 3: "消耗HP16和MP14, 攻擊力130%" },
      }),
    ).toEqual({ label: "滿級效果（3 級）", text: "消耗HP16和MP14, 攻擊力130%" });
  });

  it("樣板有代號、找不到滿級那一級的原文：不放這一行，不露出代號", () => {
    expect(skillEffect({ formula: "消耗MP#mpCon", levels: [{}, {}], levelText: { 1: "消耗MP10" } })).toBeNull();
  });

  it("沒有樣板（蓄能激發）但有滿級原文：一樣放滿級效果", () => {
    expect(skillEffect({ formula: "", levels: [{}, {}], levelText: { 1: "第一級", 2: "發動時持續時間為50秒" } })).toEqual({
      label: "滿級效果（2 級）",
      text: "發動時持續時間為50秒",
    });
  });

  it("沒有樣板、也沒有分等級的資料（神匠之魂）：不放這一行", () => {
    expect(skillEffect({})).toBeNull();
  });
});

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const skills = JSON.parse(fs.readFileSync(`${DATA}skills.json`, "utf8")) as Skill[];
const byId = (id: number) => {
  const skill = skills.find(item => item.id === id);
  if (!skill) throw new Error(`skills.json 沒有技能 ${id}`);
  return skill;
};

describe("真資料：skills.json 每個技能的效果與各等級數值", () => {
  it("每個技能都算得出來、不丟例外", () => {
    expect(skills.length).toBeGreaterThan(0);
    for (const skill of skills) {
      expect(() => skillLevels(skill), `${skill.id} ${skill.n}`).not.toThrow();
      expect(() => skillEffect(skill), `${skill.id} ${skill.n}`).not.toThrow();
    }
  });

  it("神匠之魂、怪物騎乘、宇宙衝鋒、宇宙光束、肥肥／木妖／綠水靈的弱點攻擊：遊戲資料沒有分等級的資料，回 noLevels", () => {
    for (const id of [1003, 1004, 1014, 1015, 9000, 9001, 9002]) {
      expect(skillLevels(byId(id)), `${id} ${byId(id).n}`).toEqual({ kind: "noLevels" });
    }
  });

  it("嫩寶丟擲術：3 級，消耗 MP 3／5／7、固定傷害 10／25／40（遊戲資料原值）", () => {
    expect(skillLevels(byId(1000))).toEqual({
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

  it("英雄共鳴：有 1 級但沒有數值，回 noValues；效果行照原句", () => {
    expect(skillLevels(byId(1005))).toEqual({ kind: "noValues" });
    expect(skillEffect(byId(1005))).toEqual({ label: "效果", text: "消耗MP 30，在40分鐘內提升物理攻擊力與魔法攻擊力4%" });
  });

  it("槍連擊：30 級一級一列放遊戲原文（第 1 級、第 30 級照抄上游），效果行是滿級那一句", () => {
    const levels = skillLevels(byId(1311001));
    expect(levels.kind).toBe("text");
    if (levels.kind !== "text") return;
    expect(levels.rows).toHaveLength(30);
    expect(levels.rows[0]).toBe("消耗MP10, 攻擊力55%, 對一名怪物兩次攻擊");
    expect(levels.rows[29]).toBe("消耗MP24, 攻擊力170%, 對三名怪物三次攻擊");
    expect(skillEffect(byId(1311001))).toEqual({ label: "滿級效果（30 級）", text: "消耗MP24, 攻擊力170%, 對三名怪物三次攻擊" });
  });

  it("矛連擊、極速詠唱（火毒、冰雷）、分身術、衝鋒、蓄能激發：每一級都有原文可列（上游 values 是空的）", () => {
    const expected: Array<[number, number]> = [
      [1311002, 30],
      [2111005, 20],
      [2211005, 20],
      [4211004, 30],
      [5001005, 10],
      [5110001, 40],
    ];
    for (const [id, count] of expected) {
      const levels = skillLevels(byId(id));
      expect(levels.kind, `${id} ${byId(id).n}`).toBe("text");
      if (levels.kind !== "text") continue;
      expect(levels.rows, `${id} ${byId(id).n}`).toHaveLength(count);
      expect(levels.rows.every(text => typeof text === "string" && text.length > 0), `${id} ${byId(id).n}`).toBe(true);
    }
  });

  it("魔力淨化：16 級的原文都是同一句，回 sameText；效果行就是那一句", () => {
    expect(skillLevels(byId(2000000))).toEqual({ kind: "sameText", count: 16 });
    expect(skillEffect(byId(2000000))).toEqual({ label: "效果", text: "增加一定量的MP的恢復量" });
  });

  it("隱身術：20 級整列沒數值，那一列放遊戲原文；效果行是滿級那一句", () => {
    const levels = skillLevels(byId(4001003));
    expect(levels.kind).toBe("table");
    if (levels.kind !== "table") return;
    expect(levels.rows).toHaveLength(20);
    expect(levels.rowText).toEqual({ 20: "消耗MP5, 隱身200秒，移動速度 正常" });
    expect(skillEffect(byId(4001003))).toEqual({ label: "滿級效果（20 級）", text: "消耗MP5, 隱身200秒，移動速度 正常" });
  });

  it("劍氣縱橫：效果行是「滿級效果（20 級）：消耗HP16和MP14, 攻擊力130%」，說明尾巴的「#」拿掉了", () => {
    expect(skillEffect(byId(1001005))).toEqual({ label: "滿級效果（20 級）", text: "消耗HP16和MP14, 攻擊力130%" });
    expect(byId(1001005).desc).toBe("[最高等級：20] 消耗HP、MP以作為裝備的武器對周圍的敵人進行整體攻擊。 所需技能：魔天一擊1等級以上");
  });

  it("效果樣板有 #代號的技能，每一個都換得到滿級原文（沒有一個整行不見）", () => {
    const withToken = skills.filter(skill => /#[A-Za-z]/.test(skill.formula ?? ""));
    expect(withToken.length).toBeGreaterThan(190);
    for (const skill of withToken) {
      expect(skillEffect(skill), `${skill.id} ${skill.n}`).not.toBeNull();
    }
  });

  it("卡片上任何一段字（說明、效果、每一級的原文）都不會有「#」", () => {
    for (const skill of skills) {
      const levels = skillLevels(skill);
      const shown = [
        skill.desc ?? "",
        skillEffect(skill)?.text ?? "",
        ...(levels.kind === "text" ? levels.rows.map(text => text ?? "") : []),
        ...(levels.kind === "table" ? Object.values(levels.rowText ?? {}) : []),
      ];
      for (const text of shown) expect(text, `${skill.id} ${skill.n}`).not.toContain("#");
    }
  });

  it("skills.json 只留卡片用得到的原文：整個檔案在 280KB 以內（每一級都留會超過 450KB）", () => {
    expect(fs.statSync(`${DATA}skills.json`).size).toBeLessThan(280 * 1024);
  });
});
