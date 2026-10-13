// src/lib/speed/__tests__/tracker.test.ts
import { describe, expect, it } from "vitest";
import {
  createTracker, durationMs, feed, mainMap, MAX_STEP_SHARE, minutesToLevel, MISS_LIMIT, shouldSave, startManual, stopManual, switchMode, tenMinuteExp, tick,
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
    let { t } = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100), S(62_000, 1300)]);
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
    const { t } = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100), S(62_000, 1700)]);
    expect(tenMinuteExp(t.seg!)).toBe(6000);
    const short = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100), S(12_000, 1200)]).t;
    expect(tenMinuteExp(short.seg!)).toBeNull();
  });

  it("升級還要幾分鐘＝（這級要的−現在）÷ 每分鐘", () => {
    const { t } = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100), S(62_000, 1700)]);
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

  it("隔 60 秒的一次跳動上限放寬到 6 倍，不會被當成認錯；隔 10 秒同樣的跳動就擋", () => {
    // 5100 升到 11 級的 1000：上一級剩 4900 ＋ 1000 ＝ 5900，在 60 秒的上限 6000 內
    const ok = run(started(), [S(62_000, 1000, 11)]).t;
    expect(ok.seg).toMatchObject({ gained: 5900, levelUps: 1 });
    expect(ok.misses).toBe(0);
    const tooBig = run(started(), [S(62_000, 1200, 11)]).t;
    expect(tooBig.seg!.gained).toBe(0);
    expect(tooBig.misses).toBe(1);
    const blocked = run(started(), [S(12_000, 1000, 11)]).t;
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
});
