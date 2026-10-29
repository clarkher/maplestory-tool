import { describe, expect, it } from "vitest";
import {
  breadcrumbLd,
  clip,
  jobGuideSummary,
  monsterSummary,
  questSummary,
  skillSummary,
  SITE_URL,
} from "@/lib/seo";
import type { GuideJob, MapRecord, Monster, Quest, Skill } from "@/lib/types";

const maps: Record<string, MapRecord> = {
  "1": { zh: "嫩寶狩獵場", st: "楓之島" },
  "2": { zh: "南方森林", st: "維多利亞島" },
  "3": { zh: "", st: "" },
};

const monster: Monster = {
  id: 100100, n: "嫩寶", lv: 1, exp: 3, hp: 8, pad: 12, pdd: 0, mad: 0, mdd: 0, acc: 20, eva: 0, spd: -65,
  maps: [1, 2, 3], sp: [[2, 15, 0], [1, 5, 0]], drops: [],
};

describe("seo：給搜尋引擎跟 AI 讀的那一段話", () => {
  it("怪物：等級、HP、經驗，刷怪點多的圖寫前面，沒開放的圖不寫也不算張數", () => {
    expect(monsterSummary(monster, maps)).toBe(
      "嫩寶是 Lv.1 的怪物，HP 8、經驗 3。最常出現在南方森林、嫩寶狩獵場（共 2 張圖）。",
    );
  });

  it("怪物：沒有等級、沒有開放的圖，就不寫那半句", () => {
    expect(monsterSummary({ ...monster, lv: null, maps: [3], sp: [] }, maps)).toBe("嫩寶，HP 8、經驗 3。");
  });

  it("任務：等級、哪個 NPC 接、要打什麼怪、給多少經驗", () => {
    const quest: Quest = {
      id: "2132", n: "新手法師的第一次修煉", cat: "職業", minLv: 8, maxLv: 13,
      sNpc: { id: 1, n: "漢斯", mapName: "魔法森林圖書館" },
      needMobs: [{ id: 210100, n: "綠水靈", c: 8 }],
      exp: 290,
    };
    expect(questSummary(quest)).toBe(
      "「新手法師的第一次修煉」是職業任務，Lv.8～13 可接，找魔法森林圖書館的漢斯接。要打綠水靈 8 隻。完成給經驗 290。",
    );
  });

  it("任務：只有下限、沒有 NPC 也能寫成一句", () => {
    expect(questSummary({ id: "1", n: "測試", cat: "活動", minLv: 30 })).toBe("「測試」是活動任務，Lv.30 以上可接。");
  });

  it("技能：職業、幾轉、最高幾級，接遊戲說明（去掉等級上限那段）", () => {
    const skill: Skill = {
      id: 12, n: "精靈的祝福", job: 0, jobName: "冒險之技", group: "初心者/共通", adv: "零轉", max: 20,
      desc: "[等級上限：12] 利用精靈之力使角色得到強化。",
    };
    expect(skillSummary(skill)).toBe("精靈的祝福是初心者的技能，最高 20 級。利用精靈之力使角色得到強化。");
  });

  it("職業：從攻略寫幾段練功點", () => {
    const guide = {
      job: 110, name: "狂戰士", stat: [], builds: [], notes: [], gaps: [], notOpenYet: [],
      train: [
        { from: 30, to: 35, kind: "solo", map: 1, name: "黑肥肥領土", mobs: [], why: "", v: "tw", s: [] },
        { from: 30, to: 30, kind: "party", map: null, name: "超級綠水靈組隊任務", mobs: [], why: "", v: "tw", s: [] },
      ],
    } as GuideJob;
    expect(jobGuideSummary(guide)).toBe(
      "新楓之谷經典版狂戰士怎麼練：素質怎麼配、技能點法、每個等級去哪練。整理了 2 段練功點，例如 Lv.30～35 黑肥肥領土。",
    );
  });

  it("描述太長就切在 150 字內、補刪節號", () => {
    expect(clip("短的")).toBe("短的");
    const long = "字".repeat(200);
    expect(clip(long)).toHaveLength(150);
    expect(clip(long).endsWith("…")).toBe(true);
  });

  it("麵包屑：每一層帶完整網址、照順序編號", () => {
    expect(breadcrumbLd([{ name: "查資料", path: "/db" }, { name: "嫩寶", path: "/db/monsters/100100" }])).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "楓谷幫手", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "查資料", item: `${SITE_URL}/db` },
        { "@type": "ListItem", position: 3, name: "嫩寶", item: `${SITE_URL}/db/monsters/100100` },
      ],
    });
  });
});
