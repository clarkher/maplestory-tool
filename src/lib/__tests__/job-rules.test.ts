import { describe, expect, it } from "vitest";
import { jobFit, spawnShare } from "@/lib/job-rules";
import type { Monster } from "@/lib/types";

const monster = (id: number, extra: Partial<Monster> = {}): Monster =>
  ({ id, n: `怪${id}`, lv: 40, exp: 1, hp: 1, pad: 0, pdd: 0, mad: 0, mdd: 0, acc: 0, eva: 0, spd: 0, maps: [], drops: [], ...extra }) as Monster;

const index = new Map<number, Monster>([
  [1, monster(1, { und: 1 })],
  [2, monster(2)],
  [3, monster(3, { el: { f: "r", i: "w" } })],
  [4, monster(4, { el: { f: "w" } })],
  [5, monster(5, { el: { l: "w" } })],
  [6, monster(6, { el: { i: "r" } })],
]);

describe("刷怪點佔比", () => {
  it("依刷怪點數加權", () => {
    expect(spawnShare([[1, 30], [2, 10]], index, m => Boolean(m.und))).toBeCloseTo(0.75);
    expect(spawnShare([], index, () => true)).toBe(0);
  });
});

describe("僧侶 31～70 只推不死系", () => {
  it("不死系佔三成以上才推，佔比就是係數", () => {
    const fit = jobFit(230, 45, [[1, 30], [2, 10]], index);
    expect(fit.ok).toBe(true);
    expect(fit.factor).toBeCloseTo(0.75);
    expect(fit.note).toBe("不死系佔 75%，群體治癒補得到");
    expect(fit.warn).toBeUndefined();
  });

  it("沒有不死系的圖不推", () => {
    expect(jobFit(230, 45, [[2, 40]], index)).toMatchObject({ ok: false, note: "沒有不死系，群體治癒打不到" });
  });

  it("31～39 加提醒", () => {
    expect(jobFit(230, 35, [[1, 40]], index).warn).toBe("主流點法 40 等才把群體治癒點滿，這幾級組隊比較順");
  });

  it("30 等以下、71 等以上不套規則", () => {
    expect(jobFit(230, 30, [[2, 40]], index)).toEqual({ ok: true, factor: 1 });
    expect(jobFit(231, 75, [[2, 40]], index)).toEqual({ ok: true, factor: 1 });
  });
});

describe("火毒巫師照遊戲資料避開抗火的怪", () => {
  it("抗火佔一半以上的圖擋掉，寫原因", () => {
    expect(jobFit(210, 35, [[3, 20]], index)).toMatchObject({ ok: false, note: "怪抗火，火焰箭傷害打折" });
  });

  it("怕火的圖加分", () => {
    const fit = jobFit(210, 35, [[4, 20]], index);
    expect(fit.ok).toBe(true);
    expect(fit.factor).toBeCloseTo(1.6);
    expect(fit.note).toBe("怪怕火／毒");
  });

  it("三轉（211）用同一套規則", () => {
    expect(jobFit(211, 75, [[3, 20]], index).ok).toBe(false);
  });
});

describe("冰雷巫師", () => {
  it("怕冰或怕雷加分", () => {
    expect(jobFit(220, 40, [[3, 10], [5, 10]], index)).toMatchObject({ ok: true, note: "怪怕冰／雷" });
  });

  it("抗冰佔一半以上的圖擋掉，寫原因", () => {
    expect(jobFit(220, 40, [[6, 20]], index)).toMatchObject({ ok: false, note: "怪抗冰，冰雷傷害打折" });
  });
});

describe("其他職業不加規則", () => {
  it("狂戰士不管什麼怪都是 1", () => {
    expect(jobFit(110, 45, [[3, 20]], index)).toEqual({ ok: true, factor: 1 });
  });
});
