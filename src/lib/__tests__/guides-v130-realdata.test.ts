/**
 * v1.30（2026-11-02）攻略補充的真資料檢查：直接讀 npm run data:guides 產出的 public/data/guides。
 * 依據 docs/superpowers/specs/2026-11-02-v1.30-v002-job-guides-design.md。
 *
 * 用法：npx vitest run src/lib/__tests__/guides-v130-realdata.test.ts
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mainBuild } from "@/lib/skill-plan";
import type { GuideCommon, GuideJob } from "@/lib/types";

const DIR = fileURLToPath(new URL("../../../public/data/guides/", import.meta.url));
const job = (id: number): GuideJob => JSON.parse(fs.readFileSync(`${DIR}${id}.json`, "utf8")) as GuideJob;
const common = (): GuideCommon => JSON.parse(fs.readFileSync(`${DIR}common.json`, "utf8")) as GuideCommon;
const THIRD = [111, 121, 131, 211, 221, 231, 311, 321, 411, 421, 511, 521];
const ALL = [100, 110, 111, 120, 121, 130, 131, 200, 210, 211, 220, 221, 230, 231, 300, 310, 311, 320, 321, 400, 410, 411, 420, 421, 500, 510, 511, 520, 521];
const LUFU = /mxdc\.dvg\.cn/;

describe("v1.30 台服新攻略", () => {
  it("格鬥家主推換成台服 10/28 練等效率那套（蓄能激發 4 起手）", () => {
    const build = mainBuild(job(511).builds);
    expect(build?.v).toBe("tw");
    expect(build?.s.some(url => url.includes("snA=2350"))).toBe(true);
    expect(build?.steps[0]).toMatchObject({ name: "蓄能激發", to: 4 });
    expect(job(511).builds.filter(b => b.s.some(url => url.includes("snA=2350")))).toHaveLength(3);
  });

  it("神槍手主推換成台服 10/28 那套，77～90 亡者之林殭屍標 current", () => {
    const build = mainBuild(job(521).builds);
    expect(build?.v).toBe("tw");
    expect(build?.steps.map(step => `${step.name}${step.to}`)).toEqual(["3連發20", "章魚砲台30", "火焰噴射30", "寒霜噴射26", "指定攻擊30", "海鷗突擊隊15"]);
    const zombie = job(521).train.find(segment => segment.from === 77 && segment.to === 90);
    expect(zombie?.current).toBe(true);
    expect(zombie?.why).toContain("含祈禱跟經驗加倍");
  });

  it("槍手 50 等以上不再寫沒有練功回報", () => {
    const gunner = job(520);
    expect(gunner.gaps.some(gap => gap.from === 50)).toBe(false);
    expect(gunner.train.some(segment => segment.map === 200010111)).toBe(true);
    expect(gunner.train.some(segment => segment.map === 101030111)).toBe(true);
  });

  it("十字軍黑暗之劍寫經典版新增的命中率減少", () => {
    const notes = job(111).builds.flatMap(build => build.steps.filter(step => step.name === "黑暗之劍").map(step => step.note ?? ""));
    expect(notes.length).toBeGreaterThan(0);
    for (const note of notes) expect(note).toContain("命中率減少 20%");
  });

  it("12 個三轉職業的點數說明換成 10/29 全部重置", () => {
    for (const id of THIRD) {
      const text = job(id).notes.map(note => note.t).join("\n");
      expect(text, String(id)).not.toContain("10/22 維護後");
      expect(text, String(id)).toContain("10/29");
      expect(text, String(id)).toContain("2026-12-28");
      expect(text, String(id)).toContain(id >= 200 && id < 300 ? "一轉 67 點" : "一轉 61 點");
    }
  });

  it("三轉流程不再寫次元之門是參考舊版資料", () => {
    for (const id of [110, 120, 130, 210, 220, 230, 310, 320, 410, 420, 510, 520]) {
      const text = job(id).notes.map(note => note.t).join("\n");
      expect(text, String(id)).toContain("三轉怎麼轉");
      expect(text, String(id)).not.toContain("次元之門在哪是照舊版資料整理的");
    }
  });

  it("女神組隊寫清楚經驗團跟王團，不再說比打野圖慢", () => {
    const goddess = common().pq?.find(pq => pq.key === "goddess");
    expect(goddess?.why).not.toContain("比打野圖慢");
    expect(goddess?.why).toContain("13,500");
    expect(goddess?.why).toContain("84,000");
    for (const id of [110, 120, 130, 230, 410, 420]) {
      const segment = job(id).train.find(entry => entry.pq === "goddess");
      expect(segment?.why, String(id)).not.toContain("比打野圖慢");
      expect(segment?.why, String(id)).toContain("經驗團");
    }
  });
});

describe("v1.30 陸服熱度榜只進說明", () => {
  it("狙擊手、火毒、十字軍、騎士各有一條陸服說明", () => {
    for (const id of [321, 211, 111, 121]) {
      const notes = job(id).notes.filter(note => note.s.some(url => LUFU.test(url)));
      expect(notes, String(id)).toHaveLength(1);
      expect(notes[0].t).toContain("陸服資料，經驗倍率可能不同，只看哪張圖");
      expect(notes[0].t).not.toMatch(/\d+(\.\d+)? ?萬/);
    }
  });

  it("陸服來源不進練功、點法", () => {
    for (const id of ALL) {
      const guide = job(id);
      for (const segment of guide.train) expect(segment.s.some(url => LUFU.test(url)), `${id} ${segment.name}`).toBe(false);
      for (const build of guide.builds) expect(build.s.some(url => LUFU.test(url)), `${id} ${build.label}`).toBe(false);
    }
  });
});
