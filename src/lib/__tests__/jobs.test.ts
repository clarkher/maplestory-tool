import { describe, expect, it } from "vitest";
import { JOB_OPTIONS, advancementLevel, baseJob, isSecondJob, normalizeJob, stageJob } from "@/lib/jobs";

describe("職業清單", () => {
  it("一轉 5 職加二轉 12 職，共 17 個", () => {
    expect(JOB_OPTIONS.map(job => job.id)).toEqual([
      100, 110, 120, 130, 200, 210, 220, 230, 300, 310, 320, 400, 410, 420, 500, 510, 520,
    ]);
  });

  it("二轉職業的一轉前身", () => {
    expect(baseJob(110)).toBe(100);
    expect(baseJob(100)).toBe(100);
    expect(baseJob(520)).toBe(500);
    expect(isSecondJob(110)).toBe(true);
    expect(isSecondJob(100)).toBe(false);
    expect(isSecondJob(0)).toBe(false);
  });

  it("法師 8 等轉職，其他 10 等", () => {
    expect(advancementLevel(200)).toBe(8);
    expect(advancementLevel(230)).toBe(8);
    expect(advancementLevel(310)).toBe(10);
  });

  it("經典版沒有的職業代碼視為還沒選", () => {
    expect(normalizeJob(1110)).toBe(0);
    expect(normalizeJob(431)).toBe(0);
    expect(normalizeJob(111)).toBe(0);
    expect(normalizeJob(220)).toBe(220);
    expect(normalizeJob(0)).toBe(0);
  });

  it("選了二轉職業但還沒到 30 等，用一轉的內容", () => {
    expect(stageJob(110, 25)).toBe(100);
    expect(stageJob(110, 30)).toBe(110);
    expect(stageJob(100, 45)).toBe(100);
    expect(stageJob(0, 5)).toBe(0);
  });

  it("選了職業但還沒到轉職等級，還是初心者", () => {
    expect(stageJob(100, 9)).toBe(0);
    expect(stageJob(110, 5)).toBe(0);
    expect(stageJob(200, 8)).toBe(200);
    expect(stageJob(230, 7)).toBe(0);
  });
});
