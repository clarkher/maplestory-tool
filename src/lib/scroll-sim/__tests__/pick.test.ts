import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultScroll, findScroll, rowLabel, scrollsFor, statLine } from "@/lib/scroll-sim/pick";
import type { ScrollSimData, SimEquip, SimScroll } from "@/lib/scroll-sim/types";

const data = JSON.parse(readFileSync(join(process.cwd(), "public/data/scroll-sim.json"), "utf8")) as ScrollSimData;
const equip = (id: number) => data.equips.find((e) => e.id === id) as SimEquip;
const byName = (n: string) => data.scrolls.find((s) => s.n === n)!;

describe("scrollsFor 這件能用哪些卷", () => {
  it("帽子挑得到頭盔卷", () => {
    const hat = data.equips.find((e) => e.s === "帽子")!;
    const list = scrollsFor(data, hat);
    expect(list.some((s) => s.n.startsWith("頭盔"))).toBe(true);
    expect(list.every((s) => s.slot === "帽子" || s.only?.includes(hat.id))).toBe(true);
  });
  it("成功率高到低", () => {
    const list = scrollsFor(data, equip(1082002));
    for (let i = 1; i < list.length; i++) expect(list[i - 1].rate).toBeGreaterThanOrEqual(list[i].rate);
  });
  it("only 專用卷只對那件出現", () => {
    const maple = byName("法師的楓葉武器攻擊力卷軸70%");
    const staff = equip(maple.only![0]);
    expect(scrollsFor(data, staff).some((s) => s.id === maple.id)).toBe(true);
    const other = data.equips.find((e) => e.s === staff.s && !maple.only!.includes(e.id))!;
    expect(scrollsFor(data, other).some((s) => s.id === maple.id)).toBe(false);
  });
});

describe("defaultScroll 只帶裝備時預設挑哪張", () => {
  it("手套挑手套攻擊卷軸60%", () => {
    expect(defaultScroll(scrollsFor(data, equip(1082002)))?.n).toBe("手套攻擊卷軸60%");
  });
  it("沒有 60% 就挑最高", () => {
    const list = scrollsFor(data, equip(1082002)).filter((s) => s.rate !== 60);
    const pick = defaultScroll(list)!;
    expect(pick.stats[0].k).toContain("攻擊");
    expect(pick.rate).toBe(100);
  });
  it("物理攻擊先於魔法攻擊先於其他", () => {
    const mk = (id: number, k: string, rate: number): SimScroll => ({ id, ids: [id], n: `測試${id}`, slot: "手套", rate, boom: 0, effect: "", stats: [{ k, v: 1 }], src: true });
    const physical = mk(1, "物理攻擊力", 100);
    const magic = mk(2, "魔法攻擊力", 60);
    const other = mk(3, "幸運", 60);
    expect(defaultScroll([other, magic, physical])?.id).toBe(1);
    expect(defaultScroll([other, magic])?.id).toBe(2);
    expect(defaultScroll([other])?.id).toBe(3);
  });
  it("空清單回 null", () => {
    expect(defaultScroll([])).toBeNull();
  });
});

describe("findScroll 網址的卷軸 id", () => {
  it("同名的兩個 id 都找到同一筆", () => {
    const a = findScroll(data, 2040826);
    const b = findScroll(data, 2040804);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });
  it("不存在回 null", () => {
    expect(findScroll(data, 999)).toBeNull();
    expect(findScroll(data, 1082002)).toBeNull();
  });
});

describe("rowLabel 表格第一欄", () => {
  it("3 張短劍攻擊卷軸60%", () => {
    expect(rowLabel(3, byName("短劍攻擊卷軸60%"))).toBe("3 張（物理攻擊力 +6、幸運 +3）");
  });
  it("沒有數值只寫張數", () => {
    expect(rowLabel(2, { ...byName("短劍攻擊卷軸60%"), stats: [] })).toBe("2 張");
  });
});

describe("statLine 表格第一欄第二行", () => {
  it("5 張短劍攻擊卷軸60%", () => {
    expect(statLine(5, byName("短劍攻擊卷軸60%"))).toBe("物理攻擊力 +10、幸運 +5");
  });
  it("沒有數值回空字串", () => {
    expect(statLine(2, { ...byName("短劍攻擊卷軸60%"), stats: [] })).toBe("");
  });
});
