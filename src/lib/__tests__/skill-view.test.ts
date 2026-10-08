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
import { changedParts, reachableLevel, skillEffect, skillIcon, skillLevels } from "@/lib/skill-view";
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

  it("好幾級沒有數值、每一級的原文都一樣（魔力淨化）：不列一排一樣的字，回 sameText、級數跟那一句（卡片照寫）", () => {
    expect(
      skillLevels({ levels: [{}, {}, {}], levelText: { 1: "增加一定量的MP的恢復量", 2: "增加一定量的MP的恢復量", 3: "增加一定量的MP的恢復量" } }),
    ).toEqual({ kind: "sameText", count: 3, text: "增加一定量的MP的恢復量" });
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

  it("神匠之魂、怪物騎乘、肥肥／木妖／綠水靈的弱點攻擊：遊戲資料沒有分等級的資料，回 noLevels（宇宙衝鋒、宇宙光束 v0.78 起到期不列）", () => {
    for (const id of [1003, 1004, 9000, 9001, 9002]) {
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

  it("矛連擊、極速詠唱（火毒、冰雷）、分身術、蓄能激發：每一級都有原文可列（上游 values 是空的；衝鋒 v0.78 起用客戶端的數值，見下面）", () => {
    const expected: Array<[number, number]> = [
      [1311002, 30],
      [2111005, 20],
      [2211005, 20],
      [4211004, 30],
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
    expect(skillLevels(byId(2000000))).toEqual({ kind: "sameText", count: 16, text: "增加一定量的MP的恢復量" });
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

  it("劍氣縱橫：效果行是「滿級效果（20 級）：消耗HP16和MP14, 攻擊力130%」；說明開頭的最高等級、尾巴的「所需技能…#」都拆出去了", () => {
    expect(skillEffect(byId(1001005))).toEqual({ label: "滿級效果（20 級）", text: "消耗HP16和MP14, 攻擊力130%" });
    expect(byId(1001005).desc).toBe("消耗HP、MP以作為裝備的武器對周圍的敵人進行整體攻擊。");
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

  it("skills.json 只留卡片用得到的原文（每一級都留檔案會大一倍）：有數值的技能只有最高級跟整列沒數值的那幾級，只有一級又沒數值的不留", () => {
    let kept = 0;
    for (const skill of skills) {
      const levels = skill.levels ?? [];
      const hasValues = levels.some(level => Object.keys(level).length > 0);
      for (const key of Object.keys(skill.levelText ?? {})) {
        const level = Number(key);
        const inRange = Number.isInteger(level) && level >= 1 && level <= levels.length;
        const needed = hasValues ? level === levels.length || Object.keys(levels[level - 1] ?? {}).length === 0 : levels.length > 1;
        expect(inRange && needed, `${skill.id} ${skill.n} 第 ${key} 級`).toBe(true);
        kept++;
      }
    }
    // 少留的情況由上面幾條抓（有代號的每一個都換得到滿級原文、槍連擊等每一級都有原文）
    expect(kept).toBeGreaterThan(0);
  });
});

describe("真資料：說明、所需技能、到期的活動技能（v0.78）", () => {
  it("說明開頭不再重複「[最高等級：N]」「[等級上限 : N]」（標題下已經寫上限幾級）", () => {
    for (const skill of skills) expect(skill.desc ?? "", `${skill.id} ${skill.n}`).not.toMatch(/^\s*\[(最高等級|等級上限)/);
  });

  it("說明沒有韓文（19 個坐騎技能的韓文說明不列，效果行是中文）", () => {
    for (const skill of skills) expect(skill.desc ?? "", `${skill.id} ${skill.n}`).not.toMatch(/\p{Script=Hangul}/u);
    // 雪吉拉騎士 1018 原本只有韓文說明：說明拿掉，效果行照列中文
    expect(byId(1018).desc).toBeUndefined();
    expect(skillEffect(byId(1018))?.text).toBe("消耗MP 10，物裡、魔法防禦力增加 10、移動速度 170、跳躍力 120");
  });

  it("劍氣縱橫的所需技能是魔天一擊 1 級，接得到技能 1001004（卡片做成連結）", () => {
    expect(byId(1001005).req).toEqual([{ name: "魔天一擊", level: 1, id: 1001004 }]);
    expect(byId(1001004).n).toBe("魔天一擊");
  });

  it("所需技能接上的 id 都是真的技能、名字一樣、在同一條職業線（自己、上一轉、一轉）；說明裡不再有「所需技能」", () => {
    let linked = 0;
    for (const skill of skills) {
      expect(skill.desc ?? "", `${skill.id} ${skill.n}`).not.toContain("所需技能");
      for (const req of skill.req ?? []) {
        if (req.id === undefined) continue;
        const target = byId(req.id);
        expect(target.n, `${skill.id} → ${req.id}`).toBe(req.name);
        expect([skill.job, skill.job - (skill.job % 10), skill.job - (skill.job % 100)], `${skill.id} → ${req.id}`).toContain(target.job);
        linked++;
      }
    }
    expect(linked).toBeGreaterThan(30);
  });

  it("寫著 2009 年就到期的活動技能（宇宙船、宇宙衝鋒、宇宙光束、雪吉拉騎士 1017）不列；另一個沒寫期限的雪吉拉騎士 1018 照列", () => {
    for (const id of [1013, 1014, 1015, 1017]) expect(skills.some(skill => skill.id === id), String(id)).toBe(false);
    expect(byId(1018).n).toBe("雪吉拉騎士");
  });
});

describe("表頭單位、文字表標出變了的數字、你點得到第幾級（v0.78）", () => {
  it("數值表的表頭補單位：樣板裡代號後面接「%」「秒」的（攻擊力#damage%、隱身#time秒），其他不補", () => {
    const result = skillLevels({
      formula: "消耗MP#mpCon, 隱身#time秒，攻擊力#damage%",
      labels: { mpCon: "消耗 MP", time: "持續時間", damage: "傷害" },
      levels: [{ mpCon: 24, time: 10, damage: 110 }],
    });
    expect(result.kind === "table" && result.fields).toEqual([
      { key: "mpCon", label: "消耗 MP" },
      { key: "time", label: "持續時間", unit: "秒" },
      { key: "damage", label: "傷害", unit: "%" },
    ]);
  });

  it("文字表每一列標出跟上一級不一樣的數字（阿拉伯數字、「兩名」「三次」這種中文數字都算），第 1 級沒有上一級、不標", () => {
    expect(changedParts("消耗MP10, 攻擊力75%, 對一名怪物兩次攻擊", "消耗MP13, 攻擊力80%, 對兩名怪物兩次攻擊")).toEqual([
      { text: "消耗MP", changed: false },
      { text: "13", changed: true },
      { text: ", 攻擊力", changed: false },
      { text: "80", changed: true },
      { text: "%, 對", changed: false },
      { text: "兩", changed: true },
      { text: "名怪物", changed: false },
      { text: "兩", changed: false },
      { text: "次攻擊", changed: false },
    ]);
    expect(changedParts(null, "消耗MP10, 攻擊力55%")).toEqual([{ text: "消耗MP10, 攻擊力55%", changed: false }]);
  });

  it("上一級沒有原文、或數字個數變了（蓄能激發 4 級多了「物理攻擊力增加11」）：多出來的數字算變了", () => {
    expect(changedParts("持續時間為31秒，命中率與迴避率增加2", "持續時間為32秒，命中率與迴避率增加2，物理攻擊力增加11")).toEqual([
      { text: "持續時間為", changed: false },
      { text: "32", changed: true },
      { text: "秒，命中率與迴避率增加", changed: false },
      { text: "2", changed: false },
      { text: "，物理攻擊力增加", changed: false },
      { text: "11", changed: true },
    ]);
  });

  it("你點得到第幾級：這一轉到現在的點數（轉職 1 點、之後每級 3 點）全點這招能到的級數；Lv.32 槍騎兵的二轉技能 7 點→第 7 級", () => {
    expect(reachableLevel({ job: 130, levels: Array(20).fill({}) }, { job: 130, level: 32 })).toEqual({ level: 7, sp: 7, full: false, tier: "二轉" });
  });

  it("點數夠點滿就是 full；已經過了的那一轉（Lv.45 狂戰士看一轉的劍氣縱橫）照那一轉拿到的點數算，一定夠", () => {
    expect(reachableLevel({ job: 100, levels: Array(20).fill({}) }, { job: 110, level: 45 })).toEqual({ level: 20, sp: 61, full: true, tier: "一轉" });
  });

  it("法師 8 等就一轉：Lv.9 法師的一轉技能 4 點", () => {
    expect(reachableLevel({ job: 200, levels: Array(20).fill({}) }, { job: 200, level: 9 })).toEqual({ level: 4, sp: 4, full: false, tier: "一轉" });
  });

  it("不是自己的職業線、還沒轉到的那一轉（Lv.50 選了龍騎士，三轉技能要 70 等）、初心者技能、還沒存角色：都不標", () => {
    const spear = { job: 131, levels: Array(30).fill({}) };
    expect(reachableLevel(spear, { job: 131, level: 50 })).toBeNull();
    expect(reachableLevel({ job: 200, levels: Array(20).fill({}) }, { job: 110, level: 45 })).toBeNull();
    expect(reachableLevel({ job: 0, levels: Array(3).fill({}) }, { job: 110, level: 45 })).toBeNull();
    expect(reachableLevel(spear, { job: -1, level: 0 })).toBeNull();
  });
});

describe("真資料：衝鋒用台服客戶端的每一級數值、壞掉的技能圖示（v0.78）", () => {
  it("衝鋒 5001005：上游只有文字，改用客戶端的數值表（消耗 MP／移動速度／跳躍力／持續時間），第 1、10 級照客戶端原值", () => {
    const levels = skillLevels(byId(5001005));
    expect(levels.kind).toBe("table");
    if (levels.kind !== "table") return;
    expect(levels.fields).toEqual([
      { key: "mpCon", label: "消耗 MP" },
      { key: "x", label: "移動速度" },
      { key: "y", label: "跳躍力" },
      { key: "time", label: "持續時間", unit: "秒" },
    ]);
    expect(levels.rows[0]).toEqual([14, 12, 1, 4]);
    expect(levels.rows[9]).toEqual([5, 30, 10, 20]);
    expect(skillEffect(byId(5001005))).toEqual({ label: "滿級效果（10 級）", text: "消耗MP 5，持續時間為20秒" });
  });

  it("客戶端也沒有每一級數字的魔力淨化照舊寫「沒有每一級的數字」（不編）", () => {
    expect(skillLevels(byId(2000000)).kind).toBe("sameText");
  });

  it("向下跳躍 1006 的圖示上游是壞的（綠色雜訊），改用同一個技能皇家騎士團版 10001006 的圖（1000～1009 兩版逐位元組一樣）；木妖的弱點攻擊 9001 找不到可靠的圖就不放", () => {
    expect(skillIcon(1006)).toBe("/assets/skills/10001006.png");
    expect(skillIcon(9001)).toBeUndefined();
    expect(skillIcon(1000)).toBe("/assets/skills/1000.png");
    expect(fs.existsSync(fileURLToPath(new URL("../../../public/assets/skills/10001006.png", import.meta.url)))).toBe(true);
  });
});
