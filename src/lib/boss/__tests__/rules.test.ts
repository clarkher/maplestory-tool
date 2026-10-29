// src/lib/boss/__tests__/rules.test.ts
import { describe, expect, it } from "vitest";
import { checkEvent, checkEventBatch, checkInterval } from "../server/rules";
import { BOSSES } from "../types";

const NOW = 1_800_000_000_000;
const boss = BOSSES[0].id;
const ok = { id: "abc-123", server: "xuejila", boss, ch: 5, kind: "kill", at: NOW - 60_000 };

describe("checkEvent", () => {
  it("合格事件通過", () => {
    expect(checkEvent(ok, NOW)).toEqual(ok);
  });
  it("多餘欄位會被丟掉", () => {
    expect(checkEvent({ ...ok, evil: 1 }, NOW)).toEqual(ok);
  });
  it("at 超過現在 5 分鐘、或超過 12 小時前 -> null", () => {
    expect(checkEvent({ ...ok, at: NOW + 5 * 60_000 + 1 }, NOW)).toBeNull();
    expect(checkEvent({ ...ok, at: NOW + 5 * 60_000 }, NOW)).not.toBeNull();
    expect(checkEvent({ ...ok, at: NOW - 12 * 3600_000 - 1 }, NOW)).toBeNull();
  });
  it("ch 0／61／1.5 -> null", () => {
    for (const ch of [0, 61, 1.5]) expect(checkEvent({ ...ok, ch }, NOW)).toBeNull();
  });
  it("未知 boss／server／kind -> null", () => {
    expect(checkEvent({ ...ok, boss: 1 }, NOW)).toBeNull();
    expect(checkEvent({ ...ok, server: "x" }, NOW)).toBeNull();
    expect(checkEvent({ ...ok, kind: "boom" }, NOW)).toBeNull();
  });
  it("retract 要有 target", () => {
    expect(checkEvent({ ...ok, kind: "retract" }, NOW)).toBeNull();
    expect(checkEvent({ ...ok, kind: "retract", target: "abc-1" }, NOW)).toMatchObject({ kind: "retract", target: "abc-1" });
  });
  it("id 有空白或過長 -> null", () => {
    expect(checkEvent({ ...ok, id: "a b" }, NOW)).toBeNull();
    expect(checkEvent({ ...ok, id: "" }, NOW)).toBeNull();
    expect(checkEvent({ ...ok, id: "a".repeat(41) }, NOW)).toBeNull();
  });
  it("非物件 -> null", () => {
    expect(checkEvent(null, NOW)).toBeNull();
    expect(checkEvent("x", NOW)).toBeNull();
  });
});

describe("checkEventBatch", () => {
  it("1～100 筆通過", () => {
    expect(checkEventBatch([ok], NOW)).toHaveLength(1);
    expect(checkEventBatch(Array.from({ length: 100 }, (_, i) => ({ ...ok, id: `e${i}` })), NOW)).toHaveLength(100);
  });
  it("101 筆、空陣列、任一筆壞 -> null", () => {
    expect(checkEventBatch(Array.from({ length: 101 }, (_, i) => ({ ...ok, id: `e${i}` })), NOW)).toBeNull();
    expect(checkEventBatch([], NOW)).toBeNull();
    expect(checkEventBatch([ok, { ...ok, ch: 0 }], NOW)).toBeNull();
    expect(checkEventBatch("x", NOW)).toBeNull();
  });
});

describe("checkInterval", () => {
  const good = { server: "gugu", boss, seconds: 3600 };
  it("合格通過", () => {
    expect(checkInterval(good)).toEqual(good);
    expect(checkInterval({ ...good, seconds: 600 })).not.toBeNull();
    expect(checkInterval({ ...good, seconds: 21600 })).not.toBeNull();
  });
  it("599、21601、小數、未知 boss -> null", () => {
    for (const seconds of [599, 21601, 600.5]) expect(checkInterval({ ...good, seconds })).toBeNull();
    expect(checkInterval({ ...good, boss: 1 })).toBeNull();
    expect(checkInterval(null)).toBeNull();
  });
});
