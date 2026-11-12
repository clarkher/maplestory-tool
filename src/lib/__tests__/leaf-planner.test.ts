import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { coinRange, dropsCoin, planCoinFarm } from "@/lib/leaf-planner/farm";
import type { MapRecord, Monster, TrainingRow } from "@/lib/types";
import { affordable, buildPlan, evaluate, statsOf, toItems, type PlanItem } from "@/lib/leaf-planner/calc";
import { dateOfDay, dayOf, LEAF_DAYS } from "@/lib/leaf-planner/calendar";
import { LEAF_WEAPONS } from "@/lib/leaf-planner/weapons";

const near = (a: number, b: number, digits = 3) => expect(a).toBeCloseTo(b, digits);

describe("楓葉武器衝卷規劃器（v2.18）：三種衝法精確算", () => {
  it("楓谷幫手推薦（43 級）＝攻略文懶人包：平均 +11.642、+12 以上 52.60%、最常 +13", () => {
    const plan = buildPlan("pick", 200);
    const s = statsOf(plan.outcome);
    near(s.mean, 11.642);
    near(s.atLeast(12), 0.526, 3);
    expect(s.best).toBe(17);
    expect(s.worst).toBe(0);
    expect(s.mode).toBe(13);
    near(s.modeP, 0.2122, 3);
  });

  it("楓谷幫手推薦：卷軸平均 10.24 張（楓幣 307 萬）、最多 13 張（390 萬），硬幣最多 2,100 枚", () => {
    const plan = buildPlan("pick", 200);
    near(plan.paidScrolls.mean, 10.24, 2);
    expect(plan.paidScrolls.max).toBe(13);
    expect(plan.coinsMax).toBe(2100);
  });

  it("楓谷幫手推薦的日程（最糟那條路）：DAY 2 換第 1 把、DAY 3、4 賭 15%、DAY 6 換第 2 把…DAY 14 換第 4 把、DAY 15～21 全 70%", () => {
    const plan = buildPlan("pick", 200);
    const brief = plan.steps.map(step => `${step.day}:${step.kind === "weapon" ? "w" : step.rate}${step.target}`);
    expect(brief).toEqual([
      "2:w1", "3:151", "4:151", "6:w2", "7:152", "8:152", "10:w3", "11:153", "12:153",
      "14:w4", "15:704", "16:704", "17:704", "18:704", "19:704", "20:704", "21:704",
    ]);
    expect(plan.steps.filter(step => step.ifMiss).map(step => step.day)).toEqual([4, 6, 7, 8, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21]);
  });

  it("35 級（100 枚）的推薦：一樣每把賭兩張，能換 4 把再留一把全 70%，最多用 2,000 枚", () => {
    const plan = buildPlan("pick", 100);
    expect(plan.steps.filter(step => step.kind === "weapon")).toHaveLength(5);
    expect(plan.coinsMax).toBe(2000);
    const s = statsOf(plan.outcome);
    expect(s.mean).toBeGreaterThan(statsOf(buildPlan("pick", 200).outcome).mean);
  });

  it("穩穩衝 70%：一把 7 張全 70%，平均 +9.8、+12 以上 32.94%，楓幣固定 7 張", () => {
    const plan = buildPlan("s70", 200);
    const s = statsOf(plan.outcome);
    near(s.mean, 9.8);
    near(s.atLeast(12), 0.3294, 3);
    expect(plan.paidScrolls.max).toBe(7);
    expect(plan.coinsMax).toBe(900);
    expect(plan.steps.map(step => step.day)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("保底 100%：一定 +7，不用楓幣", () => {
    const plan = buildPlan("s100", 100);
    const s = statsOf(plan.outcome);
    expect(s.mean).toBe(7);
    expect(s.atLeast(7)).toBe(1);
    expect(s.atLeast(8)).toBe(0);
    expect(plan.paidScrolls.max).toBe(0);
    expect(plan.steps[0].day).toBe(2);
  });

  it("機率加起來是 1", () => {
    for (const kind of ["pick", "s70", "s100"] as const) {
      for (const cost of [100, 200] as const) {
        const total = [...buildPlan(kind, cost).outcome.values()].reduce((a, b) => a + b, 0);
        near(total, 1, 9);
      }
    }
  });
});

describe("日曆", () => {
  it("DAY 1＝11/19（四）、DAY 21＝12/9（三）", () => {
    expect(LEAF_DAYS).toBe(21);
    expect(dateOfDay(1)).toEqual({ month: 11, date: 19, weekday: 4 });
    expect(dateOfDay(21)).toEqual({ month: 12, date: 9, weekday: 3 });
  });

  it("今天是 DAY 幾（台灣時間）：活動前、活動中、換東西期間", () => {
    expect(dayOf(Date.parse("2026-11-12T10:00:00+08:00"))).toBe(-6);
    expect(dayOf(Date.parse("2026-11-18T23:59:00+08:00"))).toBe(0);
    expect(dayOf(Date.parse("2026-11-19T00:00:00+08:00"))).toBe(1);
    expect(dayOf(Date.parse("2026-11-24T12:00:00+08:00"))).toBe(6);
    expect(dayOf(Date.parse("2026-12-16T23:00:00+08:00"))).toBe(28);
  });
});

describe("武器表", () => {
  it("19 把、id 不重複、43 級 200 枚 35 級 100 枚", () => {
    expect(LEAF_WEAPONS).toHaveLength(19);
    expect(new Set(LEAF_WEAPONS.map(weapon => weapon.id)).size).toBe(19);
    for (const weapon of LEAF_WEAPONS) expect(weapon.cost).toBe(weapon.lv === 43 ? 200 : 100);
  });
});

describe("自己排（v2.18 使用者要可以自訂）", () => {
  it("一把 7 張 70% 跟「穩穩衝 70%」一樣", () => {
    const items = toItems(buildPlan("s70", 200).steps);
    const ev = evaluate(items, 200);
    expect(ev.short).toBeNull();
    near(statsOf(ev.outcome!).mean, 9.8);
    expect(ev.paidScrolls).toBe(7);
    expect(ev.coinsUsed).toBe(900);
  });

  it("兩把各衝一張 15%：取最好那把，至少一把中 1-0.85² = 27.75%", () => {
    const ev = evaluate([
      { day: 2, kind: "weapon", target: 1 }, { day: 3, kind: "scroll", rate: 15, target: 1 },
      { day: 5, kind: "weapon", target: 2 }, { day: 6, kind: "scroll", rate: 15, target: 2 },
    ], 200);
    near(statsOf(ev.outcome!).atLeast(5), 1 - 0.85 ** 2, 9);
    expect(ev.weapons).toHaveLength(2);
  });

  it("幣不夠：DAY 2 換兩把 43 級（400 枚）＝DAY 2 差 200 枚", () => {
    const ev = evaluate([{ day: 2, kind: "weapon", target: 1 }, { day: 2, kind: "weapon", target: 2 }], 200);
    expect(ev.short).toEqual({ day: 2, lack: 200 });
  });

  it("DAY 1 鎖死：三種衝法都從 DAY 2 起，自己排到 DAY 1 的不算", () => {
    for (const kind of ["pick", "s70", "s100"] as const) {
      for (const cost of [100, 200] as const) expect(buildPlan(kind, cost).steps[0].day).toBe(2);
    }
    const ev = evaluate([{ day: 1, kind: "weapon", target: 1 }, { day: 1, kind: "scroll", rate: 100, target: 1 }], 100);
    expect(ev.invalid).toHaveLength(2);
    expect(ev.outcome).toBeNull();
    expect(ev.coinsUsed).toBe(0);
    expect(ev.short).toBeNull();
  });

  it("DAY 22 之後不掉幣：存的幣還能換，超過 2,100 就不夠", () => {
    const items: PlanItem[] = [{ day: 2, kind: "weapon", target: 1 }];
    for (let i = 0; i < 7; i++) items.push({ day: 25, kind: "scroll", rate: 70, target: 1 });
    expect(evaluate(items, 200).short).toBeNull();
    const many: PlanItem[] = Array.from({ length: 11 }, (_, i) => ({ day: 28, kind: "weapon", target: i + 1 }));
    expect(evaluate(many, 200).short).toEqual({ day: 28, lack: 100 });
  });

  it("卷排在武器換到之前、或第 8 張：不算進去，標出來", () => {
    const items: PlanItem[] = [{ day: 3, kind: "scroll", rate: 70, target: 1 }, { day: 4, kind: "weapon", target: 1 }];
    for (let i = 0; i < 8; i++) items.push({ day: 5 + i, kind: "scroll", rate: 100, target: 1 });
    const ev = evaluate(items, 200);
    expect(ev.invalid).toHaveLength(2);
    expect(ev.weapons[0].rates).toHaveLength(7);
  });

  it("幣不夠不給加：DAY 2 有 200 枚，換了 43 級就不能再換卷；後面排好的也算", () => {
    const w: PlanItem = { day: 2, kind: "weapon", target: 1 };
    expect(affordable([], w, 200)).toBe(true);
    expect(affordable([w], { day: 2, kind: "scroll", rate: 70, target: 1 }, 200)).toBe(false);
    expect(affordable([w], { day: 3, kind: "scroll", rate: 70, target: 1 }, 200)).toBe(true);
    // DAY 3 已經排了一張：DAY 2 再塞一張就讓 DAY 3 不夠
    const later: PlanItem = { day: 3, kind: "scroll", rate: 70, target: 1 };
    expect(affordable([w, later], { day: 3, kind: "scroll", rate: 15, target: 1 }, 200)).toBe(false);
    // 推薦衝法全部排滿 2,100 枚：最後一天再加什麼都不行
    expect(affordable(toItems(buildPlan("pick", 200).steps), { day: 28, kind: "scroll", rate: 100, target: 4 }, 200)).toBe(false);
  });

  it("清空：沒有武器就沒有結果", () => {
    expect(evaluate([], 200).outcome).toBeNull();
  });
});

describe("去哪打幣（v2.18 使用者要輸入等級推薦地圖跟怪）", () => {
  const read = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "public/data", name), "utf8"));
  const training: TrainingRow[] = read("training.json");
  const monsterList: Monster[] = read("monsters.json");
  const maps: Record<string, MapRecord> = read("maps.json");
  const monsters = new Map(monsterList.map(m => [m.id, m]));

  it("掉幣範圍照台服公告：10 等以上、上下 10 級；65 等以上 55 級以上都算", () => {
    expect(dropsCoin(9, 9)).toBe(false);
    expect(dropsCoin(30, 20)).toBe(true);
    expect(dropsCoin(30, 19)).toBe(false);
    expect(dropsCoin(30, 40)).toBe(true);
    expect(dropsCoin(30, 41)).toBe(false);
    expect(dropsCoin(70, 55)).toBe(true);
    expect(dropsCoin(70, 90)).toBe(true);
    expect(dropsCoin(64, 53)).toBe(false);
    expect(coinRange(30)).toEqual([20, 40]);
    expect(coinRange(70)).toEqual([55, null]);
    expect(coinRange(5)).toBeNull();
  });

  it("每個等級推的地圖：會掉幣的怪佔七成以上、怪都在掉幣範圍、不推打不動的圖", () => {
    for (const level of [10, 15, 25, 35, 45, 55, 65, 80, 100]) {
      const picks = planCoinFarm(level, training, monsters, maps);
      expect(picks.length, `Lv.${level}`).toBeGreaterThan(0);
      for (const pick of picks) {
        expect(pick.coinSp / pick.row.sp).toBeGreaterThanOrEqual(0.7);
        expect(pick.row.lvMax - level).toBeLessThanOrEqual(5);
        for (const [id] of pick.coinMobs) expect(dropsCoin(level, monsters.get(id)!.lv!)).toBe(true);
      }
    }
  });

  it("10 等以下不推（打不到幣）", () => {
    expect(planCoinFarm(9, training, monsters, maps)).toEqual([]);
  });
});
