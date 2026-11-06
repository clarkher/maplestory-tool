import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FOURTH_JOBS, LAST_GAP_DAYS, STATIONS, fourthJobOf, isLate, staleNotice } from "@/lib/future/forecast";
import type { Item } from "@/lib/types";

const readData = <T,>(name: string): T => JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "public/data", name), "utf8"));

describe("未來視：預測的時間", () => {
  it("上一次間隔真的是 78 天、往後算落在 12/31 那週（數字改了文字要跟著改）", () => {
    const day = 86_400_000;
    expect((Date.parse("2026-10-15") - Date.parse("2026-07-29")) / day).toBe(LAST_GAP_DAYS);
    expect(new Date(Date.parse("2026-10-15") + LAST_GAP_DAYS * day).toISOString().slice(0, 10)).toBe("2027-01-01");
    expect(new Date("2026-12-31T00:00:00Z").getUTCDay()).toBe(4); // 12/31 是週四（例行維護日）
  });

  it("預測還沒更新時，發佈會一開始頁頂就要講；之前不講", () => {
    expect(staleNotice(Date.parse("2026-11-21T12:59:00+08:00"), "2026-11-06")).toBeNull();
    expect(staleNotice(Date.parse("2026-11-21T13:00:00+08:00"), "2026-11-06")).toContain("發佈會");
    expect(staleNotice(Date.parse("2026-11-22T13:00:00+08:00"), "2026-11-22")).toBeNull();
  });

  it("預估窗過了標比預估晚，官方那站沒有窗", () => {
    const next = STATIONS.find(s => s.id === "next")!;
    expect(isLate(next, Date.parse("2027-01-31T12:00:00+08:00"))).toBe(false);
    expect(isLate(next, Date.parse("2027-02-01T00:00:00+08:00"))).toBe(true);
    expect(isLate(STATIONS.find(s => s.id === "party")!, Date.parse("2030-01-01"))).toBe(false);
  });
});

describe("未來視：手寫的內容對得上遊戲資料", () => {
  const items = readData<Item[]>("items.json");
  const byId = new Map(items.map(item => [item.id, item]));

  it("每件準備道具站上都有；名字一致（秘咒那筆是在講錢）；每條都有出處", () => {
    for (const station of STATIONS) {
      expect(station.sources.length, station.id).toBeGreaterThan(0);
      for (const prep of station.prep ?? []) {
        const item = byId.get(prep.item);
        expect(item, prep.name).toBeTruthy();
        if (prep.item !== 4031348) expect(item!.n).toBe(prep.name);
        expect(prep.source.href).toMatch(/^https:/);
      }
    }
  });

  it("寫「打某怪」的道具，那隻怪真的掉", () => {
    const monsters = new Map(readData<Array<{ id: number; n: string }>>("monsters.json").map(m => [m.id, m.n]));
    const mobsOf = (id: number) => (byId.get(id)?.dm ?? []).map(mob => monsters.get(mob));
    expect(mobsOf(4000082)).toContain("礦山殭屍");
    expect(mobsOf(2050004)).toEqual(expect.arrayContaining(["蝴蝶精", "黑格里芬"]));
    expect(mobsOf(4004000)).toEqual(expect.arrayContaining(["石球", "利堤"]));
  });

  it("材料檔的四轉職業跟畫面的名字表一模一樣；現在拿得到的都寫得出怎麼拿", () => {
    const future = readData<{ crafts: { now: Array<{ n: string; how: unknown[] }> }; fourthJob: Record<string, { now: Array<{ how: unknown[] }> }> }>("future.json");
    expect(Object.keys(future.fourthJob).map(Number).sort((a, b) => a - b)).toEqual(FOURTH_JOBS.map(([id]) => id));
    for (const row of future.crafts.now) expect(row.how.length, row.n).toBeGreaterThan(0);
    for (const job of Object.values(future.fourthJob)) for (const row of job.now) expect(row.how.length).toBeGreaterThan(0);
    expect(future.crafts.now.slice(0, 4).map(row => row.n)).toEqual(["螺絲釘", "鋼鐵", "龍皮", "動物皮"]);
  });
});

describe("未來視：畫面規矩", () => {
  it("手寫的字跟畫面都沒有 emoji", () => {
    for (const file of ["src/lib/future/forecast.ts", "src/app/future/FutureView.tsx", "src/app/future/page.tsx"]) {
      expect(fs.readFileSync(path.resolve(process.cwd(), file), "utf8"), file).not.toMatch(/[\u2300-\u23FF\u25A0-\u25FF\u2600-\u27BF\u{1F000}-\u{1FAFF}]/u);
    }
  });
});

describe("未來視：玩家的職業接到哪個四轉", () => {
  it("二轉、三轉接得到；初心者、一轉、四碼職業沒有", () => {
    expect(fourthJobOf(210)).toBe(212);
    expect(fourthJobOf(211)).toBe(212);
    expect(fourthJobOf(321)).toBe(322);
    expect(fourthJobOf(512)).toBe(512);
    expect(fourthJobOf(0)).toBeNull();
    expect(fourthJobOf(-1)).toBeNull();
    expect(fourthJobOf(200)).toBeNull();
    expect(fourthJobOf(2112)).toBeNull();
  });
});
