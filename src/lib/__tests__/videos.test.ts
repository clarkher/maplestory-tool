import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EPISODES, visibleEpisodes } from "../videos";

describe("影片清單（v2.32）", () => {
  it("只列已經公開的，新的在前", () => {
    const now = Date.parse("2026-11-17T12:00:00Z");
    const list = visibleEpisodes(now);
    expect(list.length).toBeGreaterThan(0);
    for (const ep of list) expect(Date.parse(ep.publishAt)).toBeLessThanOrEqual(now);
    for (let i = 1; i < list.length; i++) expect(Date.parse(list[i - 1].publishAt)).toBeGreaterThanOrEqual(Date.parse(list[i].publishAt));
    // 排在 11/19 公開的楓葉商會那集，11/17 還不能出現
    expect(list.some(ep => ep.main === "CNX14Q4RO2Y")).toBe(false);
    expect(visibleEpisodes(Date.parse("2026-11-19T10:00:00Z")).some(ep => ep.main === "CNX14Q4RO2Y")).toBe(true);
  });

  it("每支片都有 11 碼 id 跟站上的封面，工具連結是站內路徑", () => {
    const ids = new Set<string>();
    for (const ep of EPISODES) {
      expect(Number.isNaN(Date.parse(ep.publishAt))).toBe(false);
      expect(ep.main || ep.shorts).toBeTruthy();
      for (const id of [ep.main, ep.shorts].filter(Boolean) as string[]) {
        expect(id).toMatch(/^[A-Za-z0-9_-]{11}$/);
        expect(ids.has(id)).toBe(false);
        ids.add(id);
        expect(fs.existsSync(path.join(process.cwd(), "public/videos", `${id}.webp`))).toBe(true);
      }
      if (ep.tool) expect(ep.tool.href.startsWith("/")).toBe(true);
    }
  });
});
