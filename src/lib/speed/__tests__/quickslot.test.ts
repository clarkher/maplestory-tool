// src/lib/speed/__tests__/quickslot.test.ts
import { describe, expect, it } from "vitest";
import type { Frame } from "../frame";
import { findStatusBar } from "../status-bar";
import { findQuickslot, readQuickslot } from "../quickslot";
import { loadFixture, loadItemIcon, paintSlotCount, pasteIcon, quickslotOnScene, scaledUiOnScene, scaleFrame } from "./fixture";

/** 基準截圖快捷鍵 8 格的數量（左上到右下）：Shift 技能、Ins 702、Hm 技能、Pup 279、Ctrl 141、Del 0、End 技能、Pdn 2 */
const REAL = [null, 702, null, 279, 141, 0, null, 2];

const counts = (frame: Frame) => readQuickslot(frame, findStatusBar(frame)!)?.map(slot => slot.count) ?? null;

describe("findQuickslot", () => {
  it("基準截圖：8 格，2 列 4 欄，左上第一格在 (1213, 652)", async () => {
    const frame = await loadFixture("window-1364.png");
    const rects = findQuickslot(frame, findStatusBar(frame)!)!;
    expect(rects).toHaveLength(8);
    expect(Math.abs(rects[0].x - 1213)).toBeLessThanOrEqual(1);
    expect(Math.abs(rects[0].y - 652)).toBeLessThanOrEqual(1);
    // 欄距 35、列距 33
    expect(Math.abs(rects[3].x - rects[0].x - 105)).toBeLessThanOrEqual(1);
    expect(Math.abs(rects[4].y - rects[0].y - 33)).toBeLessThanOrEqual(1);
    expect(rects[4].x).toBe(rects[0].x);
  });

  it("縮放 1.5 倍也找得到（位置跟著放大）", async () => {
    const frame = scaleFrame(await loadFixture("window-1364.png"), 1.5);
    const rects = findQuickslot(frame, findStatusBar(frame)!)!;
    expect(rects).toHaveLength(8);
    expect(Math.abs(rects[0].x - 1213 * 1.5)).toBeLessThanOrEqual(2);
    expect(Math.abs(rects[7].y - 685 * 1.5)).toBeLessThanOrEqual(2);
  });

  it("1920×1080 場景、快捷鍵貼在右下：找得到", async () => {
    const frame = quickslotOnScene(await loadFixture("window-1364.png"));
    const rects = findQuickslot(frame, findStatusBar(frame)!)!;
    expect(rects).toHaveLength(8);
    expect(Math.abs(rects[0].x - (1920 - (1364 - 1213)))).toBeLessThanOrEqual(1);
  });

  it("沒有快捷鍵（整塊塗成場景色）→ null", async () => {
    const frame = await loadFixture("window-1364.png");
    const data = new Uint8ClampedArray(frame.data);
    for (let y = 640; y < 726; y++) for (let x = 1200; x < 1364; x++) data.set([60, 50, 30, 255], (y * frame.width + x) * 4);
    const blank = { ...frame, data };
    expect(findQuickslot(blank, findStatusBar(blank)!)).toBeNull();
  });
});

describe("readQuickslot", () => {
  it("基準截圖讀到 702、279、141、0、2，技能格是 null", async () => {
    const frame = await loadFixture("window-1364.png");
    expect(counts(frame)).toEqual(REAL);
  });

  it("每一格都有 16×16 的圖示", async () => {
    const frame = await loadFixture("window-1364.png");
    const slots = readQuickslot(frame, findStatusBar(frame)!)!;
    expect(slots.map(slot => slot.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const slot of slots) expect(slot.icon?.length).toBe(16 * 16 * 4);
  });

  it("縮放 1.1～2 倍也讀得對", async () => {
    for (const scale of [1.1, 1.25, 1.5, 1.75, 2]) expect(counts(scaleFrame(await loadFixture("window-1364.png"), scale))).toEqual(REAL);
  });

  it("1920×1080 場景讀得對", async () => {
    expect(counts(quickslotOnScene(await loadFixture("window-1364.png")))).toEqual(REAL);
  });

  // 0～9 每個字都要出現（v1.05 的教訓：基準截圖缺的字最容易認錯）；3、5、6、8 基準截圖沒有
  const SETS: Array<Array<number | null>> = [
    [1234, 5678, 90, 3, 8, 6, 5, 9],
    [3, 58, 6, 8888, 3333, 5555, 6666, 7],
    [10, 0, 99, 100, 4, 2, 1, 6385],
  ];

  it("all digits：畫進格子的 0～9 都讀對（1 倍）", async () => {
    const base = await loadFixture("window-1364.png");
    const rects = findQuickslot(base, findStatusBar(base)!)!;
    for (const set of SETS) {
      const frame = set.reduce<Frame>((f, count, i) => paintSlotCount(f, rects[i], count), base);
      expect(counts(frame)).toEqual(set);
    }
  });

  it("all digits：縮放 1.1～2 倍也讀對", async () => {
    const base = await loadFixture("window-1364.png");
    const rects = findQuickslot(base, findStatusBar(base)!)!;
    for (const set of SETS) {
      const frame = set.reduce<Frame>((f, count, i) => paintSlotCount(f, rects[i], count), base);
      for (const scale of [1.1, 1.25, 1.5, 1.75, 2]) expect(counts(scaleFrame(frame, scale))).toEqual(set);
    }
  });

  it("unreadable is null：數字下半被蓋暗（像冷卻遮罩）→ null，不是錯的數", async () => {
    const base = await loadFixture("window-1364.png");
    const rects = findQuickslot(base, findStatusBar(base)!)!;
    const frame = paintSlotCount(base, rects[1], 702);
    const data = new Uint8ClampedArray(frame.data);
    for (let y = rects[1].y + 24; y < rects[1].y + 30; y++) {
      for (let x = rects[1].x; x < rects[1].x + 24; x++) {
        const i = (y * frame.width + x) * 4;
        for (let k = 0; k < 3; k++) data[i + k] = Math.round(data[i + k] * 0.15);
      }
    }
    expect(counts({ ...frame, data })![1]).toBeNull();
  });

  it("unreadable is null：數字右半被圖示蓋掉 → null，不是只讀前面幾位", async () => {
    const base = await loadFixture("window-1364.png");
    const rects = findQuickslot(base, findStatusBar(base)!)!;
    const frame = paintSlotCount(base, rects[1], 702);
    const data = new Uint8ClampedArray(frame.data);
    // 「0」的右半跟「2」整個蓋成亮灰（像白色圖示壓在上面）
    for (let y = rects[1].y + 19; y < rects[1].y + 30; y++) {
      for (let x = rects[1].x + 12; x < rects[1].x + 24; x++) data.set([200, 200, 200, 255], (y * frame.width + x) * 4);
    }
    expect(counts({ ...frame, data })![1]).toBeNull();
  });
});

describe("readQuickslot 修正一（2026-10-29）", () => {
  it("最右那欄 5 位數（10234、放大 1.5 倍糊掉）：讀對或 null，絕不回前 4 位", async () => {
    const base = await loadFixture("window-1364.png");
    const rects = findQuickslot(base, findStatusBar(base)!)!;
    let frame = paintSlotCount(base, rects[3], 10234);
    frame = paintSlotCount(frame, rects[7], 98765);
    for (const scale of [1, 1.25, 1.5, 2]) {
      const read = counts(scale === 1 ? frame : scaleFrame(frame, scale))!;
      console.log(`5 位數 ${scale} 倍：第 3 格 ${read[3]}、第 7 格 ${read[7]}`);
      for (const [i, want] of [[3, 10234], [7, 98765]]) expect([want, null]).toContain(read[i]);
    }
  });

  it("最右那欄 4 位數還是讀得到（白框不會被當成第 5 位）", async () => {
    const base = await loadFixture("window-1364.png");
    const rects = findQuickslot(base, findStatusBar(base)!)!;
    const frame = paintSlotCount(paintSlotCount(base, rects[3], 8888), rects[7], 6385);
    for (const scale of [1, 1.5, 2]) {
      const read = counts(scale === 1 ? frame : scaleFrame(frame, scale))!;
      expect([read[3], read[7]]).toEqual([8888, 6385]);
    }
  });

  // 真的消耗品圖示當底（數字壓在藥水圖上）：紅、橘、白、藍、特殊、超級、活力藥水（items.json 2000000～2000006，c＝消耗）
  const ICONS = [2000000, 2000001, 2000002, 2000003, 2000004, 2000005, 2000006];
  const ICON_SETS: number[][] = [
    [1234, 5678, 90, 3, 8, 6, 5, 9],
    [3, 58, 6, 8888, 3333, 5555, 6666, 7],
    [10, 0, 99, 100, 4, 2, 1, 6385],
    [702, 279, 141, 47, 1999, 250, 36, 8],
  ];
  const BACKGROUNDS: Array<[number, number, number]> = [
    [196, 206, 222],
    [60, 64, 80],
  ];

  it(
    "真藥水圖示當底、0～9 每個字、1／1.25／1.5／2 倍：只會讀對或 null，絕不讀成別的數",
    async () => {
      const base = await loadFixture("window-1364.png");
      const rects = findQuickslot(base, findStatusBar(base)!)!;
      const icons = await Promise.all(ICONS.map(id => loadItemIcon(id)));
      let total = 0;
      const nulls: string[] = [];
      const wrong: string[] = [];
      for (const [si, set] of ICON_SETS.entries()) {
        for (const [bi, bg] of BACKGROUNDS.entries()) {
          // 每組換一種圖示排法，7 種藥水都會出現在每一欄、每一列
          let frame = base;
          set.forEach((count, i) => {
            const icon = icons[(i + si * 3 + bi) % icons.length];
            frame = paintSlotCount(pasteIcon(frame, rects[i], icon, bg), rects[i], count, { clear: false });
          });
          for (const scale of [1, 1.25, 1.5, 2]) {
            const read = counts(scale === 1 ? frame : scaleFrame(frame, scale))!;
            set.forEach((want, i) => {
              total++;
              const tag = `組${si} 底${bi} ${scale}倍 第${i}格 ${want} 圖${ICONS[(i + si * 3 + bi) % icons.length]}`;
              if (read[i] === null) nulls.push(tag);
              else if (read[i] !== want) wrong.push(`${tag} 讀成 ${read[i]}`);
            });
          }
        }
      }
      console.log(`真藥水圖示：${total} 格，null ${nulls.length} 格${nulls.length ? "：" + nulls.join("、") : ""}`);
      expect(wrong).toEqual([]);
      // 大部分還是要讀得到（全部 null 也會「不讀錯」，那不算過）
      expect(nulls.length).toBeLessThanOrEqual(total * 0.1);
    },
    120000,
  );

  it("放大 1.5 倍、放在 1920×1080 場景上（狀態列跟快捷鍵一起放大）：找得到、讀得對", async () => {
    const frame = scaledUiOnScene(await loadFixture("window-1364.png"), 1.5);
    const bar = findStatusBar(frame)!;
    expect(bar.scale).toBeGreaterThan(1.45);
    const rects = findQuickslot(frame, bar)!;
    expect(rects).toHaveLength(8);
    expect(Math.abs(rects[0].x - (1920 - (1364 - 1213) * 1.5))).toBeLessThanOrEqual(2);
    expect(counts(frame)).toEqual(REAL);
  });

  it("放大 2.5 倍讀得對（量一次要多久，寫在 task-3-report）", async () => {
    const frame = scaleFrame(await loadFixture("window-1364.png"), 2.5);
    const bar = findStatusBar(frame)!;
    const t = performance.now();
    const read = readQuickslot(frame, bar)!.map(slot => slot.count);
    console.log(`2.5 倍讀一次 ${(performance.now() - t).toFixed(0)}ms`);
    expect(read).toEqual(REAL);
  }, 30000);

  // 最後一位整個被蓋掉（例：游標剛好蓋滿、蓋成跟底一樣）目前會讀成少一位：702 → 70。
  // 這不在讀畫面這層擋（看不出來後面還有字），由 Task 4 的藥水用量處理：要連續兩次讀到一樣才算、一次掉太多不算。
  it("（記錄現況）最後一位整個被蓋成底色 → 讀成少一位 70，由 Task 4 擋", async () => {
    const base = await loadFixture("window-1364.png");
    const rects = findQuickslot(base, findStatusBar(base)!)!;
    const frame = paintSlotCount(base, rects[1], 702);
    const data = new Uint8ClampedArray(frame.data);
    for (let y = rects[1].y + 19; y < rects[1].y + 30; y++) {
      for (let x = rects[1].x + 16; x < rects[1].x + 24; x++) data.set([70, 110, 200, 255], (y * frame.width + x) * 4);
    }
    expect(counts({ ...frame, data })![1]).toBe(70);
  });
});
