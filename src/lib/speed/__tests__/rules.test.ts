// src/lib/speed/__tests__/rules.test.ts
import { describe, expect, it } from "vitest";
import type { Monster, TrainingRow } from "@/lib/types";
import monsterJson from "../../../../public/data/monsters.json";
import trainingJson from "../../../../public/data/training.json";
import { checkRun, expPer10, mapCap, mapKillCap, toRow, type RunPayload } from "../server/rules";

const run: RunPayload = {
  mapId: 105040303, mapName: "森林迷宮III", level: 46, job: 220, charId: "芙莉蓮熊芙莉", isPublic: false, partyLevels: [], partyHitter: 0, mode: "auto",
  startedAt: "2026-10-13T10:00:00.000Z", durationSec: 900, expGained: 150_000, levelUps: 0, deaths: 0, clientVer: "v0.95",
};

/** 檢查「開始時間」用的現在：比 run.startedAt 晚 5 分鐘 */
const NOW = Date.parse("2026-10-13T10:05:00.000Z");
const MIN = 60_000;
const DAY = 24 * 3600_000;

function mob(id: number, lv: number | null, exp: number): Monster {
  return { id, n: `怪${id}`, lv, exp, hp: 100, pad: 0, pdd: 0, mad: 0, mdd: 0, acc: 0, eva: 0, spd: 0, maps: [1], drops: [] };
}

function row(mobs: [number, number, number][]): TrainingRow {
  return { m: 1, sp: mobs.reduce((sum, [, spawns]) => sum + spawns, 0), exp1: 0, hp: 0, eff: 0, resp: 7, lv: 30, lvMin: 30, lvMax: 30, mobs };
}

describe("存一筆的檢查", () => {
  it("正常的過；ID 前後空白去掉", () => {
    expect(checkRun({ ...run, charId: "  芙莉蓮熊芙莉 " }, NOW)).toEqual({ ok: true, run });
  });

  it("組隊的過：其他隊員等級 1～5 個、誰在打怪（0＝自己）", () => {
    const party = { partyLevels: [44, 47, 50, 46, 45], partyHitter: 5 };
    expect(checkRun({ ...run, ...party }, NOW)).toEqual({ ok: true, run: { ...run, ...party } });
    expect(checkRun({ ...run, partyLevels: [44], partyHitter: 0 }, NOW).ok).toBe(true);
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
    const result = checkRun({ ...run, ...patch }, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(word);
  });

  it("不是物件不收", () => {
    expect(checkRun(null, NOW).ok).toBe(false);
    expect(checkRun("x", NOW).ok).toBe(false);
  });

  it.each([
    [{ level: "46" }, "等級"],
    [{ level: 1e999 }, "等級"],
    [{ level: null }, "等級"],
    [{ mapId: 1.5 }, "地圖"],
    [{ mapId: undefined }, "地圖"],
    [{ mapId: "105040303" }, "地圖"],
    [{ mapId: -1 }, "地圖"],
    [{ job: undefined }, "職業"],
    [{ job: 1000 }, "職業"],
    [{ durationSec: "900" }, "時間"],
    [{ expGained: 1e999 }, "經驗"],
    [{ expGained: Number.MAX_SAFE_INTEGER + 2 }, "經驗"],
  ])("型別不對 %o 不收（%s）", (patch, word) => {
    const result = checkRun({ ...run, ...patch }, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(word);
  });

  it("時間剛好 600 秒的過；上下限剛好的也過", () => {
    expect(checkRun({ ...run, durationSec: 600 }, NOW).ok).toBe(true);
    expect(checkRun({ ...run, durationSec: 300 }, NOW).ok).toBe(true);
    expect(checkRun({ ...run, durationSec: 6 * 3600 }, NOW).ok).toBe(true);
  });

  it("惡意的內容：多塞的欄位（ranked、expPer10、__proto__）一律丟掉，只留認得的欄位", () => {
    const extra = JSON.stringify({ ...run, ranked: true, expPer10: 9e15, killsPer10: 1, partySize: 99, id: 7, constructor: { prototype: { polluted: 1 } } });
    // JSON.parse 會把 "__proto__" 當一般的欄位（不是換掉原型），這就是惡意送來的樣子
    const body = JSON.parse(`{"__proto__":{"polluted":true},${extra.slice(1)}`);
    expect(Object.prototype.hasOwnProperty.call(body, "__proto__")).toBe(true);
    const result = checkRun(body, NOW);
    expect(result).toEqual({ ok: true, run });
    if (result.ok) {
      expect(Object.keys(result.run).sort()).toEqual(Object.keys(run).sort());
      expect(Object.getPrototypeOf(result.run)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(result.run, "__proto__")).toBe(false);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("惡意的內容：自己說 ranked 沒用，進不進排行伺服器自己算", () => {
    const result = checkRun({ ...run, expGained: 9e15, ranked: true, expPer10: 1 }, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(toRow(result.run, 200_000)).toMatchObject({ ranked: false, expPer10: 6e15 });
  });

  it("partyLevels 是複製出來的，不跟送來的陣列共用", () => {
    const levels = [44, 47];
    const result = checkRun({ ...run, partyLevels: levels, partyHitter: 0 }, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.run.partyLevels).toEqual([44, 47]);
      expect(result.run.partyLevels).not.toBe(levels);
    }
  });
});

describe("開始時間", () => {
  const started = (startedAt: unknown) => checkRun({ ...run, startedAt }, NOW);

  it("統一寫成 UTC 的標準格式再存", () => {
    const result = started("2026-10-13T18:00:00+08:00");
    expect(result.ok && result.run.startedAt).toBe("2026-10-13T10:00:00.000Z");
    const loose = started("Tue, 13 Oct 2026 10:00:00 GMT");
    expect(loose.ok && loose.run.startedAt).toBe("2026-10-13T10:00:00.000Z");
  });

  it.each(["1", "2026", "0", "+275760-09-13T00:00:00.000Z", "-000001-01-01T00:00:00.000Z", "2026-10-13T10:00:00.000Zjunk", ""])("亂寫的 %j 不收", value => {
    const result = started(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("開始時間");
  });

  it.each([null, 1760349600000, {}, ["2026-10-13T10:00:00.000Z"]])("不是字串 %j 不收", value => {
    const result = started(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("開始時間");
  });

  it("只收最近 7 天內、最多比現在晚 5 分鐘", () => {
    const iso = (ms: number) => new Date(ms).toISOString();
    expect(started(iso(NOW - 7 * DAY)).ok).toBe(true);
    expect(started(iso(NOW - 7 * DAY - 1)).ok).toBe(false);
    expect(started(iso(NOW + 5 * MIN)).ok).toBe(true);
    expect(started(iso(NOW + 5 * MIN + 1)).ok).toBe(false);
    const tooOld = started(iso(NOW - 8 * DAY));
    expect(!tooOld.ok && tooOld.error).toContain("開始時間");
    const future = started(iso(NOW + 60 * MIN));
    expect(!future.ok && future.error).toContain("開始時間");
  });

  it("不帶現在時間就用系統的現在", () => {
    expect(checkRun({ ...run, startedAt: new Date().toISOString() }).ok).toBe(true);
    expect(checkRun({ ...run, startedAt: new Date(Date.now() - 8 * DAY).toISOString() }).ok).toBe(false);
  });
});

describe("名字跟文字欄位", () => {
  const check = (patch: Record<string, unknown>) => checkRun({ ...run, ...patch }, NOW);

  it.each([
    ["零寬空白", "芙莉蓮\u200B熊"],
    ["全部是零寬空白", "\u200B\u200B\u200B"],
    ["NUL", "芙莉\u0000蓮熊"],
    ["換行", "芙莉\n蓮熊"],
    ["Tab", "芙莉\t蓮熊"],
    ["雙向控制字元", "芙莉\u202E蓮熊"],
    ["單獨的代理字元", "芙莉\uD800蓮熊"],
    ["中間的 BOM", "芙莉\uFEFF蓮熊"],
  ])("角色 ID 有%s不收", (_name, charId) => {
    const result = check({ charId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("角色 ID");
  });

  it("角色 ID 太長的先擋掉；成對的罕見字照字數算", () => {
    const result = check({ charId: "a".repeat(49) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("角色 ID");
    expect(check({ charId: "一".repeat(12) }).ok).toBe(true);
    expect(check({ charId: "𠮷".repeat(12) }).ok).toBe(true);
    expect(check({ charId: "𠮷".repeat(13) }).ok).toBe(false);
  });

  it("角色 ID 前後的空白去掉；不是字串不收", () => {
    expect(check({ charId: "\u3000 芙莉蓮熊芙莉 \t" }).ok).toBe(true);
    // 開頭的 BOM 被 trim 一起去掉（JS 把它當空白），剩下的字沒問題
    const bom = check({ charId: "\uFEFF芙莉蓮熊芙莉" });
    expect(bom.ok && bom.run.charId).toBe("芙莉蓮熊芙莉");
    expect(check({ charId: 12345 }).ok).toBe(false);
  });

  it("地圖名稱、版本：看不見的控制字元拿掉，不整筆擋掉", () => {
    const result = check({ mapName: "森林\u200B迷宮\u0000III\u202E", clientVer: "v0.\u200B95\n" });
    expect(result.ok && result.run.mapName).toBe("森林迷宮III");
    expect(result.ok && result.run.clientVer).toBe("v0.95");
  });

  it("地圖名稱照字數（不是 UTF-16 單位）切 40 個字、版本 20 個字，不會切壞成對的字", () => {
    const result = check({ mapName: "𠮷".repeat(50), clientVer: "𠮷".repeat(30) });
    expect(result.ok && result.run.mapName).toBe("𠮷".repeat(40));
    expect(result.ok && result.run.clientVer).toBe("𠮷".repeat(20));
    // 第 40 個字剛好落在成對的字中間（UTF-16 的第 40 格）也不會留下半個
    const edge = check({ mapName: "a".repeat(39) + "𠮷𠮷", clientVer: "a".repeat(19) + "𠮷𠮷" });
    expect(edge.ok && edge.run.mapName).toBe("a".repeat(39) + "𠮷");
    expect(edge.ok && edge.run.clientVer).toBe("a".repeat(19) + "𠮷");
    expect(edge.ok && /[\uD800-\uDFFF]/u.test(edge.run.mapName ?? "")).toBe(false);
    // 原本就夾著單獨的代理字元：拿掉，不留到資料庫
    const lone = check({ mapName: "森林\uD800迷宮", clientVer: "v\uDC00" });
    expect(lone.ok && lone.run.mapName).toBe("森林迷宮");
    expect(lone.ok && lone.run.clientVer).toBe("v");
  });

  it("地圖名稱不是字串、或拿掉後什麼都不剩 → null；版本不是字串 → 空字串", () => {
    const blank = check({ mapName: "\u200B\u200B", clientVer: 5 });
    expect(blank.ok && blank.run.mapName).toBeNull();
    expect(blank.ok && blank.run.clientVer).toBe("");
    const number = check({ mapName: 12 });
    expect(number.ok && number.run.mapName).toBeNull();
  });

  it("超長的地圖名稱先砍掉再處理，不會拖慢", () => {
    const begin = Date.now();
    const result = check({ mapName: "森".repeat(2_000_000), clientVer: "v".repeat(2_000_000) });
    expect(result.ok && result.run.mapName).toBe("森".repeat(40));
    expect(result.ok && result.run.clientVer).toBe("v".repeat(20));
    expect(Date.now() - begin).toBeLessThan(500);
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

  it("進排行：滿 10 分鐘、有地圖、這張圖有練功資料（有上限）、沒超過上限", () => {
    expect(toRow(run, 200_000)).toMatchObject({ expPer10: 100_000, ranked: true });
    expect(toRow({ ...run, durationSec: 600, expGained: 100_000 }, 200_000)).toMatchObject({ expPer10: 100_000, ranked: true });
    expect(toRow({ ...run, durationSec: 599 }, 200_000).ranked).toBe(false);
    expect(toRow({ ...run, mapId: null }, 200_000).ranked).toBe(false);
    expect(toRow(run, 99_999).ranked).toBe(false);
    expect(toRow(run, 100_000).ranked).toBe(true);
  });

  it("經驗是 0 的不進排行（單練、組隊都一樣）", () => {
    expect(toRow({ ...run, expGained: 0 }, 200_000).ranked).toBe(false);
    const monsters = new Map([[10, mob(10, 30, 100)]]);
    expect(toRow({ ...run, level: 30, expGained: 0, partyLevels: [30], partyHitter: 1 }, 200_000, row([[10, 5, 7]]), monsters).ranked).toBe(false);
  });

  it("沒有上限（這張圖沒有練功資料，例如亂編的地圖編號）不進排行", () => {
    // Task 9 修正第 1 輪、裁決 I3：原本 cap === null 也進排行，亂編 mapId 就能灌出約 1.8e16 的假榜首；
    // 原本這裡寫的是 toRow(run, null).ranked === true，照裁決改成 false。
    expect(toRow(run, null).ranked).toBe(false);
    expect(toRow({ ...run, mapId: 999_999_999, expGained: Number.MAX_SAFE_INTEGER }, null).ranked).toBe(false);
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

describe("組隊榜：全隊 10 分鐘打幾隻的上限（10/13 最終審查）", () => {
  const MAP = 105040303; // 森林迷宮III
  const monsterList = monsterJson as unknown as Monster[];
  const trainingRows = trainingJson as unknown as TrainingRow[];
  const mapRow = trainingRows.find(item => item.m === MAP)!;
  const monsterById = new Map(monsterList.map(monster => [monster.id, monster]));

  it("上限＝每個刷怪點 600 ÷ 重生秒數（0 當 7 秒、最少 5 秒）加起來 × 3", () => {
    expect(mapKillCap(row([[10, 20, 0], [11, 1, 10800]]))).toBe(Math.round((20 * (600 / 7) + 1 * (600 / 10800)) * 3));
    // 重生 3 秒照 5 秒算
    expect(mapKillCap(row([[10, 2, 3]]))).toBe(Math.round(2 * (600 / 5) * 3));
    // 森林迷宮III：47 個 7 秒的點＋1 個 3 小時的點 → (4028.6) × 3
    expect(mapKillCap(mapRow)).toBe(12086);
  });

  it("審查的例子：森林迷宮III、自己 53 級跟五個 120 級吸經驗，經驗剛好在這張圖的上限 → 回推十幾萬隻，不進排行", () => {
    const cap = mapCap(MAP, trainingRows, monsterList)!;
    const leech: RunPayload = { ...run, level: 53, partyLevels: [120, 120, 120, 120, 120], partyHitter: 1, durationSec: 600, expGained: cap };
    const result = toRow(leech, cap, mapRow, monsterById);
    // 經驗沒超過上限（以前只看這個，所以會上榜）
    expect(result.expPer10).toBe(cap);
    expect(result.killsPer10).toBeGreaterThan(120_000);
    expect(result.killsPer10).toBeGreaterThan(mapKillCap(mapRow));
    expect(result.ranked).toBe(false);
  });

  it("正常的組隊（46 級、隊友 44／47 級打怪，15 分鐘 150,000）照樣進排行", () => {
    const cap = mapCap(MAP, trainingRows, monsterList)!;
    const party: RunPayload = { ...run, partyLevels: [44, 47], partyHitter: 2 };
    const result = toRow(party, cap, mapRow, monsterById);
    expect(result.killsPer10).not.toBeNull();
    expect(result.killsPer10!).toBeLessThanOrEqual(mapKillCap(mapRow));
    expect(result.ranked).toBe(true);
  });

  it("剛好等於上限還算，多一點就不算", () => {
    // 7 個 7 秒的點 → 上限 1800 隻；自己 30 級、隊友 30 級打怪，每隻自己拿 44 → 79,200 經驗＝1800 隻
    const small = row([[10, 7, 7]]);
    const monsters = new Map([[10, mob(10, 30, 100)]]);
    const party: RunPayload = { ...run, level: 30, partyLevels: [30], partyHitter: 1, durationSec: 600 };
    expect(mapKillCap(small)).toBe(1800);
    expect(toRow({ ...party, expGained: 79_200 }, 999_999, small, monsters)).toMatchObject({ killsPer10: 1800, ranked: true });
    expect(toRow({ ...party, expGained: 79_245 }, 999_999, small, monsters)).toMatchObject({ killsPer10: 1801, ranked: false });
  });

  it("組隊卻算不出打幾隻（沒給練功資料、自己吸不到經驗）→ 不進排行；單練不用算打幾隻", () => {
    const party: RunPayload = { ...run, partyLevels: [44], partyHitter: 1 };
    expect(toRow(party, 200_000).ranked).toBe(false);
    const low: RunPayload = { ...run, level: 10, partyLevels: [60], partyHitter: 1, durationSec: 600, expGained: 100 };
    expect(toRow(low, 999_999, row([[10, 5, 7]]), new Map([[10, mob(10, 100, 100)]]))).toMatchObject({ killsPer10: null, ranked: false });
    expect(toRow(run, 200_000).ranked).toBe(true);
  });
});
