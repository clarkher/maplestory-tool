import { describe, expect, it } from "vitest";
import { alphaReach, fitStage, unmeasured } from "@/lib/avatar/stage-fit";

const BOX = { w: 309, h: 248 };
/** 1702861 索命之鐮實際量到的（11/04） */
const SCYTHE = { up: 87, down: 46, half: 77 };

describe("fitStage", () => {
  it("一般角色：2 倍、地面線 40（跟 v1.40 一樣，腳不跳）", () => {
    expect(fitStage([{ up: 60, down: 5, half: 40 }], BOX, 2, 40, 1)).toEqual({ scale: 2, ground: 40 });
  });

  it("小窗的一般角色：1 倍、地面線 14", () => {
    expect(fitStage([{ up: 60, down: 5, half: 40 }], { w: 150, h: 112 }, 1, 14, 2)).toEqual({ scale: 1, ground: 14 });
  });

  it("超大武器（1702861 量到的）：下面不切、上面不切、左右不切", () => {
    for (const dpr of [1, 2, 3]) {
      const { scale, ground } = fitStage([SCYTHE], BOX, 2, 40, dpr);
      expect(SCYTHE.down * scale).toBeLessThanOrEqual(ground);
      expect(SCYTHE.up * scale + ground).toBeLessThanOrEqual(BOX.h);
      expect(SCYTHE.half * 2 * scale).toBeLessThanOrEqual(BOX.w);
    }
  });

  it("縮的時候對齊整數個螢幕像素", () => {
    expect(fitStage([SCYTHE], BOX, 2, 40, 1).scale).toBe(1);
    expect(fitStage([SCYTHE], BOX, 2, 40, 2).scale).toBe(1.5);
    expect(fitStage([SCYTHE], BOX, 2, 40, 3).scale).toBeCloseTo(5 / 3);
  });

  it("電腦版舞台 300 高放得下：2 倍不縮、地面線抬到 96", () => {
    expect(fitStage([SCYTHE], { w: 417, h: 300 }, 2, 40, 1)).toEqual({ scale: 2, ground: 96 });
  });

  it("多格取最大：上、下、左右各自看最遠的那一格", () => {
    const frames = [
      { up: 87, down: 0, half: 10 },
      { up: 10, down: 46, half: 10 },
      { up: 10, down: 0, half: 77 },
    ];
    expect(fitStage(frames, BOX, 2, 40, 2)).toEqual(fitStage([SCYTHE], BOX, 2, 40, 2));
  });

  it("box 還沒量到回 base 跟 minGround", () => {
    expect(fitStage([SCYTHE], null, 2, 40, 1)).toEqual({ scale: 2, ground: 40 });
  });

  it("舞台藏起來（0×0）當作還沒量到，不會算出負的倍數", () => {
    expect(fitStage([SCYTHE], { w: 0, h: 0 }, 1, 14, 1)).toEqual({ scale: 1, ground: 14 });
  });

  it("還沒有圖回 base 跟 minGround", () => {
    expect(fitStage([], BOX, 2, 40, 1)).toEqual({ scale: 2, ground: 40 });
  });

  it("大到對齊會變 0：就用沒對齊的倍數，不會變成 0 倍", () => {
    const { scale } = fitStage([{ up: 900, down: 0, half: 10 }], BOX, 2, 40, 1);
    expect(scale).toBeCloseTo(200 / 900);
  });

  it("unmeasured 的結果跟 v1.40 的 fitScale 一樣（h/2 放得進地面線以上）", () => {
    // v1.40 的算法照抄：沒量到範圍時行為要一模一樣
    const v140 = (w: number, h: number, box: { w: number; h: number }, base: number, ground: number, dpr: number) => {
      const fit = Math.min((box.w - 16) / w, (box.h - ground - 8) / (h / 2));
      if (fit >= base) return base;
      const snapped = Math.floor(fit * dpr) / dpr;
      return snapped > 0 ? snapped : fit;
    };
    for (const [w, h] of [[120, 120], [154, 174], [300, 200], [200, 400], [640, 640]]) {
      for (const dpr of [1, 1.5, 2, 3]) {
        for (const [box, base, ground] of [[BOX, 2, 40], [{ w: 417, h: 300 }, 2, 40], [{ w: 150, h: 112 }, 1, 14]] as const) {
          expect(fitStage([unmeasured(w, h)], box, base, ground, dpr)).toEqual({ scale: v140(w, h, box, base, ground, dpr), ground });
        }
      }
    }
  });
});

describe("alphaReach", () => {
  /** w×h 的透明圖，把 dots 這幾個像素塗上 alpha */
  function image(w: number, h: number, dots: [x: number, y: number][], alpha = 255): Uint8ClampedArray {
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (const [x, y] of dots) pixels[(y * w + x) * 4 + 3] = alpha;
    return pixels;
  }

  it("只有腳底下一點點不透明時 up 0、down 對", () => {
    // 10×10、腳在 (5, 5)：第 7 列涵蓋 [7, 8)，離腳最遠 3
    expect(alphaReach(image(10, 10, [[5, 7]]), 10, 10)).toEqual({ up: 0, down: 3, half: 1 });
  });

  it("全透明回 null", () => {
    expect(alphaReach(image(10, 10, []), 10, 10)).toBeNull();
  });

  it("只有腳以上不透明時 down 0、up 對", () => {
    // 第 2 列的上緣是 2，離腳 3；第 2 列的下緣 3 還在腳以上
    expect(alphaReach(image(10, 10, [[5, 2]]), 10, 10)).toEqual({ up: 3, down: 0, half: 1 });
  });

  it("上下左右都看最遠的那一點，half 取左右較遠的一邊", () => {
    // 左邊到 x=2（離中線 3）、右邊到 x=8（格子右緣 9，離中線 4）
    expect(alphaReach(image(10, 10, [[2, 1], [8, 9]]), 10, 10)).toEqual({ up: 4, down: 5, half: 4 });
  });

  it("奇數寬高：腳在半格上", () => {
    // 9×9、腳在 (4.5, 4.5)：第 0 列上緣離腳 4.5；第 8 列下緣 9 離腳 4.5；x=0 左緣離中線 4.5
    expect(alphaReach(image(9, 9, [[0, 0], [4, 8]]), 9, 9)).toEqual({ up: 4.5, down: 4.5, half: 4.5 });
  });

  it("alpha 只要大於 0 就算", () => {
    expect(alphaReach(image(10, 10, [[5, 7]], 1), 10, 10)).toEqual({ up: 0, down: 3, half: 1 });
  });

  it("寬高不同時照寬算列：不會把列跟欄搞反", () => {
    // 4×8、腳在 (2, 4)：(3, 7) 下緣 8 離腳 4；右緣 4 離中線 2
    expect(alphaReach(image(4, 8, [[3, 7]]), 4, 8)).toEqual({ up: 0, down: 4, half: 2 });
  });
});

describe("unmeasured", () => {
  it("沒量到：腳以上當整張圖的一半、腳底下當 0", () => {
    expect(unmeasured(154, 174)).toEqual({ up: 87, down: 0, half: 77 });
  });
});
