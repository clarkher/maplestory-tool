// src/lib/speed/__tests__/rules.test.ts
import { describe, expect, it } from "vitest";
import type { Monster, TrainingRow } from "@/lib/types";
import { checkRun, expPer10, mapCap, toRow, type RunPayload } from "../server/rules";

const run: RunPayload = {
  mapId: 105040303, mapName: "森林迷宮III", level: 46, job: 220, charId: "芙莉蓮熊芙莉", isPublic: false, partyLevels: [], partyHitter: 0, mode: "auto",
  startedAt: "2026-10-13T10:00:00.000Z", durationSec: 900, expGained: 150_000, levelUps: 0, deaths: 0, clientVer: "v0.95",
};

function mob(id: number, lv: number | null, exp: number): Monster {
  return { id, n: `怪${id}`, lv, exp, hp: 100, pad: 0, pdd: 0, mad: 0, mdd: 0, acc: 0, eva: 0, spd: 0, maps: [1], drops: [] };
}

function row(mobs: [number, number, number][]): TrainingRow {
  return { m: 1, sp: mobs.reduce((sum, [, spawns]) => sum + spawns, 0), exp1: 0, hp: 0, eff: 0, resp: 7, lv: 30, lvMin: 30, lvMax: 30, mobs };
}

describe("存一筆的檢查", () => {
  it("正常的過；ID 前後空白去掉", () => {
    expect(checkRun({ ...run, charId: "  芙莉蓮熊芙莉 " })).toEqual({ ok: true, run });
  });

  it("組隊的過：其他隊員等級 1～5 個、誰在打怪（0＝自己）", () => {
    const party = { partyLevels: [44, 47, 50, 46, 45], partyHitter: 5 };
    expect(checkRun({ ...run, ...party })).toEqual({ ok: true, run: { ...run, ...party } });
    expect(checkRun({ ...run, partyLevels: [44], partyHitter: 0 }).ok).toBe(true);
  });

  it.each([
    [{ level: 0 }, "等級"],
    [{ level: 121 }, "等級"],
    [{ durationSec: 299 }, "時間"],
    [{ durationSec: 6 * 3600 + 1 }, "時間"],
    [{ expGained: -1 }, "經驗"],
    [{ charId: "a" }, "角色 ID"],
    [{ charId: "一二三四五六七八九十一二三" }, "角色 ID"],
    [{ partyLevels: [40, 41, 42, 43, 44, 45], partyHitter: 0 }, "組隊"],
    [{ partyLevels: [40, 0], partyHitter: 0 }, "組隊"],
    [{ partyLevels: [40, 121], partyHitter: 0 }, "組隊"],
    [{ partyLevels: [40, 41.5], partyHitter: 0 }, "組隊"],
    [{ partyLevels: "40", partyHitter: 0 }, "組隊"],
    [{ partyLevels: undefined, partyHitter: 0 }, "組隊"],
    [{ partyLevels: [], partyHitter: 1 }, "組隊"],
    [{ partyLevels: [40, 41], partyHitter: 3 }, "組隊"],
    [{ partyLevels: [40, 41], partyHitter: -1 }, "組隊"],
    [{ partyLevels: [40], partyHitter: 0.5 }, "組隊"],
    [{ mode: "fast" }, "模式"],
    [{ startedAt: "昨天" }, "開始時間"],
  ])("%o 不收（%s）", (patch, word) => {
    const result = checkRun({ ...run, ...patch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(word);
  });

  it("不是物件不收", () => {
    expect(checkRun(null).ok).toBe(false);
    expect(checkRun("x").ok).toBe(false);
  });
});

describe("10 分鐘經驗、上限、進排行", () => {
  it("10 分鐘經驗＝拿到的 ÷ 秒數 × 600", () => {
    expect(expPer10(150_000, 900)).toBe(100_000);
  });

  it("上限：每隻怪經驗 × 刷怪點 × (600 ÷ 重生秒數，最少 5 秒、0 當 7 秒) × 3", () => {
    const training = [{ m: 1, mobs: [[10, 20, 0], [11, 1, 10800]] }] as unknown as TrainingRow[];
    const monsters = [{ id: 10, exp: 50 }, { id: 11, exp: 9000 }] as unknown as Monster[];
    expect(mapCap(1, training, monsters)).toBe(Math.round((50 * 20 * (600 / 7) + 9000 * 1 * (600 / 10800)) * 3));
    expect(mapCap(2, training, monsters)).toBeNull();
  });

  it("進排行：滿 10 分鐘、有地圖、沒超過上限", () => {
    expect(toRow(run, 200_000)).toMatchObject({ expPer10: 100_000, ranked: true });
    expect(toRow({ ...run, durationSec: 599 }, 200_000).ranked).toBe(false);
    expect(toRow({ ...run, mapId: null }, 200_000).ranked).toBe(false);
    expect(toRow(run, 99_999).ranked).toBe(false);
    expect(toRow(run, null).ranked).toBe(true);
  });
});

describe("組隊人數、全隊打幾隻", () => {
  const solo: RunPayload = { ...run, level: 30, durationSec: 600, expGained: 1000 };
  const monsters = new Map([[10, mob(10, 30, 100)]]);

  it("組隊人數＝自己＋其他隊員", () => {
    expect(toRow(run, null).partySize).toBe(1);
    expect(toRow({ ...run, partyLevels: [44, 47], partyHitter: 2 }, null).partySize).toBe(3);
  });

  it("單練、怪經驗 100、10 分鐘 1000 → 10 隻", () => {
    expect(toRow(solo, null, row([[10, 5, 7]]), monsters)).toMatchObject({ expPer10: 1000, partySize: 1, killsPer10: 10 });
  });

  it("小數一位", () => {
    expect(toRow({ ...solo, expGained: 1001 }, null, row([[10, 5, 7]]), monsters).killsPer10).toBe(10.0);
    expect(toRow({ ...solo, expGained: 1234 }, null, row([[10, 5, 7]]), monsters).killsPer10).toBe(12.3);
  });

  it("組隊：自己吸經驗，照組隊公式回推全隊打幾隻", () => {
    // 自己 30 級、隊友 30 級在打：每隻怪自己拿 (0.8×1/2)×100×1.1 = 44 → 880 ÷ 44 = 20 隻
    const party: RunPayload = { ...solo, expGained: 880, partyLevels: [30], partyHitter: 1 };
    expect(toRow(party, null, row([[10, 5, 7]]), monsters)).toMatchObject({ partySize: 2, killsPer10: 20 });
  });

  it("沒給練功資料或怪物表 → null", () => {
    expect(toRow(solo, null).killsPer10).toBeNull();
    expect(toRow(solo, null, row([[10, 5, 7]])).killsPer10).toBeNull();
    expect(toRow(solo, null, undefined, monsters).killsPer10).toBeNull();
  });

  it("圖上的怪都沒經驗資料 → null", () => {
    expect(toRow(solo, null, row([[99, 5, 7]]), monsters).killsPer10).toBeNull();
  });

  it("自己吸不到經驗（等級太低、不是打怪的人）→ null，不是 Infinity", () => {
    const low: RunPayload = { ...solo, level: 10, partyLevels: [60], partyHitter: 1 };
    expect(toRow(low, null, row([[10, 5, 7]]), new Map([[10, mob(10, 100, 100)]])).killsPer10).toBeNull();
  });

  it("有沒有練功資料都不影響進不進排行", () => {
    expect(toRow(solo, 5_000, row([[10, 5, 7]]), monsters).ranked).toBe(true);
    expect(toRow(solo, 999, row([[10, 5, 7]]), monsters).ranked).toBe(false);
  });
});
