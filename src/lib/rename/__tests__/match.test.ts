import { describe, expect, it } from "vitest";
import { displayScore, fitShape, pickResult, type Shape } from "../match";
import type { Stroke } from "../strokes";
import shapesJson from "../shapes.json";

const shapes = (shapesJson as unknown as { shapes: Shape[] }).shapes;

/** 把輪廓點切成 n 段筆畫（相鄰段共用端點，跟手寫一樣接得起來） */
function outlineAsStrokes(s: Shape, n = 8): Stroke[] {
  const pts = s.pts;
  const out: Stroke[] = [];
  const step = Math.ceil(pts.length / n);
  for (let i = 0; i < pts.length; i += step) {
    out.push(pts.slice(i, Math.min(pts.length, i + step + 1)).map(([x, y]) => [x, y] as [number, number]));
  }
  return out;
}

/** 固定種子的亂數（mulberry32） */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("fitShape", () => {
  it("怪物自己的輪廓切 8 段 → 這隻 raw 最高、像度 ≥ 80", () => {
    for (const idx of [0, Math.floor(shapes.length / 2), shapes.length - 1]) {
      const target = shapes[idx];
      const segs = outlineAsStrokes(target);
      const own = fitShape(segs, target);
      expect(own.kept.length).toBeGreaterThan(0);
      expect(displayScore(own.raw)).toBeGreaterThanOrEqual(80);
      for (const other of shapes) {
        if (other === target) continue;
        expect(fitShape(segs, other).raw).toBeLessThanOrEqual(own.raw);
      }
    }
  });

  it("kept 是輸入段的索引、不重複", () => {
    const segs = outlineAsStrokes(shapes[3]);
    const { kept } = fitShape(segs, shapes[3]);
    expect(new Set(kept).size).toBe(kept.length);
    for (const k of kept) {
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(segs.length);
    }
  });
});

describe("displayScore", () => {
  it("0–99 整數、單調不減", () => {
    let prev = -1;
    for (let i = 0; i < 20; i++) {
      const s = displayScore(i / 19);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(99);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
    expect(displayScore(0)).toBe(0);
    expect(displayScore(1)).toBe(99);
    expect(displayScore(-5)).toBe(0);
  });
});

describe("pickResult", () => {
  it("自己的輪廓 → 出怪（含換色怪）", () => {
    const target = shapes[0];
    const r = pickResult(outlineAsStrokes(target), shapes, () => 0);
    expect(r.kind).toBe("monster");
    if (r.kind !== "monster") return;
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.kept.length).toBeGreaterThan(0);
  });

  it("換色怪：rand 決定顯示代表輪廓或 alt", () => {
    const withAlt = shapes.find(s => s.alt && s.alt.length > 0)!;
    const segs = outlineAsStrokes(withAlt);
    // 候選前 3 名只有自己時，第二次 rand 決定 id；收集所有可能結果都屬於這組
    const allowed = new Set([withAlt.id, ...withAlt.alt!.map(a => a.id)]);
    const seen = new Set<number>();
    for (const v of [0, 0.3, 0.6, 0.99]) {
      const r = pickResult(segs, shapes, () => v);
      if (r.kind === "monster") seen.add(r.id);
    }
    expect(seen.size).toBeGreaterThan(0);
    // 至少有一個結果落在這組（別的怪若平手也可能被抽到）
    expect([...seen].some(id => allowed.has(id))).toBe(true);
  });

  it("完全在輪廓外的一條短線 → poop", () => {
    // 所有輪廓都在 4.5–59.5 內，角落外的短線離誰都遠
    const segs: Stroke[] = [[[0, 0], [1.5, 0]]];
    const r = pickResult(segs, shapes, () => 0);
    expect(r.kind).toBe("poop");
  });

  it("空筆畫 → empty", () => {
    expect(pickResult([], shapes, () => 0)).toEqual({ kind: "empty" });
  });

  it("固定 rand 時同輸入同輸出", () => {
    const segs = outlineAsStrokes(shapes[10]);
    const a = pickResult(segs, shapes, seeded(7));
    const b = pickResult(segs, shapes, seeded(7));
    expect(a).toEqual(b);
  });

  it("120 段 × 全部怪 < 1500ms", () => {
    const rand = seeded(42);
    const segs: Stroke[] = [];
    for (let i = 0; i < 120; i++) {
      let x = 4 + rand() * 56, y = 4 + rand() * 56;
      const s: Stroke = [[x, y]];
      for (let j = 0; j < 6; j++) {
        x = Math.min(63, Math.max(0, x + (rand() - 0.5) * 6));
        y = Math.min(63, Math.max(0, y + (rand() - 0.5) * 6));
        s.push([x, y]);
      }
      segs.push(s);
    }
    // 不暖機：單跑這個測試時輪廓快取是空的，量到的含建快取時間（手機第一次的情境）
    const t0 = performance.now();
    pickResult(segs, shapes, seeded(1));
    const ms = performance.now() - t0;
    console.log(`[match perf] 120 段 × ${shapes.length} 隻：${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(1500);
  });
});
