import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HALLOWEEN, halloweenChapterFor, halloweenOn } from "@/lib/halloween";
import { navFor } from "@/lib/nav";

const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
const steps = (n: number) => HALLOWEEN.chapters[n - 1].legs.flatMap(leg => leg.steps);
const at = (iso: string) => new Date(iso).getTime();

describe("萬聖節面具祭典攻略（v1.19）", () => {
  it("三章的任務一段不漏、照遊戲的順序（第三章 506448 夾在 506415 後面）", () => {
    expect(steps(1).map(s => s.id)).toEqual(ids(506363, 506384));
    expect(steps(2).map(s => s.id)).toEqual(ids(506385, 506411));
    expect(steps(3).map(s => s.id)).toEqual(["506412", "506413", "506414", "506415", "506448", ...ids(506416, 506436)]);
  });

  it("打怪卡都對得到路線上標了打怪的那一段", () => {
    for (const chapter of HALLOWEEN.chapters) {
      const hunted = chapter.legs.flatMap(leg => leg.steps).filter(s => s.hunt).map(s => s.id);
      expect(chapter.hunts.map(h => h.questId).sort()).toEqual([...hunted].sort());
    }
  });

  it("用到的 NPC、怪、道具、小地圖圖檔都在 public 裡", () => {
    const files = new Set<string>();
    for (const chapter of HALLOWEEN.chapters) {
      for (const s of chapter.legs.flatMap(leg => leg.steps)) {
        files.add(`assets/npcs/${s.from.npc}.png`);
        if (s.to) files.add(`assets/npcs/${s.to.npc}.png`);
      }
      for (const h of chapter.hunts) {
        for (const need of h.needs) files.add(need.kind === "mob" ? `assets/monster_frames/${need.id}.png` : `assets/items/${need.id}.png`);
        for (const m of h.maps) files.add(m.image ?? `minimaps/${m.id}.png`);
      }
    }
    const missing = [...files].filter(file => !fs.existsSync(path.join("public", file)));
    expect(missing).toEqual([]);
  });

  it("使用者 10/29 實玩更正：行李在冰面Ⅰ的積雪、粉末打星光精靈、狼會掉筋腱", () => {
    const hunt = (id: string) => HALLOWEEN.chapters[2].hunts.find(h => h.questId === id)!;
    expect(hunt("506416").maps.map(m => m.id)).toContain(211010000);
    expect(hunt("506416").tip).toContain("積雪");
    expect(hunt("506420").needs.filter(n => n.kind === "mob").map(n => n.id)).toEqual([3210200, 3230200]);
    expect(hunt("506424").tip).not.toContain("確認");
  });

  it("活動到 11/11 23:59（台灣）：之後入口收掉", () => {
    expect(halloweenOn(at("2026-11-11T23:59:59+08:00"))).toBe(true);
    expect(halloweenOn(at("2026-11-12T00:00:00+08:00"))).toBe(false);
  });

  it("預設打開最新開放的那一章", () => {
    expect(halloweenChapterFor(at("2026-10-20T12:00:00+08:00"))).toBe(1);
    expect(halloweenChapterFor(at("2026-10-22T00:00:00+08:00"))).toBe(2);
    expect(halloweenChapterFor(at("2026-10-29T09:00:00+08:00"))).toBe(3);
    expect(halloweenChapterFor(at("2026-12-01T00:00:00+08:00"))).toBe(3);
  });

  it("導覽列活動期間多一顆「萬聖節」（只在電腦版，手機四顆已經放滿），結束就不見", () => {
    const during = navFor(at("2026-10-29T12:00:00+08:00"));
    expect(during.find(item => item.label === "萬聖節")).toMatchObject({ href: "/event/halloween", desktopOnly: true });
    expect(navFor(at("2026-11-12T00:00:00+08:00")).some(item => item.label === "萬聖節")).toBe(false);
  });
});
