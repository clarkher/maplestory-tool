// src/lib/speed/__tests__/potions.test.ts
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { iconDistance, matchPotion, nextPotions, POTION_MAX_DISTANCE, potionPriceFn, potionSummary, refIconOf, type PotionTrack } from "../potions";
import { iconOf } from "../quickslot";
import { loadItemIcon, paintSlotCount, pasteIcon } from "./fixture";
import type { Frame } from "../frame";
import type { Item } from "../../types";

const IDS = [2000000, 2000001, 2000002, 2000003];
const SLOT = { x: 0, y: 0, w: 32, h: 30 };
const blank = (): Frame => ({ width: 32, height: 30, data: new Uint8ClampedArray(32 * 30 * 4) });
const BGS: Array<[number, number, number]> = [
  [196, 206, 222],
  [60, 64, 80],
];

/** 假裝是從畫面讀出來的格子圖示：圖示貼在底色上（可帶數字），再縮 16×16 */
async function slotIcon(id: number, bg: [number, number, number], count: number | null = null) {
  let frame = pasteIcon(blank(), SLOT, await loadItemIcon(id), bg);
  if (count !== null) frame = paintSlotCount(frame, SLOT, count, { clear: false });
  return iconOf(frame, SLOT)!;
}

const buildRefs = () => Promise.all(IDS.map(async id => ({ id, icon: refIconOf(await loadItemIcon(id)) })));

describe("matchPotion", () => {
  it("四種藥水自己比自己都對、互比不混（兩種格子底色、有沒有數字）", async () => {
    const refs = await buildRefs();
    let worstSelf = 0;
    let bestOther = Infinity;
    for (const bg of BGS) {
      for (const id of IDS) {
        for (const count of [null, 702]) {
          const icon = await slotIcon(id, bg, count);
          expect(matchPotion(icon, refs)).toBe(id);
          for (const ref of refs) {
            const d = iconDistance(icon, ref.icon);
            if (ref.id === id) worstSelf = Math.max(worstSelf, d);
            else bestOther = Math.min(bestOther, d);
          }
        }
      }
    }
    console.log(`藥水圖示距離：自己最大 ${worstSelf.toFixed(1)}、別種最小 ${bestOther.toFixed(1)}、門檻 ${POTION_MAX_DISTANCE}`);
    expect(worstSelf).toBeLessThan(POTION_MAX_DISTANCE);
    expect(bestOther).toBeGreaterThan(POTION_MAX_DISTANCE);
  });

  it("雜訊圖、空白格子 → null", async () => {
    const refs = await buildRefs();
    const noise = new Uint8ClampedArray(16 * 16 * 4);
    let seed = 7;
    for (let i = 0; i < noise.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      noise[i] = i % 4 === 3 ? 255 : seed % 256;
    }
    expect(matchPotion(noise, refs)).toBeNull();
    expect(matchPotion(new Uint8ClampedArray(16 * 16 * 4).fill(30), refs)).toBeNull();
  });
});

const start: PotionTrack = { slots: {} };
const feed = (t: PotionTrack, ...counts: number[]) =>
  counts.reduce((acc, count) => nextPotions(acc, [{ index: 0, itemId: 2000000, count }]), t);

describe("nextPotions", () => {
  it("needs two equal reads", () => {
    let t = feed(start, 702);
    expect(t.slots[0]).toBeUndefined();
    t = feed(t, 702);
    expect(t.slots[0]).toMatchObject({ startCount: 702, lastCount: 702, used: 0 });
    t = feed(t, 700);
    expect(t.slots[0].used).toBe(0);
    t = feed(t, 700);
    expect(t.slots[0]).toMatchObject({ lastCount: 700, used: 2 });
  });

  it("covered last digit is ignored", () => {
    // 最後一位被蓋住：702 讀成 70 一次，下一輪又讀回 702 → 沒用掉
    const t = feed(start, 702, 702, 70, 702);
    expect(t.slots[0]).toMatchObject({ lastCount: 702, used: 0, restocked: false });
    expect(t.pending?.[0]).toBeUndefined();
  });

  it("big drop rejected", () => {
    // 連續兩次都讀到 70 也不採用（一次掉 632）：不算用量、不算補貨
    const t = feed(start, 702, 702, 70, 70);
    expect(t.slots[0]).toMatchObject({ lastCount: 702, used: 0, restocked: false });
  });

  it("restock is not usage", () => {
    let t = feed(start, 100, 100, 95, 95);
    expect(t.slots[0].used).toBe(5);
    t = feed(t, 300, 300);
    expect(t.slots[0]).toMatchObject({ used: 5, lastCount: 300, restocked: true });
    t = feed(t, 290, 290);
    expect(t.slots[0]).toMatchObject({ used: 15, restocked: true });
  });

  it("slot item change resets", () => {
    let t = feed(start, 100, 100, 90, 90);
    t = nextPotions(t, [{ index: 0, itemId: 2000003, count: 50 }]);
    t = nextPotions(t, [{ index: 0, itemId: 2000003, count: 50 }]);
    expect(t.slots[0]).toMatchObject({ itemId: 2000003, startCount: 50, lastCount: 50, used: 0, restocked: false });
  });

  it("null 跳過、不動既有的數字", () => {
    let t = feed(start, 100, 100);
    t = nextPotions(t, [{ index: 0, itemId: null, count: 50 }]);
    t = nextPotions(t, [{ index: 0, itemId: 2000000, count: null }]);
    expect(t.slots[0]).toMatchObject({ lastCount: 100, used: 0 });
  });
});

describe("potionSummary", () => {
  it("two slots same potion merge", () => {
    let t = start;
    for (const [a, b] of [[100, 200], [100, 200], [90, 190], [90, 190]]) {
      t = nextPotions(t, [
        { index: 0, itemId: 2000003, count: a },
        { index: 1, itemId: 2000003, count: b },
      ]);
    }
    const { uses, restocked } = potionSummary(t, 20, id => (id === 2000003 ? 192 : null));
    expect(restocked).toBe(false);
    expect(uses).toEqual([{ itemId: 2000003, per10: 10, meso10: 1920 }]);
    expect(potionSummary(t, 20, () => null).uses[0].meso10).toBeNull();
    expect(potionSummary(t, 0, () => 1).uses).toEqual([]);
  });
});

describe("potionPriceFn", () => {
  const items = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "public/data/items.json"), "utf8")) as Item[];
  const price = potionPriceFn(items);

  it("藍色藥水 2000003：常駐楓幣店最低價 192（魔法森林雜貨店）", () => {
    expect(price(2000003)).toBe(192);
    expect(price(2000000)).toBe(50);
  });

  it("活動店（u、e）跟商城（c）不算；一組多個除以組數；沒有店回 null", () => {
    const fake = potionPriceFn([
      { id: 1, n: "x", c: "消耗", sp: [{ p: "活動", pr: 1, u: "萬聖節硬幣" }, { p: "限時", pr: 2, e: "2026-11-11T23:59+08:00" }, { p: "商城", pr: 3, c: 1 }, { p: "店", pr: 40, k: 2 }] },
      { id: 2, n: "y", c: "消耗" },
    ] as Item[]);
    expect(fake(1)).toBe(20);
    expect(fake(2)).toBeNull();
    expect(fake(999)).toBeNull();
  });
});
