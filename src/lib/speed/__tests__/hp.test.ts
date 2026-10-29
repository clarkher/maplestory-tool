// src/lib/speed/__tests__/hp.test.ts
import { describe, expect, it } from "vitest";
import type { Frame } from "../frame";
import { rgbAt } from "../frame";
import { findStatusBar } from "../status-bar";
import { hpRatio, nextLowHp, LOW_HP, RESET_HP, type LowHp } from "../hp";
import { loadFixture, scaleFrame } from "./fixture";

/** 把 HP 條改成只剩 ratio 比例的紅色：右邊（含上下框內）塗成空條的灰色 */
function withHp(frame: Frame, ratio: number): Frame {
  const bar = findStatusBar(frame)!;
  const data = new Uint8ClampedArray(frame.data);
  const [x0, x1] = bar.hp;
  const cut = Math.round(x0 + 1 + (x1 - x0 - 2) * ratio);
  for (let y = bar.top + 1; y < bar.bottom - 1; y++) {
    for (let x = cut; x < x1 - 1; x++) {
      const i = (y * frame.width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 150;
    }
  }
  return { width: frame.width, height: frame.height, data };
}

describe("hpRatio", () => {
  it("基準截圖 1146/1296", async () => {
    const frame = await loadFixture("window-1364.png");
    const bar = findStatusBar(frame)!;
    expect(hpRatio(frame, bar)).toBeCloseTo(1146 / 1296, 1);
    expect(Math.abs(hpRatio(frame, bar)! - 1146 / 1296)).toBeLessThanOrEqual(0.03);
  });

  it("紅色改成 25% 長 → 約 0.25", async () => {
    const frame = withHp(await loadFixture("window-1364.png"), 0.25);
    const r = hpRatio(frame, findStatusBar(frame)!)!;
    expect(Math.abs(r - 0.25)).toBeLessThanOrEqual(0.03);
  });

  it("縮放 1.5 倍也讀得到", async () => {
    const frame = scaleFrame(await loadFixture("window-1364.png"), 1.5);
    const r = hpRatio(frame, findStatusBar(frame)!)!;
    expect(Math.abs(r - 1146 / 1296)).toBeLessThanOrEqual(0.03);
  });

  it("條裡沒有紅色讀不出來 → null", async () => {
    const frame = await loadFixture("window-1364.png");
    const bar = findStatusBar(frame)!;
    const data = new Uint8ClampedArray(frame.data);
    for (let y = bar.top; y < bar.bottom; y++) {
      for (let x = bar.hp[0]; x < bar.hp[1]; x++) {
        const i = (y * frame.width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 150;
      }
    }
    expect(hpRatio({ ...frame, data }, bar)).toBeNull();
    expect(rgbAt(frame, 0, 0)).toBeTruthy();
  });
});

describe("nextLowHp", () => {
  it("低於 30% 響一次，回到 50% 以上才再響", () => {
    let s: LowHp = { armed: true };
    const seq: Array<[number | null, boolean]> = [
      [0.9, false],
      [0.29, true],
      [0.31, false],
      [0.29, false],
      [0.55, false],
      [0.28, true],
    ];
    for (const [ratio, beep] of seq) {
      const out = nextLowHp(s, ratio);
      expect(out.beep).toBe(beep);
      s = out.s;
    }
    expect(LOW_HP).toBe(0.3);
    expect(RESET_HP).toBe(0.5);
  });

  it("null 不變", () => {
    expect(nextLowHp({ armed: false }, null)).toEqual({ s: { armed: false }, beep: false });
    expect(nextLowHp({ armed: true }, null)).toEqual({ s: { armed: true }, beep: false });
  });

  it("剛好 30% 不響", () => {
    expect(nextLowHp({ armed: true }, 0.3).beep).toBe(false);
  });
});
