import { describe, expect, it } from "vitest";
import { addRecord, compareRows, loadRecords, type SpeedRecord } from "../records";

/** 記憶體版 Storage */
function memStorage(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

const rec = (o: Partial<SpeedRecord> = {}): SpeedRecord => ({
  at: 1, mapId: 100, mapName: "甲圖", level: 50, job: 100, charId: null, exp10: 1000, net10: null, ...o,
});

describe("loadRecords / addRecord", () => {
  it("空的回空陣列", () => {
    expect(loadRecords(memStorage())).toEqual([]);
  });
  it("新的在前", () => {
    const s = memStorage();
    addRecord(s, rec({ at: 1 }));
    const out = addRecord(s, rec({ at: 2 }));
    expect(out.map((r) => r.at)).toEqual([2, 1]);
    expect(loadRecords(s).map((r) => r.at)).toEqual([2, 1]);
  });
  it("壞 JSON 回空陣列、不丟錯", () => {
    expect(loadRecords(memStorage({ "ms-speed:records": "{oops" }))).toEqual([]);
    expect(loadRecords(memStorage({ "ms-speed:records": '{"a":1}' }))).toEqual([]);
  });
  it("形狀不對的那筆丟掉、好的留著", () => {
    const raw = JSON.stringify([rec({ at: 5 }), { at: "x" }, null, rec({ at: 3, exp10: Number.NaN })]);
    expect(loadRecords(memStorage({ "ms-speed:records": raw })).map((r) => r.at)).toEqual([5]);
  });
  it("最多 50 筆，舊的丟掉", () => {
    const s = memStorage();
    for (let i = 1; i <= 55; i++) addRecord(s, rec({ at: i }));
    const out = loadRecords(s);
    expect(out).toHaveLength(50);
    expect(out[0].at).toBe(55);
    expect(out[49].at).toBe(6);
  });
  it("storage 丟錯時不崩潰", () => {
    const bad = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); } } as unknown as Storage;
    expect(loadRecords(bad)).toEqual([]);
    expect(addRecord(bad, rec())).toEqual([rec()]);
  });
});

describe("compareRows", () => {
  const cur = { mapId: 1, mapName: "現圖", exp10: 500, job: 100, charId: null as string | null };
  it("沒有以前的紀錄：只有這段", () => {
    expect(compareRows([], cur)).toEqual([{ label: "現圖（這段）", exp10: 500, current: true }]);
  });
  it("沒 ID 看職業；排除同圖；同圖取最好；由大到小", () => {
    const rs = [
      rec({ mapId: 1, mapName: "現圖", exp10: 9999 }),
      rec({ mapId: 2, mapName: "乙", exp10: 300 }),
      rec({ mapId: 2, mapName: "乙", exp10: 800 }),
      rec({ mapId: 3, mapName: "丙", exp10: 600 }),
      rec({ mapId: 4, mapName: "丁", job: 200, exp10: 7000 }),
    ];
    const out = compareRows(rs, cur);
    expect(out[0]).toEqual({ label: "現圖（這段）", exp10: 500, current: true });
    expect(out.slice(1)).toEqual([
      { label: "乙", exp10: 800, current: false },
      { label: "丙", exp10: 600, current: false },
    ]);
  });
  it("有 ID 看 ID，不管職業", () => {
    const rs = [
      rec({ mapId: 2, mapName: "乙", charId: "A", job: 999, exp10: 100 }),
      rec({ mapId: 3, mapName: "丙", charId: "B", job: 100, exp10: 200 }),
      rec({ mapId: 4, mapName: "丁", charId: null, job: 100, exp10: 300 }),
    ];
    const out = compareRows(rs, { ...cur, charId: "A" });
    expect(out.map((r) => r.label)).toEqual(["現圖（這段）", "乙"]);
  });
  it("職業也沒有、ID 也沒有：不比別人", () => {
    const out = compareRows([rec({ mapId: 2, job: null })], { ...cur, job: null });
    expect(out).toHaveLength(1);
  });
  it("最多 4 張別的圖", () => {
    const rs = [2, 3, 4, 5, 6, 7].map((id) => rec({ mapId: id, mapName: `圖${id}`, exp10: id * 100 }));
    const out = compareRows(rs, cur);
    expect(out).toHaveLength(5);
    expect(out.slice(1).map((r) => r.exp10)).toEqual([700, 600, 500, 400]);
  });
  it("沒 mapId 的用地圖名分辨", () => {
    const rs = [rec({ mapId: null, mapName: "神秘圖", exp10: 400 }), rec({ mapId: null, mapName: "現圖", exp10: 900 })];
    const out = compareRows(rs, { ...cur, mapId: null });
    expect(out.map((r) => r.label)).toEqual(["現圖（這段）", "神秘圖"]);
  });
});
