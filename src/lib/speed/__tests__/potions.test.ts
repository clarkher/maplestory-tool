// src/lib/speed/__tests__/potions.test.ts
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { iconDistance, matchPotion, nextPotions, POTION_MAX_DISTANCE, potionPriceFn, potionRefOf, potionSummary, refDistance, type PotionRef, type PotionTrack } from "../potions";
import { iconOf, readQuickslot } from "../quickslot";
import { findStatusBar } from "../status-bar";
import { loadFixture, loadItemIcon, paintSlotCount, pasteIcon } from "./fixture";
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

const buildRefs = () => Promise.all(IDS.map(async id => potionRefOf(id, await loadItemIcon(id))));

describe("matchPotion（合成畫面）", () => {
  it("四種藥水自己比自己都對、互比不混（兩種格子底色、有沒有數字）", async () => {
    const refs = await buildRefs();
    let worstSelf = 0;
    let bestOther = Infinity;
    for (const bg of BGS) {
      for (const id of IDS) {
        for (const count of [null, 702]) {
          const icon = await slotIcon(id, bg, count);
          expect(matchPotion(icon, refs, count)).toBe(id);
          for (const ref of refs) {
            const d = refDistance(icon, ref, count);
            if (ref.id === id) worstSelf = Math.max(worstSelf, d);
            else bestOther = Math.min(bestOther, d);
          }
        }
      }
    }
    console.log(`合成藥水距離：自己最大 ${worstSelf.toFixed(1)}、別種最小 ${bestOther.toFixed(1)}、門檻 ${POTION_MAX_DISTANCE}`);
    expect(worstSelf).toBeLessThan(POTION_MAX_DISTANCE);
    expect(bestOther).toBeGreaterThan(POTION_MAX_DISTANCE);
  });

  it("雜訊圖、空白格子 → null；長度不對 → Infinity", async () => {
    const refs = await buildRefs();
    const noise = new Uint8ClampedArray(16 * 16 * 4);
    let seed = 7;
    for (let i = 0; i < noise.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      noise[i] = i % 4 === 3 ? 255 : seed % 256;
    }
    expect(matchPotion(noise, refs)).toBeNull();
    expect(matchPotion(new Uint8ClampedArray(16 * 16 * 4).fill(30), refs)).toBeNull();
    expect(iconDistance(new Uint8ClampedArray(10), refs[0].icons[0])).toBe(Infinity);
    expect(iconDistance(refs[0].icons[0], new Uint8ClampedArray(10))).toBe(Infinity);
  });
});

describe("matchPotion（真截圖 window-1364.png）", () => {
  // 左上到右下 8 格：技能、白色藥水(702)、技能、藍色藥水(279)、礦泉水(141)、活力藥水(0)、技能、一種食物(2)
  // 站上同一張圖有好幾個編號的（藍色藥水 2000003＝藍色濃縮藥水 2000017、活力藥水 2000006＝2000018、三種香水）取編號最小的，所以參考要照編號排
  const POOL = ["藥水", "食物", "狀態消耗", "特殊消耗"];
  const WANT: Array<number | null> = [null, 2000002, null, 2000003, 2022000, 2000006, null, 2022060];

  it("每格認成真的那一種、技能格是 null，而且差距拉得夠開", async () => {
    const items = (JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "public/data/items.json"), "utf8")) as Item[])
      .filter(item => item.c === "消耗" && POOL.includes(item.s ?? ""))
      .sort((a, b) => a.id - b.id);
    const refs: PotionRef[] = [];
    for (const item of items) {
      try {
        refs.push(potionRefOf(item.id, await loadItemIcon(item.id)));
      } catch {
        // 沒有圖示檔的跳過
      }
    }
    const frame = await loadFixture("window-1364.png");
    const slots = readQuickslot(frame, findStatusBar(frame)!)!;
    let worstRight = 0;
    let bestSkill = Infinity;
    const lines: string[] = [];
    slots.forEach((slot, i) => {
      const ds = refs.map(ref => ({ id: ref.id, d: refDistance(slot.icon!, ref, slot.count) })).sort((a, b) => a.d - b.d);
      lines.push(`${i}:${slot.count}→${ds[0].id} ${ds[0].d.toFixed(1)}（第二 ${ds[1].id} ${ds[1].d.toFixed(1)}）`);
      if (WANT[i] === null) bestSkill = Math.min(bestSkill, ds[0].d);
      else worstRight = Math.max(worstRight, ds.find(x => x.id === WANT[i])!.d);
      expect(matchPotion(slot.icon!, refs, slot.count), `第 ${i} 格`).toBe(WANT[i]);
    });
    console.log(`真截圖：${lines.join("；")}；認對最大 ${worstRight.toFixed(1)}、技能格最小 ${bestSkill.toFixed(1)}、門檻 ${POTION_MAX_DISTANCE}`);
    expect(worstRight).toBeLessThan(POTION_MAX_DISTANCE);
    expect(bestSkill).toBeGreaterThan(POTION_MAX_DISTANCE);
  }, 120000);
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

  it("drop rebase: 同一個新數字連續讀到夠多次 → 重新起算、標 skipped、不算用量", () => {
    // 702 → 一直是 30（丟掉一堆、換一組）：前面擋下，連續 DROP_REBASE 次一樣就接受
    let t = feed(start, 702, 702, 30);
    for (let i = 0; i < 3; i++) {
      t = feed(t, 30);
      expect(t.slots[0]).toMatchObject({ lastCount: 702, used: 0 });
    }
    t = feed(t, 30);
    expect(t.slots[0]).toMatchObject({ lastCount: 30, used: 0, skipped: true });
    t = feed(t, 28, 28);
    expect(t.slots[0]).toMatchObject({ lastCount: 28, used: 2, skipped: true });
    expect(potionSummary(t, 10, () => 1).uncounted).toBe(true);
  });

  it("drop rebase: 中間讀回原本的數字或換別的數字就重數", () => {
    let t = feed(start, 702, 702, 30, 30, 30, 30);
    t = feed(t, 702); // 讀回來了
    t = feed(t, 30, 30, 30, 30);
    expect(t.slots[0]).toMatchObject({ lastCount: 702 });
    expect(t.slots[0].skipped).toBeUndefined();
    expect(potionSummary(t, 10, () => 1).uncounted).toBe(false);
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
