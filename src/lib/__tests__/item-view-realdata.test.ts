/**
 * 真資料常駐檢查：直接讀 public/data/items.json，確認道具卡的「穿戴條件／裝備數值」分組
 * 跟「你的職業能不能用」小標籤套在真資料上結果正確。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { equipGroups, jobFit } from "@/lib/item-view";
import type { Item } from "@/lib/types";

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const items = JSON.parse(fs.readFileSync(`${DATA}items.json`, "utf8")) as Item[];
const equips = items.filter(item => item.c === "裝備" && item.eq);

describe("真資料：道具卡分組與職業標籤", () => {
  it("每件「裝備」都有「需求職業」那一格，而且寫的是字不是數字", () => {
    expect(equips.length).toBeGreaterThan(0);
    const missing = equips.filter(item => {
      const row = equipGroups(item).requirements.find(([label]) => label === "需求職業");
      return !row || /\d/.test(row[1]);
    });
    expect(missing.map(item => item.id)).toEqual([]);
  });

  it("「裝備數值」那一組不會混進需求類的欄位", () => {
    const leaked = items
      .filter(item => item.eq)
      .flatMap(item => equipGroups(item).stats.filter(([label]) => label.startsWith("需求")).map(([label]) => `${item.id} ${label}`));
    expect(leaked).toEqual([]);
  });

  it("槍騎兵 Lv.35 看佛羅利刃：還差 55 級；火毒巫師看：不能用", () => {
    const spear = items.find(item => item.id === 1432011)!;
    expect(jobFit(spear, { job: 130, level: 35 })).toEqual({ tone: "gold", text: "槍騎兵還差 55 級" });
    expect(jobFit(spear, { job: 210, level: 35 })).toEqual({ tone: "maple", text: "火毒巫師不能用" });
  });
});
