// src/lib/speed/__tests__/read-extras.test.ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { potionRefOf, type PotionRef } from "../potions";
import { createExtrasState, potionPoolIds, readExtras, SLOT_EVERY_MS } from "../read-extras";
import { findQuickslot } from "../quickslot";
import { findStatusBar } from "../status-bar";
import type { Item } from "../../types";
import { loadFixture, loadItemIcon, paintSlotCount, pasteIcon } from "./fixture";

const items = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "public/data/items.json"), "utf8")) as Item[];

async function loadRefs(): Promise<PotionRef[]> {
  const refs: PotionRef[] = [];
  for (const id of potionPoolIds(items)) {
    try {
      refs.push(potionRefOf(id, await loadItemIcon(id)));
    } catch {
      // 沒有圖示檔的跳過
    }
  }
  return refs;
}

describe("potionPoolIds", () => {
  it("只拿藥水、食物、狀態消耗、特殊消耗（不拿卷軸、怪物卡、飛鏢），由小到大", () => {
    const ids = potionPoolIds(items);
    expect(ids).toContain(2000002);
    expect(ids).toContain(2000003);
    expect(ids).toContain(2022000);
    const byId = new Map(items.map(item => [item.id, item]));
    expect(ids.every(id => byId.get(id)?.c === "消耗" && ["藥水", "食物", "狀態消耗", "特殊消耗"].includes(byId.get(id)?.s ?? ""))).toBe(true);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });
});

describe("readExtras（真截圖 window-1364.png）", () => {
  it("每張都讀 HP；快捷鍵 3 秒讀一次，數量跟藥水都對", async () => {
    const frame = await loadFixture("window-1364.png");
    const bar = findStatusBar(frame)!;
    const state = createExtrasState();
    state.refs = await loadRefs();

    const first = readExtras(frame, bar, 10_000, state);
    expect(Math.abs(first.hp! - 1146 / 1296)).toBeLessThanOrEqual(0.03);
    expect(first.slots?.map(slot => slot.count)).toEqual([null, 702, null, 279, 141, 0, null, 2]);
    expect(first.slots?.map(slot => slot.ids)).toEqual([null, [2000002], null, [2000003, 2000017], [2022000], [2000006, 2000018], null, [2022060, 2022061, 2022062]]);

    // 不到 3 秒：只有 HP，沒有 slots（不是 null，是這張沒讀）
    const soon = readExtras(frame, bar, 10_000 + SLOT_EVERY_MS - 1, state);
    expect(soon.hp).not.toBeNull();
    expect("slots" in soon).toBe(false);

    // 到 3 秒：再讀；畫面沒變，認藥水用上次的結果（一樣的答案）
    const again = readExtras(frame, bar, 10_000 + SLOT_EVERY_MS, state);
    expect(again.slots).toEqual(first.slots);
  }, 120000);

  it("數量變了：先跟上次認出來的比（快路）；格子換成別種藥水就整池重認，不沿用", async () => {
    const base = await loadFixture("window-1364.png");
    const bar = findStatusBar(base)!;
    const rects = findQuickslot(base, bar)!;
    const state = createExtrasState();
    state.refs = await loadRefs();
    readExtras(base, bar, 0, state);
    const fullBefore = state.stats.full;

    const fewer = paintSlotCount(pasteIcon(base, rects[1], await loadItemIcon(2000002)), rects[1], 700, { clear: false });
    const next = readExtras(fewer, findStatusBar(fewer)!, SLOT_EVERY_MS, state);
    expect(next.slots?.[1]).toEqual({ index: 1, ids: [2000002], count: 700 });
    expect(state.stats.fast).toBeGreaterThanOrEqual(1);
    expect(state.stats.full).toBe(fullBefore);

    const swapped = paintSlotCount(pasteIcon(base, rects[1], await loadItemIcon(2000000)), rects[1], 50, { clear: false });
    const after = readExtras(swapped, findStatusBar(swapped)!, 2 * SLOT_EVERY_MS, state);
    expect(after.slots?.[1].ids).not.toEqual([2000002]);
    expect(state.stats.full).toBeGreaterThan(fullBefore);
  }, 120000);

  it("還沒載好藥水圖：數量照讀，是哪種藥水先不知道（ids 是 null）", async () => {
    const frame = await loadFixture("window-1364.png");
    const out = readExtras(frame, findStatusBar(frame)!, 0, createExtrasState());
    expect(out.slots?.map(slot => slot.count)).toEqual([null, 702, null, 279, 141, 0, null, 2]);
    expect(out.slots?.every(slot => slot.ids === null)).toBe(true);
  });

  it("沒有狀態列：HP 讀不到、不讀快捷鍵", async () => {
    const frame = await loadFixture("window-1364.png");
    expect(readExtras(frame, null, 0, createExtrasState())).toEqual({ hp: null });
  });
});
