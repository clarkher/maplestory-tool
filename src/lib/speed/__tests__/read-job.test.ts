// src/lib/speed/__tests__/read-job.test.ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { inkMask } from "../ink";
import { parseNames, rankText, type NameEntry } from "../names";
import { JOB_TEXT, jobRect, readJob } from "../read-job";
import { findStatusBar } from "../status-bar";
import { loadFixture } from "./fixture";

const names = parseNames(JSON.parse(fs.readFileSync("public/data/speed-names.json", "utf8")));

describe("讀職業", () => {
  it.each([1, 1.25, 1.5, 2])("放大 %s 倍：巫師(冰、雷) → 220", async scale => {
    const frame = await loadFixture("window-1364.png", scale);
    expect(readJob(frame, findStatusBar(frame)!, names)).toBe(220);
  });

  // 視窗大小隨便拉都要認得到（跟 read-exp 的掃描同一組倍率；1.01、1.1、1.15 這幾格以前框歪會認不到）
  const SWEEP = [
    ...Array.from({ length: 23 }, (_, i) => Math.round((0.9 + i * 0.05) * 100) / 100),
    0.99, 1.01, 1.02, 1.08, 1.11,
  ];
  it.each(SWEEP)("縮放 %s 倍：巫師(冰、雷) → 220", async scale => {
    const frame = await loadFixture("window-1364.png", scale);
    expect(readJob(frame, findStatusBar(frame)!, names)).toBe(220);
  });

  it("職業那格是空的（沒字）→ 認不到", async () => {
    const frame = await loadFixture("window-1364.png");
    const bar = findStatusBar(frame)!;
    const rect = jobRect(bar);
    const blank = { ...frame, data: new Uint8ClampedArray(frame.data) };
    for (let y = Math.floor(rect.y); y < rect.y + rect.h; y++) {
      for (let x = Math.floor(rect.x); x < rect.x + rect.w; x++) {
        const i = (y * frame.width + x) * 4;
        blank.data.set([50, 55, 60, 255], i);
      }
    }
    expect(readJob(blank, bar, names)).toBeNull();
  });

  it("名單裡每個職業都有樣板", () => {
    expect(names.jobs.map(entry => entry.text)).toContain("神槍手");
    expect(names.jobs).toHaveLength(34);
    expect(names.jobs.map(entry => entry.text).sort()).toEqual(JOB_TEXT.flatMap(([, texts]) => texts).sort());
  });
});

/**
 * 「認不準就回 null」的兩道關：最像的距離要 ≤ 0.08（天花板），最像跟第二像（不同職業）要差 ≥ 0.008（差距）。
 * 用基準截圖 1 倍＋動過手腳的名單，每題先用 rankText 證明是哪一關擋下來的，不是剛好別的原因 null。
 */
describe("讀職業：認不準回 null", () => {
  const e220 = names.jobs.find(entry => entry.text === "巫師(冰、雷)")!;
  /** 抄 220 的樣板、格子乘 k（k 越小離截圖越遠），換成別的職業的名字 */
  const copyOf220 = (text: string, k: number): NameEntry => ({ ...e220, text, grid: e220.grid.map(value => value * k) });

  async function setup() {
    const frame = await loadFixture("window-1364.png");
    const bar = findStatusBar(frame)!;
    return { frame, bar, mask: inkMask(frame, jobRect(bar), false, 0.99)! };
  }

  // 神槍手（521）的位置換成「長得跟 220 一樣」的樣板：k=1 完全一樣（差距 0）、0.9 差距約 0.005（< 0.008）
  it.each([1, 0.9])("不同職業的樣板跟最像的幾乎一樣（k=%s）→ 差距太小 → null", async k => {
    const { frame, bar, mask } = await setup();
    const jobs = [...names.jobs.filter(entry => entry.text !== "神槍手"), copyOf220("神槍手", k)];
    const ranked = rankText(mask, jobs, names.gh);
    expect(ranked[0].d).toBeLessThanOrEqual(0.08); // 天花板沒擋
    expect(ranked.find(row => row.text === "神槍手")!.d - ranked[0].d).toBeLessThan(0.008); // 差距擋
    expect(readJob(frame, bar, { ...names, jobs })).toBeNull();
  });

  it("同一組名單，樣板差到 0.0116（> 0.008）就認得出來（差距那一關的邊界）", async () => {
    const { frame, bar, mask } = await setup();
    const jobs = [...names.jobs.filter(entry => entry.text !== "神槍手"), copyOf220("神槍手", 0.8)];
    const ranked = rankText(mask, jobs, names.gh);
    expect(ranked[0].text).toBe("巫師(冰、雷)");
    const gap = ranked.find(row => row.text === "神槍手")!.d - ranked[0].d;
    expect(gap).toBeGreaterThanOrEqual(0.008);
    expect(gap).toBeLessThan(0.02);
    expect(readJob(frame, bar, { ...names, jobs })).toBe(220);
  });

  // 名單只剩一個 220 的樣板（沒有第二像，差距那關不會擋），把格子壓淡讓距離剛好在 0.08 兩邊
  it.each<[number, number | null, string]>([
    [0.5, 220, "剛好低於 0.08 → 認得出來"],
    [0.45, null, "剛好高於 0.08 → null"],
  ])("只有一個樣板、格子乘 %s（期望 %s）：%s", async (k, expected) => {
    const { frame, bar, mask } = await setup();
    const jobs = [{ ...copyOf220("巫師(冰、雷)", k) }];
    const [best] = rankText(mask, jobs, names.gh);
    if (expected === null) expect(best.d).toBeGreaterThan(0.08);
    else expect(best.d).toBeLessThanOrEqual(0.08);
    expect(best.d).toBeGreaterThan(0.07);
    expect(best.d).toBeLessThan(0.1);
    expect(readJob(frame, bar, { ...names, jobs })).toBe(expected);
  });

  it("名單裡只有不相干的職業（拿掉巫師、魔導士）→ 每個都離很遠 → 天花板擋下 → null", async () => {
    const { frame, bar, mask } = await setup();
    const jobs = names.jobs.filter(entry => !/^(巫師|魔導士)/.test(entry.text));
    expect(jobs.length).toBeGreaterThan(20);
    const ranked = rankText(mask, jobs, names.gh);
    expect(ranked[0].d).toBeGreaterThan(0.08); // 天花板擋
    expect(ranked[1].d - ranked[0].d).toBeGreaterThanOrEqual(0.008); // 差距那關不是原因
    expect(readJob(frame, bar, { ...names, jobs })).toBeNull();
  });
});
