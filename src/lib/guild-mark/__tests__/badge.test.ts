import { describe, expect, it } from "vitest";
import { CATEGORIES, DEFAULT_BADGE, badgeQuery, cellStyle, parseBadge, pickMark, randomBadge, markEntry, bgEntry, shownColour, centreShift, NO_MARK_ID } from "../badge";

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const p = (s: string) => parseBadge(new URLSearchParams(s));

describe("徽章網址與預設", () => {
  it("空網址＝預設；query 格式固定", () => {
    expect(p("")).toEqual(DEFAULT_BADGE);
    expect(DEFAULT_BADGE).toEqual({ b: 1005, bc: 10, m: 2000, mc: 2 });
    expect(badgeQuery(DEFAULT_BADGE)).toBe("b=1005&bc=10&m=2000&mc=2");
    const x = { b: 1030, bc: 16, m: 5001, mc: 7 };
    expect(p(badgeQuery(x))).toEqual(x);
  });

  it("不合法的值各自退回預設，其他項不受影響", () => {
    expect(p("b=abc").b).toBe(1005);
    expect(p("m=99999").m).toBe(2000);
    expect(p("bc=0").bc).toBe(10);
    expect(p("bc=17").bc).toBe(10);
    expect(p("mc=17").mc).toBe(2);
    expect(p("b=1001&bc=3&m=99999&mc=4")).toEqual({ b: 1001, bc: 3, m: 2000, mc: 4 });
  });

  it("9026 只有第 1 色", () => {
    expect(p("m=9026&mc=5").mc).toBe(1);
  });

  it("分類、查表", () => {
    expect(CATEGORIES.map((c) => c.label)).toEqual(["動物", "植物", "花紋", "文字", "其他"]);
    expect(markEntry(2000)?.category).toBe("Animal");
    expect(markEntry(1)).toBeNull();
    expect(bgEntry(1005)?.id).toBe(1005);
    expect(bgEntry(2000)).toBeNull();
    expect(shownColour(markEntry(9026)!.entry, 5)).toBe(1);
    expect(shownColour(markEntry(2000)!.entry, 5)).toBe(5);
  });
});

describe("pickMark", () => {
  it("換到只有一色的圖案顯示第 1 色，換回來還原使用者要的色", () => {
    const x = pickMark({ ...DEFAULT_BADGE, mc: 5 }, 9026, 5);
    expect(x.m).toBe(9026);
    expect(x.mc).toBe(1);
    expect(pickMark(x, 2001, 5).mc).toBe(5);
  });
});

describe("randomBadge", () => {
  it("500 次全部合法，且涵蓋至少 4 個分類", () => {
    const rand = seeded(20261108);
    const cats = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const r = randomBadge(rand);
      expect(p(badgeQuery(r))).toEqual(r);
      cats.add(markEntry(r.m)!.category);
    }
    expect(cats.size).toBeGreaterThanOrEqual(4);
  });
});

describe("cellStyle", () => {
  it("縮放 8 倍的定位", () => {
    const s = cellStyle(31, 3, 8);
    expect(s.width).toBe(136);
    expect(s.height).toBe(136);
    expect(s.backgroundPosition).toBe("-272px -4216px");
    expect(s.backgroundSize).toBe("2176px 19584px");
    expect(s.backgroundImage).toMatch(/^url\(.*marks-[0-9a-f]{10}\.png.*\)$/);
  });
});

describe("centreShift", () => {
  it("看得到的範圍移到 17×17 正中間，乘倍數後取整數（1 倍不會落在半格糊掉）", () => {
    // 2000 老鷹在 [0,0,15,15]：往右下各 1 格
    expect(centreShift([markEntry(2000)!.entry.box], 8)).toEqual({ x: 8, y: 8 });
    expect(centreShift([[0, 0, 16, 16]], 2)).toEqual({ x: 1, y: 1 });
    expect(centreShift([[0, 0, 16, 16]], 1)).toEqual({ x: 1, y: 1 });
    expect(centreShift([[3, 0, 4, 17]], 2)).toEqual({ x: 7, y: 0 });
  });
  it("幾個範圍取聯集（底圖＋圖案一起移，相對位置不變）", () => {
    expect(centreShift([[0, 0, 17, 17], [5, 5, 3, 3]], 8)).toEqual({ x: 0, y: 0 });
    expect(centreShift([[2, 2, 10, 10], [10, 10, 4, 4]], 2)).toEqual({ x: 1, y: 1 });
  });
  it("不放圖案那格的範圍是整格，不影響置中", () => {
    expect(markEntry(NO_MARK_ID)!.entry.box).toEqual([0, 0, 17, 17]);
  });
});
