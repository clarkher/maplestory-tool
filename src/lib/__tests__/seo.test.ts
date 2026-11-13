import { describe, expect, it } from "vitest";
import {
  breadcrumbLd,
  clip,
  jobGuideSummary,
  jobTitleName,
  jobTopPick,
  mapTitle,
  monsterSummary,
  monsterTitle,
  nameAliases,
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
      "嫩寶是 Lv.1 的怪物，HP 8、經驗 3。哪裡最多：南方森林（15 個刷怪點）、嫩寶狩獵場（5 個），共 2 張圖。",
    );
  });

  it("怪物：沒有刷怪點數字就只列圖名（玩家搜「○○哪裡最多」，沒數字不硬排）", () => {
    expect(monsterSummary({ ...monster, sp: [] }, maps)).toBe("嫩寶是 Lv.1 的怪物，HP 8、經驗 3。出現在嫩寶狩獵場、南方森林（共 2 張圖）。");
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

  it("任務：NPC 沒有地圖名時不寫「找的某某接」", () => {
    const quest = { id: "1", n: "測試", cat: "稱號", minLv: 30, sNpc: { id: 1, n: "達利額" } } as Quest;
    expect(questSummary(quest)).toBe("「測試」是稱號任務，Lv.30 以上可接，找達利額接。");
  });

  it("技能：職業、幾轉、最高幾級，接遊戲說明（去掉等級上限那段）", () => {
    const skill: Skill = {
      id: 12, n: "精靈的祝福", job: 0, jobName: "冒險之技", group: "初心者/共通", adv: "零轉", max: 20,
      desc: "[等級上限：12] 利用精靈之力使角色得到強化。",
    };
    expect(skillSummary(skill)).toBe("精靈的祝福是初心者的技能，最高 20 級。利用精靈之力使角色得到強化。");
  });

  it("職業頁標題：玩家搜俗稱（標賊、刀賊）跟一轉，名字後面要帶到", () => {
    expect(jobTitleName(410, "刺客")).toBe("刺客（標賊）");
    expect(jobTitleName(420, "俠盜")).toBe("俠盜（刀賊）");
    expect(jobTitleName(400, "盜賊")).toBe("盜賊（一轉，標賊、刀賊）");
    expect(jobTitleName(300, "弓箭手")).toBe("弓箭手（一轉）");
    expect(jobTitleName(131, "龍騎士")).toBe("龍騎士");
  });

  it("職業頁頁首結論：照第一套點法列先點什麼，標明是哪一套", () => {
    const guide = {
      job: 131, name: "龍騎士", stat: [], train: [], notes: [], gaps: [], notOpenYet: [],
      builds: [{ label: "舊版主流點法：雙修（巴哈姆特 2006）", s: [], steps: [
        { id: 1, name: "無雙矛", to: 10 }, { id: 2, name: "魔法抵抗", to: 1 }, { id: 3, name: "槍連擊", to: 30 },
        { id: 4, name: "龍之魂", to: 20 }, { id: 5, name: "龍咆哮", to: 30 },
      ] }, { label: "舊版：單修槍", s: [], steps: [{ id: 1, name: "無雙矛", to: 30 }] }],
    } as unknown as GuideJob;
    expect(jobTopPick(guide)).toEqual({
      label: "舊版主流點法：雙修（巴哈姆特 2006）",
      order: "無雙矛 10 → 魔法抵抗 1 → 槍連擊 30 → 龍之魂 20 → 龍咆哮 30",
      others: 1,
    });
    expect(jobTopPick({ ...guide, builds: [] })).toBeNull();
    // 有經典版的說法就不拿舊版當結論
    const mixed = { ...guide, builds: [guide.builds[0], { label: "經典版板上建議", s: [], steps: [{ id: 9, name: "聖光", to: 1 }] }] } as unknown as GuideJob;
    expect(jobTopPick(mixed)).toEqual({ label: "經典版板上建議", order: "聖光 1", others: 1 });
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

  it("別名：羅馬數字補阿拉伯數字跟英文字母、第1補第一、玩家實際搜過的俗稱（Search Console 11/13）", () => {
    expect(nameAliases("巫婆森林Ⅱ")).toEqual(["巫婆森林2", "巫婆森林II"]);
    expect(nameAliases("猴子森林I")).toEqual(["猴子森林1"]);
    expect(nameAliases("第1軍營")).toEqual(["第一軍營"]);
    expect(nameAliases("王冠之地")).toEqual(["皇冠之地"]);
    expect(nameAliases("爸爸精靈")).toEqual(["精靈爸爸"]);
    expect(nameAliases("嫩寶")).toEqual([]);
  });

  it("怪物：俗稱寫在名字後面，搜「精靈爸爸」也對得上", () => {
    expect(monsterSummary({ ...monster, n: "爸爸精靈", maps: [], sp: [] }, maps)).toBe("爸爸精靈（也叫精靈爸爸）是 Lv.1 的怪物，HP 8、經驗 3。");
  });

  it("怪物標題：直接寫最多在哪張圖、幾等、有沒有掉落物", () => {
    expect(monsterTitle({ ...monster, drops: [2000000] }, maps)).toBe("嫩寶在哪打？最多在南方森林｜Lv.1、掉落物");
    expect(monsterTitle(monster, maps)).toBe("嫩寶在哪打？最多在南方森林｜Lv.1");
    expect(monsterTitle({ ...monster, sp: [] }, maps)).toBe("嫩寶在哪打？嫩寶狩獵場等 2 張圖｜Lv.1");
    expect(monsterTitle({ ...monster, sp: [], maps: [1] }, maps)).toBe("嫩寶在哪打？嫩寶狩獵場｜Lv.1");
    expect(monsterTitle({ ...monster, sp: [], maps: [3], drops: [2000000] }, maps)).toBe("嫩寶｜Lv.1 數值、掉落物");
    expect(monsterTitle({ ...monster, lv: null, sp: [], maps: [] }, maps)).toBe("嫩寶｜數值");
  });

  it("地圖標題：寫從哪出發、走幾張圖，再寫最多的怪；寫不出路線就列有什麼", () => {
    const mobs = [{ n: "巫婆", k: 27 }, { n: "殭屍猴王", k: 1 }];
    expect(mapTitle("巫婆森林Ⅱ", mobs, { from: "魔法森林", steps: 6 })).toBe("巫婆森林Ⅱ怎麼去？從魔法森林走 6 張圖｜巫婆 27 隻");
    expect(mapTitle("巫婆森林Ⅱ", [], { from: "魔法森林", steps: 6 })).toBe("巫婆森林Ⅱ怎麼去？從魔法森林走 6 張圖");
    expect(mapTitle("弓箭手村東部小山", mobs, { from: "弓箭手村", steps: 1 })).toBe("弓箭手村東部小山怎麼去？就在弓箭手村隔壁｜巫婆 27 隻");
    expect(mapTitle("弓箭手村", mobs, null)).toBe("弓箭手村｜巫婆 27 隻、NPC、傳送門");
    expect(mapTitle("弓箭手村", [], null)).toBe("弓箭手村｜怪物、NPC、傳送門");
  });
});
