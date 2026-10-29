import { describe, expect, it } from "vitest";
import { loadEvents, loadPrefs, saveEvents, savePrefs } from "@/lib/boss/store";
import { EXPIRE_MS } from "@/lib/boss/state";
import { BOSSES, type BossEvent } from "@/lib/boss/types";

const NOW = 1_800_000_000_000;

function mem(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
  } as unknown as Storage;
}
const broken = {
  getItem() {
    throw new Error("denied");
  },
  setItem() {
    throw new Error("denied");
  },
} as unknown as Storage;

const ev = (id: string, at: number): BossEvent => ({ id, server: "xuejila", boss: 1, ch: 3, kind: "kill", at });

describe("loadEvents / saveEvents", () => {
  it("沒資料回 []", () => expect(loadEvents(mem(), NOW)).toEqual([]));
  it("壞 JSON 回 []", () => expect(loadEvents(mem({ "ms-boss:events": "{oops" }), NOW)).toEqual([]));
  it("不是陣列回 []", () => expect(loadEvents(mem({ "ms-boss:events": "{}" }), NOW)).toEqual([]));
  it("存讀一致", () => {
    const s = mem();
    const list = [ev("a", NOW - 1000)];
    saveEvents(s, list);
    expect(loadEvents(s, NOW)).toEqual(list);
  });
  it("丟掉超過 12 小時的，剛好 12 小時留", () => {
    const s = mem();
    saveEvents(s, [ev("old", NOW - EXPIRE_MS - 1), ev("edge", NOW - EXPIRE_MS)]);
    expect(loadEvents(s, NOW).map((e) => e.id)).toEqual(["edge"]);
  });
  it("丟掉形狀不對的元素", () => {
    const s = mem({ "ms-boss:events": JSON.stringify([null, 5, "x", { id: "z" }, ev("ok", NOW)]) });
    expect(loadEvents(s, NOW).map((e) => e.id)).toEqual(["ok"]);
  });
  it("storage 丟例外時不崩", () => {
    expect(loadEvents(broken, NOW)).toEqual([]);
    expect(() => saveEvents(broken, [])).not.toThrow();
  });
});

describe("loadPrefs / savePrefs", () => {
  it("預設值", () => {
    const p = loadPrefs(mem());
    expect(p).toMatchObject({ server: "xuejila", boss: BOSSES[0].id, room: null, remind: false });
    expect(p.device.length).toBeGreaterThan(10);
  });
  it("存讀一致", () => {
    const s = mem();
    const p = { server: "gugu" as const, boss: BOSSES[1].id, room: "K7Q2AB", remind: true, device: "dev-1" };
    savePrefs(s, p);
    expect(loadPrefs(s)).toEqual(p);
  });
  it("未知伺服器、不存在的王退回預設", () => {
    const s = mem({ "ms-boss:prefs": JSON.stringify({ server: "zzz", boss: 99999, room: "K7Q2AB", device: "d" }) });
    const p = loadPrefs(s);
    expect(p.server).toBe("xuejila");
    expect(p.boss).toBe(BOSSES[0].id);
    expect(p.room).toBe("K7Q2AB");
    expect(p.device).toBe("d");
  });
  it("壞 JSON 與 storage 例外都回預設", () => {
    expect(loadPrefs(mem({ "ms-boss:prefs": "{" })).server).toBe("xuejila");
    expect(loadPrefs(broken).server).toBe("xuejila");
    expect(() => savePrefs(broken, loadPrefs(broken))).not.toThrow();
  });
});
