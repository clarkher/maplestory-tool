/**
 * 真資料常駐檢查：直接讀 public/data/items.json，確認道具頁「裝備數值」對玩家寫的是中文，
 * 不會露出英文欄位名（reqJob）或看不懂的數字（需求職業 1）。上游資料多了新欄位或新的職業值時這裡會先紅。
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
    expect([...shown].filter(text => /\d/.test(text))).toEqual([]);
  });

  it("裝備數值的每個欄位都有中文名，不露出英文欄位名", () => {
    const keys = new Set(items.flatMap(i => Object.keys(i.eq ?? {})));
    expect(keys.size).toBeGreaterThan(0);
    expect([...keys].filter(key => equipStatLabel(key) === key)).toEqual([]);
  });
});
