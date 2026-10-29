import { describe, expect, it } from "vitest";
import { channelState, EXPIRE_MS, latestByChannel, rankNext } from "@/lib/boss/state";
import { BOSSES, type BossEvent } from "@/lib/boss/types";

const by = (name: string) => BOSSES.find((b) => b.name === name)!;
const mush = by("蘑菇王"); // 45~60
const ruby = by("紅寶王"); // 45/45
const eli = by("艾利傑"); // null
const NOW = 1_800_000_000_000;
const MIN = 60_000;
const kill = (ago: number) =>
  ({ id: "k", server: "xuejila", boss: 1, ch: 1, kind: "kill", at: NOW - ago * MIN }) as BossEvent;

describe("資料", () => {
  it("11 隻、順序照 spec、特例欄位", () => {
    expect(BOSSES.map((b) => b.name)).toEqual([
      "蘑菇王", "殭屍蘑菇王", "紅寶王", "樹妖王", "殭屍猴王", "沼澤巨鱷", "巨居蟹", "巴洛古", "艾利傑", "雪毛怪人", "冥界幽靈",
    ]);
    expect(by("巨居蟹").confidence).toBe("中");
    expect(by("殭屍猴王").note).toBe("兩張圖算同一隻，未證實");
    expect(by("沼澤巨鱷").note).toBe("兩張圖算同一隻，未證實");
  });
});

describe("channelState", () => {
  it("wait below min", () => {
    expect(channelState(1, kill(30), mush, NOW)).toMatchObject({ kind: "wait", label: "還要 15 分" });
    expect(channelState(1, kill(44.2), mush, NOW).label).toBe("還要 1 分");
  });
  it("maybe at min and max", () => {
    expect(channelState(1, kill(45), mush, NOW)).toMatchObject({ kind: "maybe", label: "可能出了" });
    expect(channelState(1, kill(60), mush, NOW)).toMatchObject({ kind: "maybe", label: "可能出了" });
    expect(channelState(1, kill(60.1), mush, NOW)).toMatchObject({ kind: "sure", label: "一定出了" });
  });
  it("fixed respawn", () => {
    expect(channelState(1, kill(45), ruby, NOW).label).toBe("可能出了");
    expect(channelState(1, kill(45.5), ruby, NOW).label).toBe("一定出了");
  });
  it("no prediction", () => {
    expect(channelState(1, kill(37.9), eli, NOW)).toMatchObject({ kind: "since", label: "打死 37 分了" });
  });
  it("empty / none", () => {
    const e = { ...kill(5.4), kind: "empty" } as BossEvent;
    expect(channelState(1, e, mush, NOW)).toMatchObject({ kind: "empty", label: "沒王 5 分前" });
    expect(channelState(1, undefined, mush, NOW)).toMatchObject({ kind: "none", label: "沒記錄" });
  });
  it("future at clamps to 0", () => {
    const s = channelState(1, kill(-2), mush, NOW);
    expect(s.minutes).toBe(0);
    expect(s.label).toBe("還要 45 分");
  });
});

describe("latestByChannel", () => {
  const ev = (id: string, ago: number, extra: Record<string, unknown> = {}) =>
    ({ id, server: "xuejila", boss: 1, ch: 1, kind: "kill", at: NOW - ago * MIN, ...extra }) as BossEvent;
  it("expired after 12h", () => {
    const old = { ...ev("a", 0), at: NOW - EXPIRE_MS - 1000 } as BossEvent;
    expect(latestByChannel([old], "xuejila", 1, NOW).size).toBe(0);
    const ok = { ...ev("b", 0), at: NOW - EXPIRE_MS } as BossEvent;
    expect(latestByChannel([ok], "xuejila", 1, NOW).size).toBe(1);
  });
  it("retract removes target", () => {
    const a = ev("a", 50);
    const b = ev("b", 10);
    const r = { id: "r", server: "xuejila", boss: 1, ch: 1, kind: "retract", target: "b", at: NOW } as BossEvent;
    expect(latestByChannel([a, b, r], "xuejila", 1, NOW).get(1)?.id).toBe("a");
    const r2 = { ...r, id: "r2", target: "a" } as BossEvent;
    expect(latestByChannel([a, b, r, r2], "xuejila", 1, NOW).size).toBe(0);
  });
  it("backfill older than latest does not win; tie later wins", () => {
    expect(latestByChannel([ev("late", 10), ev("back", 40)], "xuejila", 1, NOW).get(1)?.id).toBe("late");
    expect(latestByChannel([ev("t1", 10), ev("t2", 10)], "xuejila", 1, NOW).get(1)?.id).toBe("t2");
  });
  it("filters by server and boss", () => {
    const x = ev("x", 5, { server: "gugu" });
    const y = ev("y", 5, { boss: 2 });
    expect(latestByChannel([x, y], "xuejila", 1, NOW).size).toBe(0);
  });
});

describe("rankNext", () => {
  it("order", () => {
    const mk = (ch: number, ago: number, kind: "kill" | "empty" = "kill") =>
      channelState(ch, { id: String(ch), server: "xuejila", boss: 1, ch, kind, at: NOW - ago * MIN } as BossEvent, mush, NOW);
    const states = [
      mk(1, 5, "empty"), mk(2, 20), mk(3, 40), mk(4, 50), mk(5, 55), mk(6, 70), mk(7, 90), mk(8, 30, "empty"),
      channelState(9, undefined, mush, NOW),
    ];
    // sure(90,70) → maybe(55,50) → wait(40 先於 20，剩少的先) → empty(30,5)
    expect(rankNext(states).map((s) => s.ch)).toEqual([7, 6, 5, 4, 3, 2, 8, 1]);
  });
  it("since sorted by longest first", () => {
    const mk = (ch: number, ago: number) =>
      channelState(ch, { id: String(ch), server: "xuejila", boss: 1, ch, kind: "kill", at: NOW - ago * MIN } as BossEvent, eli, NOW);
    expect(rankNext([mk(1, 5), mk(2, 50)]).map((s) => s.ch)).toEqual([2, 1]);
  });
});
