// src/lib/speed/__tests__/tracker.test.ts
import { describe, expect, it } from "vitest";
import {
  createTracker, dropMap, durationMs, feed, mainMap, MAX_DEATH_SHARE, MAX_STEP_SHARE, minutesToLevel, MISS_LIMIT, shouldSave, startManual, stopManual, switchMode, tenMinuteExp, tick,
  type Sample, type Tracker,
} from "../tracker";
import { durationText, etaText } from "../format";

const toNext = Array.from({ length: 121 }, (_, level) => level * 1000);
const S = (at: number, exp: number, level = 10, extra: Partial<Sample> = {}): Sample => ({ at, exp, level, mapKey: "m1", mapId: 1, job: 220, party: 1, ...extra });

function run(t: Tracker, samples: Sample[]) {
  const closed = [];
  for (const sample of samples) {
    const step = feed(t, sample, toNext);
    t = step.tracker;
    if (step.closed) closed.push(step.closed);
  }
  return { t, closed };
}

describe("自動模式", () => {
  it("前兩張等級一樣才當起點；經驗一動才開始，那一下不算", () => {
    const { t } = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100)]);
    expect(t.seg).toMatchObject({ startedAt: 2000, gained: 0 });
  });

  it("之後的變動累加；60 秒沒動自動停，結束時間是最後一次變動", () => {
    // 兩次變動之間不到 60 秒（隔 60 秒整的下一張讀數會先把這段收掉，見下面「計時器被拖慢」）
    let { t } = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100), S(32_000, 1200), S(62_000, 1300)]);
    expect(t.seg!.gained).toBe(200);
    expect(tick(t, 100_000).closed).toBeNull();
    const step = tick(t, 122_000);
    expect(step.closed).toMatchObject({ endedAt: 62_000, gained: 200 });
    expect(durationMs(step.closed!)).toBe(60_000);
    t = step.tracker;
    expect(t.seg).toBeNull();
  });

  it("升級：上一級剩的＋新一級的", () => {
    const { t } = run(createTracker("auto"), [S(0, 9900), S(1000, 9900), S(2000, 9950), S(3000, 30, 11)]);
    expect(t.seg).toMatchObject({ gained: 80, levelUps: 1, level: 11 });
  });

  it("死掉（少 1% 以上）照扣、記一次；少一點點當認錯丟掉", () => {
    let { t } = run(createTracker("auto"), [S(0, 5000), S(1000, 5000), S(2000, 5100), S(3000, 5200)]);
    t = run(t, [S(4000, 5195)]).t;
    expect(t.seg).toMatchObject({ gained: 100, deaths: 0 });
    t = run(t, [S(5000, 4700)]).t;
    expect(t.seg).toMatchObject({ gained: -400, deaths: 1 });
  });

  it("等級跳兩級、等級變少：當認錯丟掉", () => {
    const { t } = run(createTracker("auto"), [S(0, 5000), S(1000, 5000), S(2000, 5100), S(3000, 10, 13), S(4000, 10, 9)]);
    expect(t.last!.level).toBe(10);
    expect(t.seg!.gained).toBe(0);
  });

  it("計時器被拖慢（遊戲蓋住瀏覽器）、讀數照樣進來：隔 60 秒以上的那張讀數先把這段收在最後一次變動，再開新的一段", () => {
    // 32 秒最後一次變動，之後 120 秒只有讀數、沒有 tick；152 秒經驗又動
    const { t, closed } = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100), S(32_000, 1300), S(152_000, 1400)]);
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ startedAt: 2000, endedAt: 32_000, lastChangeAt: 32_000, gained: 200 });
    // 這段的時間不含中間發呆的 120 秒
    expect(durationMs(closed[0])).toBe(30_000);
    expect(tenMinuteExp(closed[0])).toBe(4000);
    // 新的一段從經驗又動的那一下開始（那一下不算）
    expect(t.seg).toMatchObject({ startedAt: 152_000, lastChangeAt: 152_000, gained: 0, exp: 1400 });
    expect(t.last).toMatchObject({ at: 152_000, exp: 1400 });
  });

  it("發呆時每秒都有讀數（經驗沒動）：第 60 秒那張就收掉，不等經驗再動、也不等 tick", () => {
    const idle = Array.from({ length: 61 }, (_, i) => S(33_000 + i * 1000, 1300));
    const { t, closed } = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100), S(32_000, 1300), ...idle]);
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ endedAt: 32_000, gained: 200 });
    expect(t.seg).toBeNull();
    // 收掉的那一張是 92 秒（離最後一次變動剛好 60 秒）
    const before = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100), S(32_000, 1300), ...idle.filter(sample => sample.at < 92_000)]);
    expect(before.closed).toHaveLength(0);
    expect(before.t.seg).not.toBeNull();
    // 再動一下開新的一段
    const again = run(t, [S(100_000, 1350)]);
    expect(again.closed).toHaveLength(0);
    expect(again.t.seg).toMatchObject({ startedAt: 100_000, gained: 0 });
  });

  it("隔不到 60 秒（59.999 秒）又動：還是同一段", () => {
    const { t, closed } = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100), S(32_000, 1300), S(91_999, 1400)]);
    expect(closed).toHaveLength(0);
    expect(t.seg).toMatchObject({ startedAt: 2000, lastChangeAt: 91_999, gained: 300 });
  });

  it("手動模式不受影響：隔多久都不會自己收", () => {
    let t = startManual(run(createTracker("manual"), [S(0, 1000), S(1000, 1000)]).t, 1000);
    const result = run(t, [S(2000, 1100), S(500_000, 1200)]);
    expect(result.closed).toHaveLength(0);
    t = result.t;
    expect(t.seg).toMatchObject({ mode: "manual", startedAt: 1000, gained: 200 });
  });

  it("換地圖：舊的這段收掉，新圖經驗一動再開新的一段", () => {
    const { t, closed } = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100), S(3000, 1200), S(4000, 1300, 10, { mapKey: "m2", mapId: 2 })]);
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ mapKey: "m1", gained: 100 });
    expect(t.seg).toMatchObject({ mapKey: "m2", startedAt: 4000, gained: 0 });
  });

  it("組隊人數取這段看過最多的", () => {
    const { t } = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100), S(3000, 1200, 10, { party: 3 }), S(4000, 1300)]);
    expect(t.seg!.party).toBe(3);
  });
});

describe("手動模式", () => {
  it("按開始才算、不會自己停、換圖也不停；按停止才收，時間算到按停止", () => {
    let t = run(createTracker("manual"), [S(0, 1000), S(1000, 1000)]).t;
    t = startManual(t, 1500);
    const result = run(t, [S(2000, 1100), S(3000, 1300, 10, { mapKey: "m2", mapId: 2 }), S(4000, 1350, 10, { mapKey: "m2", mapId: 2 })]);
    expect(result.closed).toHaveLength(0);
    expect(tick(result.t, 999_999).closed).toBeNull();
    const step = stopManual(result.t, 600_000);
    expect(step.closed).toMatchObject({ startedAt: 1500, endedAt: 600_000, gained: 350 });
    expect(mainMap(step.closed!)).toEqual({ key: "m2", mapId: 2 });
    expect(durationMs(step.closed!)).toBe(598_500);
  });

  it("還沒讀到任何畫面就按開始：第一張讀數當起點", () => {
    let t = startManual(createTracker("manual"), 0);
    t = run(t, [S(1000, 1000), S(2000, 1000), S(3000, 1100)]).t;
    expect(t.seg).toMatchObject({ startedAt: 0, gained: 100 });
  });

  it("切模式會收掉進行中的那段", () => {
    let t = startManual(run(createTracker("manual"), [S(0, 1000), S(1000, 1000)]).t, 1000);
    t = run(t, [S(2000, 1500)]).t;
    const step = switchMode(t, "auto", 5000);
    expect(step.closed).toMatchObject({ gained: 500, endedAt: 5000 });
    expect(step.tracker.mode).toBe("auto");
    expect(step.tracker.seg).toBeNull();
  });
});

describe("算出來的數字", () => {
  it("10 分鐘經驗用最後一次變動的時間算（休息時不會往下掉）；不到 30 秒不算", () => {
    const { t } = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100), S(32_000, 1400), S(62_000, 1700)]);
    expect(tenMinuteExp(t.seg!)).toBe(6000);
    const short = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100), S(12_000, 1200)]).t;
    expect(tenMinuteExp(short.seg!)).toBeNull();
  });

  it("升級還要幾分鐘＝（這級要的−現在）÷ 每分鐘", () => {
    const { t } = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100), S(32_000, 1400), S(62_000, 1700)]);
    expect(minutesToLevel(t.seg!, toNext)).toBeCloseTo(((10_000 - 1700) / 6000) * 10);
  });

  it("滿 5 分鐘、有拿到經驗才存", () => {
    const base = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100)]).t;
    expect(shouldSave({ ...base.seg!, lastChangeAt: 2000 + 299_000, gained: 10 })).toBe(false);
    expect(shouldSave({ ...base.seg!, lastChangeAt: 2000 + 300_000, gained: 10 })).toBe(true);
    expect(shouldSave({ ...base.seg!, lastChangeAt: 2000 + 300_000, gained: 0 })).toBe(false);
  });

  it("時間的字", () => {
    expect(durationText(12 * 60_000 + 5000)).toBe("12 分");
    expect(durationText(65 * 60_000)).toBe("1 小時 5 分");
    // 不到 1 分鐘不寫「0 分」（看起來像沒在算）
    expect(durationText(0)).toBe("不到 1 分");
    expect(durationText(59_999)).toBe("不到 1 分");
    expect(durationText(60_000)).toBe("1 分");
    expect(etaText(25.2)).toBe("約 26 分鐘");
    expect(etaText(190)).toBe("約 3 小時 10 分");
    expect(etaText(60 * 30)).toBe("超過 24 小時");
  });
});

describe("擋不合理的跳動、認錯太久自己重來（10/13）", () => {
  // 10 級升級要 10000：一秒最多多 1000（MAX_STEP_SHARE 10%）；隔越久放越寬
  const started = () => run(createTracker("auto"), [S(0, 5000), S(1000, 5000), S(2000, 5100)]).t;

  it("上限跟連續幾張的常數", () => {
    expect(MAX_STEP_SHARE).toBe(0.1);
    expect(MISS_LIMIT).toBe(10);
  });

  it("一秒內從 50% 跳到下一級 30%（假的升級）：不算，gained 不變，只記一次對不上", () => {
    const t = run(started(), [S(3000, 3300, 11)]).t;
    expect(t.seg).toMatchObject({ gained: 0, levelUps: 0, level: 10 });
    expect(t.last).toMatchObject({ level: 10, exp: 5100 });
    expect(t.misses).toBe(1);
  });

  it("99% 升到下一級 0.5%：真的升級，照算", () => {
    const base = run(createTracker("auto"), [S(0, 9900), S(1000, 9900), S(2000, 9950)]).t;
    const { t } = run(base, [S(3000, 55, 11)]);
    expect(t.seg).toMatchObject({ gained: 105, levelUps: 1, level: 11 });
    expect(t.misses).toBe(0);
  });

  it("太大的同級跳動也擋掉（一秒多 20%）", () => {
    const t = run(started(), [S(3000, 7100)]).t;
    expect(t.seg!.gained).toBe(0);
    expect(t.last!.exp).toBe(5100);
    expect(t.misses).toBe(1);
  });

  it("剛好等於上限（10%）還算", () => {
    const t = run(started(), [S(3000, 6100)]).t;
    expect(t.seg!.gained).toBe(1000);
    expect(t.misses).toBe(0);
  });

  it("連續 10 張對不上：丟掉起點，下一張同等級的當新起點，進行中的那段留著", () => {
    let t = run(started(), [S(3000, 5200)]).t;
    expect(t.seg!.gained).toBe(100);
    const bad = Array.from({ length: MISS_LIMIT }, (_, i) => S(4000 + i * 1000, 10, 13));
    t = run(t, bad.slice(0, MISS_LIMIT - 1)).t;
    expect(t.last).not.toBeNull();
    expect(t.misses).toBe(MISS_LIMIT - 1);
    t = run(t, bad.slice(MISS_LIMIT - 1)).t;
    expect(t.last).toBeNull();
    expect(t.pending).toMatchObject({ level: 13 });
    expect(t.misses).toBe(0);
    expect(t.seg).toMatchObject({ gained: 100, startedAt: 2000 });
    // 下一張跟它同等級的讀數當新起點；那一下不算
    t = run(t, [S(20_000, 50, 13)]).t;
    expect(t.last).toMatchObject({ level: 13, exp: 50 });
    expect(t.pending).toBeNull();
    expect(t.seg!.gained).toBe(100);
    // 之後的讀數接著算
    t = run(t, [S(21_000, 150, 13)]).t;
    expect(t.seg!.gained).toBe(200);
    expect(t.seg!.level).toBe(13);
  });

  it("中間有一張接受的讀數，對不上的次數歸零", () => {
    let t = run(started(), Array.from({ length: MISS_LIMIT - 1 }, (_, i) => S(3000 + i * 1000, 10, 13))).t;
    expect(t.misses).toBe(MISS_LIMIT - 1);
    t = run(t, [S(20_000, 5200)]).t;
    expect(t.misses).toBe(0);
    expect(t.last).toMatchObject({ exp: 5200 });
    t = run(t, Array.from({ length: MISS_LIMIT - 1 }, (_, i) => S(21_000 + i * 1000, 10, 13))).t;
    expect(t.last).not.toBeNull();
    expect(t.misses).toBe(MISS_LIMIT - 1);
  });

  it("隔 50 秒的一次跳動上限放寬到 5 倍，不會被當成認錯；隔 10 秒同樣的跳動就擋", () => {
    // 5100 升到 11 級的 100：上一級剩 4900 ＋ 100 ＝ 5000，剛好是 50 秒的上限 5000
    // （隔 60 秒以上的讀數在自動模式會先把這段收掉，見「計時器被拖慢」，所以這裡量 50 秒）
    const ok = run(started(), [S(52_000, 100, 11)]).t;
    expect(ok.seg).toMatchObject({ gained: 5000, levelUps: 1 });
    expect(ok.misses).toBe(0);
    const tooBig = run(started(), [S(52_000, 300, 11)]).t;
    expect(tooBig.seg!.gained).toBe(0);
    expect(tooBig.misses).toBe(1);
    const blocked = run(started(), [S(12_000, 100, 11)]).t;
    expect(blocked.seg!.gained).toBe(0);
    expect(blocked.misses).toBe(1);
  });

  it("手動模式也一樣：連續 10 張對不上丟掉起點，這段不丟", () => {
    let t = run(createTracker("manual"), [S(0, 5000), S(1000, 5000)]).t;
    t = startManual(t, 1000);
    t = run(t, [S(2000, 5100)]).t;
    t = run(t, Array.from({ length: MISS_LIMIT }, (_, i) => S(3000 + i * 1000, 10, 13))).t;
    expect(t.last).toBeNull();
    expect(t.seg).toMatchObject({ mode: "manual", gained: 100 });
    t = run(t, [S(20_000, 50, 13), S(21_000, 150, 13)]).t;
    expect(t.seg!.gained).toBe(200);
    expect(stopManual(t, 30_000).closed).toMatchObject({ gained: 200, endedAt: 30_000 });
  });

  it("切模式：保留起點、對不上的次數歸零", () => {
    const t = run(started(), [S(3000, 10, 13), S(4000, 10, 13)]).t;
    expect(t.misses).toBe(2);
    const next = switchMode(t, "manual", 5000).tracker;
    expect(next.misses).toBe(0);
    expect(next.last).toBe(t.last);
    expect(next.pending).toBe(t.pending);
  });

  it("單次大額進帳（打王、任務獎勵，超過一級 10%）：被丟掉、自癒重來後也不補算，不會重複算", () => {
    // 5100 → 8100（+3000，超過上限 1000），之後停在 8100：每張都對不上，第 10 張丟掉起點，11 張當新起點
    const jumped = Array.from({ length: MISS_LIMIT }, (_, i) => S(3000 + i * 1000, 8100));
    let t = run(started(), jumped.slice(0, MISS_LIMIT - 1)).t;
    expect(t.seg!.gained).toBe(0);
    t = run(t, jumped.slice(MISS_LIMIT - 1)).t;
    expect(t.last).toBeNull();
    expect(t.seg!.gained).toBe(0);
    t = run(t, [S(13_000, 8100)]).t;
    expect(t.last).toMatchObject({ exp: 8100 });
    expect(t.seg!.gained).toBe(0);
    t = run(t, [S(14_000, 8200)]).t;
    expect(t.seg).toMatchObject({ gained: 100, exp: 8200 });
  });

  it("往下掉超過 20%（5200→2200）：當認錯，不扣、不記死亡", () => {
    const base = run(started(), [S(3000, 5200)]).t;
    const t = run(base, [S(4000, 2200)]).t;
    expect(t.seg).toMatchObject({ gained: 100, deaths: 0 });
    expect(t.last).toMatchObject({ exp: 5200 });
    expect(t.misses).toBe(1);
  });

  it("上限常數：往下掉最多算到 20%", () => {
    expect(MAX_DEATH_SHARE).toBe(0.2);
  });

  it("真的死掉（掉 10%）：照扣、記一次；剛好 20% 還算死亡、多一點點就當認錯", () => {
    const base = run(started(), [S(3000, 5200)]).t;
    const died = run(base, [S(4000, 4200)]).t;
    expect(died.seg).toMatchObject({ gained: -900, deaths: 1 });
    expect(died.misses).toBe(0);
    const edge = run(base, [S(4000, 3200)]).t;
    expect(edge.seg).toMatchObject({ gained: -1900, deaths: 1 });
    const over = run(base, [S(4000, 3199)]).t;
    expect(over.seg).toMatchObject({ gained: 100, deaths: 0 });
    expect(over.misses).toBe(1);
  });

  it("連續 10 張都掉 25%：丟掉起點重來，這段的經驗不變，之後接著算", () => {
    let t = run(started(), [S(3000, 5200)]).t;
    const drops = Array.from({ length: MISS_LIMIT }, (_, i) => S(4000 + i * 1000, 2700));
    t = run(t, drops.slice(0, MISS_LIMIT - 1)).t;
    expect(t.last).toMatchObject({ exp: 5200 });
    expect(t.seg).toMatchObject({ gained: 100, deaths: 0 });
    t = run(t, drops.slice(MISS_LIMIT - 1)).t;
    expect(t.last).toBeNull();
    expect(t.pending).toMatchObject({ exp: 2700 });
    expect(t.seg).toMatchObject({ gained: 100, deaths: 0 });
    t = run(t, [S(14_000, 2700)]).t;
    expect(t.last).toMatchObject({ exp: 2700 });
    expect(t.seg).toMatchObject({ gained: 100, deaths: 0 });
    t = run(t, [S(15_000, 2800)]).t;
    expect(t.seg).toMatchObject({ gained: 200, deaths: 0 });
  });
});

describe("地圖鍵（讀不到的圖不亂記）", () => {
  const noMap = { mapKey: null, mapId: null };

  it("一開始讀不到地圖的那段，看到第一個有地圖的就補上；之後換別張圖就收掉", () => {
    let r = run(createTracker("auto"), [S(0, 1000, 10, noMap), S(1000, 1000, 10, noMap), S(2000, 1100, 10, noMap)]);
    expect(r.t.seg).toMatchObject({ mapKey: null, startedAt: 2000 });
    r = run(r.t, [S(3000, 1200)]);
    expect(r.closed).toHaveLength(0);
    expect(r.t.seg).toMatchObject({ mapKey: "m1", gained: 100 });
    r = run(r.t, [S(4000, 1300, 10, { mapKey: "m2", mapId: 2 })]);
    expect(r.closed).toHaveLength(1);
    expect(r.closed[0]).toMatchObject({ mapKey: "m1", gained: 100 });
    expect(r.t.seg).toMatchObject({ mapKey: "m2", startedAt: 4000, gained: 0 });
  });

  it("手動的一段一開始讀不到地圖，也補上第一個有地圖的", () => {
    let t = run(createTracker("manual"), [S(0, 1000, 10, noMap), S(1000, 1000, 10, noMap)]).t;
    t = startManual(t, 1500);
    expect(t.seg!.mapKey).toBeNull();
    t = run(t, [S(2000, 1100)]).t;
    expect(t.seg).toMatchObject({ mapKey: "m1", gained: 100 });
    expect(mainMap(stopManual(t, 3000).closed!)).toEqual({ key: "m1", mapId: 1 });
  });

  it("讀不到地圖的那幾張，經驗照算但不記到哪張圖（不用 ? 當鍵）", () => {
    const { t } = run(createTracker("auto"), [S(0, 1000, 10, noMap), S(1000, 1000, 10, noMap), S(2000, 1100, 10, noMap), S(3000, 1200, 10, noMap), S(4000, 1300)]);
    expect(t.seg!.gained).toBe(200);
    expect(Object.keys(t.seg!.byMap)).toEqual(["m1"]);
    expect(t.seg!.byMap.m1).toEqual({ mapId: 1, gained: 100 });
  });

  it("整段都沒有地圖：byMap 是空的，主要地圖回 null", () => {
    const { t } = run(createTracker("auto"), [S(0, 1000, 10, noMap), S(1000, 1000, 10, noMap), S(2000, 1100, 10, noMap), S(3000, 1200, 10, noMap)]);
    expect(t.seg).toMatchObject({ gained: 100, mapKey: null, byMap: {} });
    expect(mainMap(t.seg!)).toEqual({ key: null, mapId: null });
  });
});

describe("先點選、之後認出同一張圖不切段（10/14）", () => {
  const picked = { mapKey: "pick:105040303", mapId: 105040303 };
  const titled = { mapKey: "abc", mapId: 105040303 };

  it("自動：pick:<id> 之後讀到真的標題長相、對到同一張圖：不收掉，換成新的 key 繼續同一段", () => {
    const { t, closed } = run(createTracker("auto"), [
      S(0, 1000, 10, picked), S(1000, 1000, 10, picked), S(2000, 1100, 10, picked), S(3000, 1200, 10, picked), S(4000, 1300, 10, titled), S(5000, 1400, 10, titled),
    ]);
    expect(closed).toHaveLength(0);
    expect(t.seg).toMatchObject({ startedAt: 2000, gained: 300, mapKey: "abc", mapId: 105040303 });
    expect(mainMap(t.seg!).mapId).toBe(105040303);
  });

  it("這段剛開始（還沒記到哪張圖）就換成標題長相：一樣不切", () => {
    const { t, closed } = run(createTracker("auto"), [S(0, 1000, 10, picked), S(1000, 1000, 10, picked), S(2000, 1100, 10, picked), S(3000, 1200, 10, titled)]);
    expect(closed).toHaveLength(0);
    expect(t.seg).toMatchObject({ startedAt: 2000, gained: 100, mapKey: "abc" });
  });

  it("地圖 id 不一樣：照換圖收掉", () => {
    const { t, closed } = run(createTracker("auto"), [
      S(0, 1000, 10, picked), S(1000, 1000, 10, picked), S(2000, 1100, 10, picked), S(3000, 1200, 10, picked), S(4000, 1300, 10, { mapKey: "abc", mapId: 105040302 }),
    ]);
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ mapKey: "pick:105040303", gained: 100 });
    expect(t.seg).toMatchObject({ mapKey: "abc", startedAt: 4000, gained: 0 });
  });

  it("新的長相還沒認出是哪張圖（mapId null）：照換圖收掉（兩邊都要有地圖 id 才算同一張）", () => {
    const { closed } = run(createTracker("auto"), [
      S(0, 1000, 10, picked), S(1000, 1000, 10, picked), S(2000, 1100, 10, picked), S(3000, 1200, 10, picked), S(4000, 1300, 10, { mapKey: "abc", mapId: null }),
    ]);
    expect(closed).toHaveLength(1);
  });
});

describe("低等也量得到：stepFloor（10/14）", () => {
  // 真的經驗表：5 級升級要 135（一成是 13.5）；46 級要 510,420
  const real: number[] = [0, 15, 34, 57, 92, 135, 372];
  real[46] = 510_420;
  const feedAll = (t: Tracker, samples: Sample[]) => samples.reduce((acc, sample) => feed(acc, sample, real).tracker, t);
  const L5 = (at: number, exp: number, extra: Partial<Sample> = {}) => S(at, exp, 5, extra);
  const started = (extra: Partial<Sample> = {}) => feedAll(createTracker("auto"), [L5(0, 10, extra), L5(1000, 10, extra), L5(2000, 15, extra)]);

  it("Lv5 一秒打一隻綠菇菇（+26，超過這級一成）：沒有 stepFloor 照舊當認錯", () => {
    const t = feedAll(started(), [L5(3000, 41)]);
    expect(t.seg!.gained).toBe(0);
    expect(t.misses).toBe(1);
  });

  it("有 stepFloor（這張圖經驗最高的怪 × 3）照算", () => {
    const floor = { stepFloor: 3 * 26 };
    const t = feedAll(started(floor), [L5(3000, 41, floor), L5(4000, 119, floor)]);
    expect(t.seg!.gained).toBe(26 + 78);
    expect(t.misses).toBe(0);
    // 超過 stepFloor 還是擋
    expect(feedAll(t, [L5(5000, 198, floor)]).misses).toBe(1);
  });

  it("stepFloor 也跟著隔多久放寬（隔 20 秒放 2 倍）", () => {
    const floor = { stepFloor: 78 };
    const t = feedAll(started(floor), [L5(22_000, 15 + 156, floor)]);
    expect(t.seg!.gained).toBe(156);
  });

  it("一般等級：假的升級（46 級 50% 一秒跳到 47 級，多半級）照樣擋，stepFloor 遠小於這級一成", () => {
    const floor = { stepFloor: 3 * 1200 };
    const base = feedAll(createTracker("auto"), [S(0, 255_000, 46, floor), S(1000, 255_000, 46, floor), S(2000, 255_100, 46, floor)]);
    const t = feedAll(base, [S(3000, 5000, 47, floor)]);
    expect(t.seg).toMatchObject({ gained: 0, levelUps: 0, level: 46 });
    expect(t.misses).toBe(1);
  });
});

describe("不是這張圖：dropMap（10/14）", () => {
  const K = { mapKey: "abc", mapId: 105040302 };

  it("自動：收掉這段（結束在最後一次變動），收掉的這段記在這個 key 的地圖改成不知道；起點留著，經驗再動開新的一段", () => {
    const { t } = run(createTracker("auto"), [S(0, 1000, 10, K), S(1000, 1000, 10, K), S(2000, 1100, 10, K), S(3000, 1300, 10, K)]);
    const step = dropMap(t, "abc");
    expect(step.closed).toMatchObject({ startedAt: 2000, endedAt: 3000, gained: 200, mapId: null, byMap: { abc: { mapId: null, gained: 200 } } });
    expect(mainMap(step.closed!)).toEqual({ key: "abc", mapId: null });
    expect(step.tracker.seg).toBeNull();
    expect(step.tracker.last).toBe(t.last);
    // 玩家選了新的圖：同一個長相帶新的地圖 id，經驗一動開新的一段，記成新的圖
    const again = run(step.tracker, [S(10_000, 1400, 10, { mapKey: "abc", mapId: null }), S(11_000, 1500, 10, { mapKey: "abc", mapId: 105040303 }), S(12_000, 1600, 10, { mapKey: "abc", mapId: 105040303 })]);
    expect(again.closed).toHaveLength(0);
    expect(again.t.seg).toMatchObject({ startedAt: 10_000, gained: 200, mapId: 105040303 });
    expect(mainMap(again.t.seg!)).toEqual({ key: "abc", mapId: 105040303 });
  });

  it("手動：這段不停；這個 key 記的經驗改成不知道，選了新的圖之後整個 key 記成新的圖", () => {
    let t = startManual(run(createTracker("manual"), [S(0, 1000, 10, K), S(1000, 1000, 10, K)]).t, 1000);
    t = run(t, [S(2000, 1300, 10, K)]).t;
    const step = dropMap(t, "abc");
    expect(step.closed).toBeNull();
    expect(step.tracker.seg).toMatchObject({ mode: "manual", startedAt: 1000, gained: 300, byMap: { abc: { mapId: null, gained: 300 } } });
    t = run(step.tracker, [S(4000, 1400, 10, { mapKey: "abc", mapId: null }), S(5000, 1500, 10, { mapKey: "abc", mapId: 105040303 })]).t;
    expect(t.seg).toMatchObject({ gained: 500, byMap: { abc: { mapId: 105040303, gained: 500 } } });
    expect(mainMap(stopManual(t, 6000).closed!)).toEqual({ key: "abc", mapId: 105040303 });
  });

  it("手動、從清單選的（pick:W → 重選 pick:N）：之前的經驗不知道地圖，之後的記成 N", () => {
    const W = { mapKey: "pick:1", mapId: 1 };
    const N = { mapKey: "pick:2", mapId: 2 };
    let t = startManual(run(createTracker("manual"), [S(0, 1000, 10, W), S(1000, 1000, 10, W)]).t, 1000);
    t = run(t, [S(2000, 1100, 10, W)]).t;
    t = dropMap(t, "pick:1").tracker;
    t = run(t, [S(4000, 1150, 10, { mapKey: null, mapId: null }), S(5000, 1400, 10, N)]).t;
    expect(t.seg!.byMap).toEqual({ "pick:1": { mapId: null, gained: 100 }, "pick:2": { mapId: 2, gained: 250 } });
    expect(mainMap(t.seg!)).toEqual({ key: "pick:2", mapId: 2 });
  });

  it("沒在練：什麼都不變", () => {
    const t = run(createTracker("auto"), [S(0, 1000, 10, K), S(1000, 1000, 10, K)]).t;
    expect(dropMap(t, "abc")).toEqual({ tracker: t, closed: null });
  });
});
