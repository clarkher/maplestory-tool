/**
 * 真資料常駐檢查：直接讀 public/data/items.json，確認道具頁「裝備數值」對玩家寫的是中文，
 * 不會露出英文欄位名（reqJob）、欄位代碼（WpSi）或看不懂的數字（需求職業 1、攻擊速度 6）。
 * 上游資料多了新欄位、新的職業值或新的攻擊速度時這裡會先紅。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { equipStatLabel, equipStatValue } from "@/lib/format";
import type { Item } from "@/lib/types";

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const items = JSON.parse(fs.readFileSync(`${DATA}items.json`, "utf8")) as Item[];

describe("真資料：裝備數值", () => {
  it("佛羅利刃（1432011）的需求職業寫劍士", () => {
    const item = items.find(i => i.id === 1432011);
    expect(item?.eq?.reqJob).toBe(1);
    expect(equipStatValue("reqJob", item!.eq!.reqJob)).toBe("劍士");
  });

  it("清酒、藍色拖把（reqJob -1）寫初心者", () => {
    for (const id of [1422011, 1442023]) {
      const item = items.find(i => i.id === id);
      expect(item?.eq?.reqJob).toBe(-1);
      expect(equipStatValue("reqJob", item!.eq!.reqJob)).toBe("初心者");
    }
  });

  it("每件裝備的需求職業都解得出職業名，不露出數字", () => {
    const shown = new Set(
      items.filter(i => i.eq?.reqJob !== undefined).map(i => equipStatValue("reqJob", i.eq!.reqJob)),
    );
    expect(shown.size).toBeGreaterThan(0);
    expect([...shown].filter(text => text === null || /\d/.test(text))).toEqual([]);
  });

  it("裝備數值的每個欄位都有中文名，不露出英文欄位名", () => {
    const keys = new Set(items.flatMap(i => Object.keys(i.eq ?? {})));
    expect(keys.size).toBeGreaterThan(0);
    expect([...keys].filter(key => equipStatLabel(key) === key)).toEqual([]);
  });

  it("攻擊速度跟玩家講的對得上：銀龍槍慢（8）、九龍刀普通（6）、狼牙更快（3）、藍色拖把比較慢（9）", () => {
    const speed = (id: number) => equipStatValue("attackSpeed", items.find(i => i.id === id)!.eq!.attackSpeed);
    expect(speed(1432007)).toBe("慢（8）");
    expect(speed(1442005)).toBe("普通（6）");
    expect(speed(1472007)).toBe("更快（3）");
    expect(speed(1442023)).toBe("比較慢（9）");
  });

  it("每件武器的攻擊速度都寫成「字（數字）」，不會只剩一個數字", () => {
    const shown = new Set(
      items.filter(i => i.eq?.attackSpeed !== undefined).map(i => equipStatValue("attackSpeed", i.eq!.attackSpeed)),
    );
    expect(shown.size).toBeGreaterThan(0);
    expect([...shown].filter(text => text === null || !/^[一-鿿]+（\d）$/.test(text))).toEqual([]);
  });

  it("裝備欄位的字：雷神之錘（雙手武器）寫雙手、鋼鐵鎧甲（套服）寫上衣＋褲裙，海神叉（槍）不給格子", () => {
    const slot = (id: number) => equipStatValue("islot", items.find(i => i.id === id)!.eq!.islot);
    expect(slot(1422012)).toBe("雙手，不能配盾");
    expect(slot(1051000)).toBe("上衣＋褲裙（佔兩格）");
    expect(slot(1432008)).toBeNull();
  });

  it("裝備欄位不是寫中文就是不顯示，不露出英文代碼（Cp、WpSi）", () => {
    const shown = new Set(
      items.filter(i => i.eq?.islot !== undefined).map(i => equipStatValue("islot", i.eq!.islot)),
    );
    expect(shown).toContain("雙手，不能配盾");
    expect(shown).toContain("上衣＋褲裙（佔兩格）");
    expect([...shown].filter(text => text !== null && /[A-Za-z]/.test(text))).toEqual([]);
  });
});
