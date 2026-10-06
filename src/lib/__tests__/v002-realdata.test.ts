/**
 * 真資料常駐檢查：直接讀 public/data，確認查資料頁用的 V002 判斷套在真資料上結果正確
 * （跟 now-plan-realdata.test.ts 同一招：直接讀檔，不靠 release.ts 的時間判斷）。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isV002Item, isV002Map, isV002Monster, isV002Quest, isV002Skill, v002MonsterIds, v002QuestIds,
} from "@/lib/v002";
import type { Item, MapRecord, Monster, Quest, Skill } from "@/lib/types";

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const read = <T,>(name: string): T => JSON.parse(fs.readFileSync(`${DATA}${name}`, "utf8")) as T;

const maps = read<Record<string, MapRecord>>("maps.json");
const skills = read<Skill[]>("skills.json");
const monsters = read<Monster[]>("monsters.json");
const quests = read<Quest[]>("quests.json");
const items = read<Item[]>("items.json");

describe("真資料：V002 判斷", () => {
  it("154 個三轉技能全部判定為 V002", () => {
    const v002Skills = skills.filter(isV002Skill);
    expect(v002Skills.length).toBe(154);
  });

  it("鬥氣集中（十字軍三轉技能）判定為 V002", () => {
    const skill = skills.find(s => s.n === "鬥氣集中");
    expect(skill).toBeTruthy();
    expect(isV002Skill(skill!)).toBe(true);
  });

  it("黑格里芬（冰原雪域新怪，出沒地圖全是 V002 地圖）判定為 V002", () => {
    const monster = monsters.find(m => m.n === "黑格里芬");
    expect(monster).toBeTruthy();
    expect(isV002Monster(monster!, maps)).toBe(true);
  });

  it("舊地區的怪（出沒地圖沒有開放日）不判定為 V002", () => {
    const slime = monsters.find(m => m.n === "嫩寶");
    expect(slime).toBeTruthy();
    expect(isV002Monster(slime!, maps)).toBe(false);
  });

  it("Lv.100 以上的任務共 30 個，全部判定為 V002", () => {
    const highLv = quests.filter(q => (q.minLv ?? 0) > 100);
    expect(highLv.length).toBe(30);
    for (const quest of highLv) expect(isV002Quest(quest, maps), quest.n).toBe(true);
  });

  it("天空之城（V002 回城點）本身有開放日", () => {
    expect(isV002Map(maps["200000000"])).toBe(true);
  });

  it("維多利亞島弓箭手村沒有開放日，不是 V002 地圖", () => {
    expect(isV002Map(maps["100000000"])).toBe(false);
  });

  it("至少算得出一些 V002 道具（資料可判斷，不用整頁跳過）", () => {
    const monsterIds = v002MonsterIds(monsters, maps);
    const questIds = v002QuestIds(quests, maps);
    const v002Items = items.filter(item => isV002Item(item, monsterIds, questIds));
    expect(v002Items.length).toBeGreaterThan(0);
    // 有商店賣的道具永遠不是 V002 限定，就算來源也有 V002 怪
    for (const item of v002Items) expect(item.sh, item.n).toBeUndefined();
  });
});
