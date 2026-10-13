// src/lib/speed/__tests__/read-job.test.ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseNames } from "../names";
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
