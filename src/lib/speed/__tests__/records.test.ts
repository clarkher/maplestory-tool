import { describe, expect, it } from "vitest";
import { addRecord, compareRows, loadRecords, setRecordCoupon, splitCoupon, type SpeedRecord } from "../records";

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
    expect(compareRows([], cur)).toEqual([{ label: "現圖（這段）", exp10: 500, bonus: 0, current: true }]);
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
    expect(out[0]).toEqual({ label: "現圖（這段）", exp10: 500, bonus: 0, current: true });
    expect(out.slice(1)).toEqual([
      { label: "乙", exp10: 800, bonus: 0, current: false },
      { label: "丙", exp10: 600, bonus: 0, current: false },
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

// 2026-11-11 使用者：跟上次比要比扣掉加倍券的還原值，加倍多拿的接在後面（橫向堆疊長條，照還原值排）
describe("加倍券：還原值＋加倍多拿的", () => {
  it("整段都開 1.5 倍：拿到的三分之一是加倍多的", () => {
    expect(splitCoupon(15000, 600, { mult: 1.5, minutes: 10 })).toEqual({ base: 10000, bonus: 5000 });
  });
  it("10 分鐘裡開了 5 分鐘：還原值＝經驗 ÷（5＋5×1.5）× 10（跟伺服器 realExpPer10 同一條）", () => {
    expect(splitCoupon(15000, 600, { mult: 1.5, minutes: 5 })).toEqual({ base: 12000, bonus: 3000 });
  });
  it("填的分鐘比這段長：當整段都開", () => {
    expect(splitCoupon(15000, 600, { mult: 1.5, minutes: 30 })).toEqual({ base: 10000, bonus: 5000 });
  });
  it("沒開、沒問到、舊紀錄沒存秒數：全部算還原值", () => {
    expect(splitCoupon(15000, 600, null)).toEqual({ base: 15000, bonus: 0 });
    expect(splitCoupon(15000, undefined, { mult: 2, minutes: 10 })).toEqual({ base: 15000, bonus: 0 });
  });
  it("照還原值排：開加倍拿 1,500 的（還原 1,000）排在沒開拿 1,200 的後面", () => {
    const rs = [
      rec({ mapId: 2, mapName: "乙", exp10: 1500, sec: 600, coupon: { mult: 1.5, minutes: 10 } }),
      rec({ mapId: 3, mapName: "丙", exp10: 1200, sec: 600, coupon: null }),
    ];
    const out = compareRows(rs, { mapId: 1, mapName: "現圖", exp10: 900, job: 100, charId: null });
    expect(out.slice(1)).toEqual([
      { label: "丙", exp10: 1200, bonus: 0, current: false },
      { label: "乙", exp10: 1000, bonus: 500, current: false },
    ]);
  });
  it("同一張圖取還原值最好的那筆", () => {
    const rs = [
      rec({ mapId: 2, mapName: "乙", exp10: 3000, sec: 600, coupon: { mult: 2, minutes: 10 } }),
      rec({ mapId: 2, mapName: "乙", exp10: 2000, sec: 600, coupon: null }),
    ];
    const out = compareRows(rs, { mapId: 1, mapName: "現圖", exp10: 900, job: 100, charId: null });
    expect(out[1]).toEqual({ label: "乙", exp10: 2000, bonus: 0, current: false });
  });
  it("這段有開加倍：第一列也拆開", () => {
    const out = compareRows([], { mapId: 1, mapName: "現圖", exp10: 3000, job: 100, charId: null, sec: 600, coupon: { mult: 2, minutes: 10 } });
    expect(out[0]).toEqual({ label: "現圖（這段）", exp10: 1500, bonus: 1500, current: true });
  });
  it("回答加倍券後改同一段的紀錄（用這段開始的時間找）；找不到就不動", () => {
    const s = memStorage();
    addRecord(s, rec({ at: 1, segAt: 100 }));
    addRecord(s, rec({ at: 2, segAt: 200 }));
    const out = setRecordCoupon(s, 100, { mult: 1.5, minutes: 3 });
    expect(out.find(r => r.segAt === 100)?.coupon).toEqual({ mult: 1.5, minutes: 3 });
    expect(out.find(r => r.segAt === 200)?.coupon).toBeUndefined();
    expect(loadRecords(s).find(r => r.segAt === 100)?.coupon).toEqual({ mult: 1.5, minutes: 3 });
    expect(setRecordCoupon(s, 999, null)).toEqual(loadRecords(s));
  });
  it("壞掉的加倍券欄位整筆不丟、當沒開", () => {
    const raw = JSON.stringify([{ ...rec({ at: 7 }), coupon: { mult: "x" }, sec: "y" }]);
    const [only] = loadRecords(memStorage({ "ms-speed:records": raw }));
    expect(only.at).toBe(7);
    expect(only.coupon ?? null).toBeNull();
    expect(only.sec).toBeUndefined();
  });
});
