import { describe, expect, it } from "vitest";
import { decodeShare, encodeShare, normalize, splitAtCorners, type Stroke } from "../strokes";

/** 計算所有點的 bbox */
function bbox(strokes: Stroke[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const [x, y] of s) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
}

describe("splitAtCorners", () => {
  it("直角 L 形切成 2 段", () => {
    const L: Stroke = [[0, 0], [10, 0], [20, 0], [20, 10], [20, 20]];
    const out = splitAtCorners([L]);
    expect(out.length).toBe(2);
  });

  it("直線不切", () => {
    const line: Stroke = [[0, 0], [10, 0], [20, 0], [30, 0]];
    expect(splitAtCorners([line]).length).toBe(1);
  });

  it("空陣列回空", () => {
    expect(splitAtCorners([])).toEqual([]);
  });

  it("太短（< 2px）的段丟掉", () => {
    expect(splitAtCorners([[[0, 0], [0.5, 0.5]]])).toEqual([]);
  });

  it("130 段輸入只留 120，且留最長的", () => {
    const strokes: Stroke[] = [];
    for (let i = 0; i < 130; i++) strokes.push([[0, i * 10], [5 + i, i * 10]]);
    const out = splitAtCorners(strokes);
    expect(out.length).toBe(120);
    const lens = out.map(s => Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]));
    expect(Math.min(...lens)).toBeGreaterThanOrEqual(5 + 10 - 1e-9); // 最短的 10 段（長 5~14）被丟
  });
});

describe("normalize", () => {
  it("長邊 = 56 且置中", () => {
    const out = normalize([[[100, 100], [300, 100], [300, 200]]]);
    const b = bbox(out);
    expect(b.x1 - b.x0).toBeCloseTo(56, 6);
    expect((b.x0 + b.x1) / 2).toBeCloseTo(32, 6);
    expect((b.y0 + b.y1) / 2).toBeCloseTo(32, 6);
    expect(b.y1 - b.y0).toBeCloseTo(28, 6); // 等比
  });

  it("空輸入回空", () => {
    expect(normalize([])).toEqual([]);
  });
});

describe("encodeShare / decodeShare", () => {
  const all: Stroke[] = [
    [[0, 0], [10, 20], [63, 63]],
    [[5, 5], [30, 40]],
    [[1, 2], [3, 4], [5, 6]],
  ];

  it("來回等於量化後的原值（怪物 id）", () => {
    const x = { id: 9300001, score: 87, all, kept: [0, 2] };
    expect(decodeShare(encodeShare(x))).toEqual(x);
  });

  it("id 可為 poop", () => {
    const x = { id: "poop" as const, score: 0, all, kept: [] };
    expect(decodeShare(encodeShare(x))).toEqual(x);
  });

  it("小數座標量化成整數並夾在 0–63", () => {
    const x = { id: 1, score: 99, all: [[[-5, 70.6], [12.4, 12.6]] as Stroke], kept: [0] };
    const back = decodeShare(encodeShare(x));
    expect(back?.all).toEqual([[[0, 63], [12, 13]]]);
  });

  it("輸出是 Base64URL 字元", () => {
    expect(encodeShare({ id: 5, score: 50, all, kept: [1] })).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("壞資料回 null、不丟例外", () => {
    expect(decodeShare("壞")).toBeNull();
    expect(decodeShare("")).toBeNull();
    expect(decodeShare("!!!!")).toBeNull();
    expect(decodeShare("AAAA")).toBeNull();
    expect(decodeShare("A".repeat(100000))).toBeNull();
  });

  it("截斷的資料回 null", () => {
    const s = encodeShare({ id: 5, score: 50, all, kept: [1] });
    for (let i = 0; i < s.length; i++) expect(() => decodeShare(s.slice(0, i))).not.toThrow();
    expect(decodeShare(s.slice(0, s.length - 4))).toBeNull();
  });

  it("40 段 × 8 點長度合理", () => {
    const big: Stroke[] = Array.from({ length: 40 }, (_, i) => Array.from({ length: 8 }, (_, j) => [(i + j) % 64, (i * j) % 64] as [number, number]));
    const s = encodeShare({ id: 9300001, score: 50, all: big, kept: [0, 1, 2] });
    expect(s.length).toBeLessThan(1000);
    expect(decodeShare(s)?.all.length).toBe(40);
  });

  it("空筆畫與重複 kept：編出來的一定解得開", () => {
    const x = { id: 3, score: 10, all: [[[1, 1], [2, 2]] as Stroke, [] as Stroke, [[5, 5], [9, 9]] as Stroke], kept: [2, 2, 1, 0] };
    const back = decodeShare(encodeShare(x));
    expect(back).not.toBeNull();
    expect(back?.all).toEqual([[[1, 1], [2, 2]], [[5, 5], [9, 9]]]);
    expect(back?.kept).toEqual([1, 0]);
  });

  it("手工拼的壞位元組全回 null", () => {
    const enc = (bytes: number[]) => Buffer.from(bytes).toString("base64url");
    const head = [0, 0, 0, 1, 50]; // id=1 score=50
    expect(decodeShare(enc([...head, 121]))).toBeNull(); // 段數 > 120
    expect(decodeShare(enc([...head, 1, 1, 64, 0, 0]))).toBeNull(); // 座標 >= 64
    expect(decodeShare(enc([...head, 1, 1, 0, 0, 1, 1]))).toBeNull(); // kept 索引越界
    expect(decodeShare(enc([...head, 1, 1, 0, 0, 0, 7]))).toBeNull(); // 尾巴多餘位元組
    expect(decodeShare(enc([...head, 1, 1, 0, 0, 0]))).not.toBeNull(); // 對照：合法的
  });
});
