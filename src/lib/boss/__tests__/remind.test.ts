import { describe, expect, it } from "vitest";
import { dueReminders, REMIND_BEFORE_MIN } from "@/lib/boss/remind";
import { BOSSES, type BossEvent } from "@/lib/boss/types";

const mush = BOSSES.find((b) => b.name === "蘑菇王")!;
const eli = BOSSES.find((b) => b.name === "艾利傑")!;
const NOW = 1_800_000_000_000;
const MIN = 60_000;
const ev = (boss: number, kind: "kill" | "empty", ago: number, id = "k1", ch = 3): BossEvent => ({
  id, server: "xuejila", boss, ch, kind, at: NOW - ago * MIN,
});

describe("dueReminders", () => {
  it("提前 3 分", () => {
    expect(REMIND_BEFORE_MIN).toBe(3);
  });
  it("remind at min minus 3", () => {
    expect(dueReminders([ev(mush.id, "kill", 41.9)], "xuejila", NOW, new Set())).toEqual([]);
    expect(dueReminders([ev(mush.id, "kill", 42)], "xuejila", NOW, new Set())).toEqual([
      { eventId: "k1", boss: mush, ch: 3 },
    ]);
  });
  it("超過 max 不提醒", () => {
    expect(dueReminders([ev(mush.id, "kill", 61)], "xuejila", NOW, new Set())).toEqual([]);
  });
  it("fired 含它就不再提醒", () => {
    expect(dueReminders([ev(mush.id, "kill", 50)], "xuejila", NOW, new Set(["k1"]))).toEqual([]);
  });
  it("沒實測時間的王永遠不提醒", () => {
    expect(dueReminders([ev(eli.id, "kill", 100)], "xuejila", NOW, new Set())).toEqual([]);
  });
  it("最新是 empty 的頻道不提醒", () => {
    const evs = [ev(mush.id, "kill", 50, "k1"), ev(mush.id, "empty", 5, "e1")];
    expect(dueReminders(evs, "xuejila", NOW, new Set())).toEqual([]);
  });
  it("別台伺服器不算", () => {
    expect(dueReminders([ev(mush.id, "kill", 50)], "gugu", NOW, new Set())).toEqual([]);
  });
});
