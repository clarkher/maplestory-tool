import { describe, expect, it } from "vitest";
import { monsterDrops, monsterMaps } from "@/lib/monster-view";
import type { MapRecord } from "@/lib/types";

const map = (zh: string, extra: Partial<MapRecord> = {}): MapRecord => ({ zh, st: "維多利亞", ...extra });

describe("怪物卡的出沒地圖", () => {
  const maps: Record<string, MapRecord> = {
    "1": map("大木林Ⅰ"),
    "2": map("大木林Ⅱ"),
    "3": map(""), // 沒有中文名：還沒開放的圖
    "4": map("天空之城東邊", { o: "2026-10-15" }),
    "5": map("弓箭手村東部小山"),
    // "6" 根本不在地圖資料裡
  };
  const now = () => false;
  const later = (record: MapRecord) => !!record.o;

  it("沒有中文名的圖（還沒開放）不列，另外算張數；地圖資料裡根本沒有的也算進去", () => {
    const result = monsterMaps({ sp: [[1, 3, 0], [3, 15, 0], [6, 9, 0]], maps: [] }, maps, now);
    expect(result.rows.map(row => row.id)).toEqual([1]);
    expect(result.hidden).toBe(2);
  });

  it("刷怪點多的排前面；刷怪點一樣照原本的順序（不是照編號）；沒有刷怪點資料的排最後", () => {
    const result = monsterMaps({ sp: [[5, 12, 0], [2, 53, 0], [1, 12, 0]], maps: [1, 2, 5, 4] }, maps, now);
    expect(result.rows).toEqual([
      { id: 2, spawns: 53, later: false },
      { id: 5, spawns: 12, later: false },
      { id: 1, spawns: 12, later: false },
      { id: 4, spawns: null, later: false },
    ]);
    expect(result.hidden).toBe(0);
  });

  it("現在就能去、只是沒有刷怪點資料的圖，也排在 10/15 才開的圖前面", () => {
    const result = monsterMaps({ sp: [[4, 30, 0]], maps: [5] }, maps, later);
    expect(result.rows).toEqual([
      { id: 5, spawns: null, later: false },
      { id: 4, spawns: 30, later: true },
    ]);
  });

  it("10/15 才開的圖排在現在就能去的後面，就算刷怪點比較多", () => {
    const result = monsterMaps({ sp: [[4, 30, 0], [1, 3, 0]], maps: [] }, maps, later);
    expect(result.rows).toEqual([
      { id: 1, spawns: 3, later: false },
      { id: 4, spawns: 30, later: true },
    ]);
  });

  it("過了 10/15（不傳「還不能去」的判斷）：一起照刷怪點排", () => {
    const result = monsterMaps({ sp: [[4, 30, 0], [1, 3, 0]], maps: [] }, maps);
    expect(result.rows).toEqual([
      { id: 4, spawns: 30, later: false },
      { id: 1, spawns: 3, later: false },
    ]);
  });

  it("同一張圖在刷怪資料和出沒清單都有：只列一次，用刷怪點的數字", () => {
    const result = monsterMaps({ sp: [[2, 7, 0]], maps: [2, 2] }, maps, now);
    expect(result.rows).toEqual([{ id: 2, spawns: 7, later: false }]);
  });

  it("沒有任何出沒資料：沒有列、也沒有藏起來的", () => {
    expect(monsterMaps({ maps: [] }, maps, now)).toEqual({ rows: [], hidden: 0 });
  });
});

describe("怪物卡的掉落物", () => {
  const index = new Map<number, { un?: 1 }>([
    [1302000, {}],
    [2040825, { un: 1 }],
    [4000000, {}],
  ]);

  it("沒有名字的道具（道具清單本來就不列的）不列，另外算樣數；道具資料裡根本沒有的也算進去", () => {
    expect(monsterDrops([1302000, 2040825, 4000000, 9999999], index)).toEqual({ shown: [1302000, 4000000], hidden: 2 });
  });

  it("都有名字：全部照原本的順序列", () => {
    expect(monsterDrops([4000000, 1302000], index)).toEqual({ shown: [4000000, 1302000], hidden: 0 });
  });
});
