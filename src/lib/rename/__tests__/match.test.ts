import { describe, expect, it } from "vitest";
import { displayScore, fitShape, pickResult, poopBelow, type Shape } from "../match";
import type { Stroke } from "../strokes";
import shapesJson from "../shapes.json";
import { seeded, synthSet } from "../synth";

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

  it("xf 把留下的段搬到輪廓上（2 格內）", () => {
    for (const target of [shapes[0], shapes[20]]) {
      const segs = outlineAsStrokes(target);
      const r = pickResult(segs, shapes, () => 0);
      expect(r.kind).toBe("monster");
      if (r.kind !== "monster") continue;
      const shape = shapes.find(s => s.id === r.id || s.alt?.some(a => a.id === r.id))!;
      for (const k of r.kept) {
        for (const [x, y] of segs[k]) {
          const mx = x * r.xf.sx + r.xf.dx, my = y * r.xf.sy + r.xf.dy;
          const d = Math.min(...shape.pts.map(([u, v]) => Math.hypot(u - mx, v - my)));
          expect(d).toBeLessThanOrEqual(2);
        }
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

describe("poopBelow", () => {
  it("不到 16 段 40、16 段以上 50", () => {
    expect(poopBelow(0)).toBe(40);
    expect(poopBelow(1)).toBe(40);
    expect(poopBelow(15)).toBe(40);
    expect(poopBelow(16)).toBe(50);
    expect(poopBelow(120)).toBe(50);
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

  it("換色怪：alt 裡的怪真的抽得到", () => {
    const withAlt = shapes.find(s => s.alt && s.alt.length > 0)!;
    const segs = outlineAsStrokes(withAlt);
    const altIds = new Set(withAlt.alt!.map(a => a.id));
    const seen = new Set<number>();
    // 第一次 rand 挑平手候選、第二次挑 id／alt；掃一輪 rand 值
    for (let a = 0; a < 10; a++) {
      for (let b = 0; b < 10; b++) {
        const vals = [a / 10, b / 10];
        let k = 0;
        const r = pickResult(segs, shapes, () => vals[k++ % 2]);
        if (r.kind === "monster") seen.add(r.id);
      }
    }
    expect([...seen].some(id => altIds.has(id))).toBe(true);
    expect(seen.has(withAlt.id)).toBe(true);
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

  it("300 個假手寫名字：不會每次都配到同幾隻怪", () => {
    // 種子跟 base.gen.ts 算基準的不同，避免只對那批調好
    const names = synthSet(7, 300);
    const rand = seeded(99);
    const wins = new Map<string, number>();
    let poop = 0;
    for (const segs of names) {
      const r = pickResult(segs, shapes, rand);
      if (r.kind === "poop") poop++;
      else if (r.kind === "monster") {
        // 換色怪算同一組（用代表輪廓的名字）
        const g = shapes.find(s => s.id === r.id || s.alt?.some(a => a.id === r.id))!;
        wins.set(g.n, (wins.get(g.n) ?? 0) + 1);
      }
    }
    const top = [...wins.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`[match dist] 大便 ${poop}/300、贏過的怪 ${wins.size} 組、前 5：${JSON.stringify(top.slice(0, 5))}`);
    expect(top[0][1] / 300).toBeLessThanOrEqual(0.2);
    expect(wins.size).toBeGreaterThanOrEqual(15);
    expect(poop / 300).toBeGreaterThanOrEqual(0.05);
    expect(poop / 300).toBeLessThanOrEqual(0.35);
  }, 120_000);

  it("每隻怪都有基準 base", () => {
    for (const s of shapes) {
      expect(s.base, `${s.id}`).toBeDefined();
      expect(s.base![1]).toBeGreaterThan(0);
    }
  });
});
