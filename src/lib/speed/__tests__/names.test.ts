// src/lib/speed/__tests__/names.test.ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseNames, rankText, type RawSpeedNames } from "../names";

const raw = JSON.parse(fs.readFileSync("public/data/speed-names.json", "utf8")) as RawSpeedNames;

describe("名字樣板檔", () => {
  it("每個名字的格子數＝每字 8 格寬 × 行高 8 格", () => {
    const names = parseNames(raw);
    expect(names.gh).toBe(8);
    for (const entry of [...names.jobs, ...names.titles]) {
      expect(entry.grid.length).toBe(entry.gw * names.gh);
      expect(entry.gw).toBe(8 * Array.from(entry.text).length);
      expect(entry.aspect).toBeGreaterThan(0.5);
    }
  });

  it("地圖名、街道名都收進來了，不重複", () => {
    const names = parseNames(raw);
    expect(names.titles.length).toBeGreaterThan(300);
    expect(new Set(names.titles.map(entry => entry.text)).size).toBe(names.titles.length);
    expect(names.titles.map(entry => entry.text)).toContain("菇菇村");
  });

  it("排名：拿樣板自己的格子當墨，自己排第一、全部候選都在、由小到大", () => {
    const names = parseNames(raw);
    const target = names.jobs.find(entry => entry.text === "神槍手")!;
    // 把樣板格子（8 行 × gw 列）放大成一張墨圖：每格 4×4 像素
    const cell = 4;
    const mask = { w: target.gw * cell, h: names.gh * cell, m: new Float32Array(target.gw * cell * names.gh * cell) };
    for (let y = 0; y < mask.h; y++) {
      for (let x = 0; x < mask.w; x++) mask.m[y * mask.w + x] = target.grid[Math.floor(y / cell) * target.gw + Math.floor(x / cell)];
    }
    const ranked = rankText(mask, names.jobs, names.gh);
    expect(ranked).toHaveLength(names.jobs.length);
    expect(ranked[0].text).toBe("神槍手");
    for (let i = 1; i < ranked.length; i++) expect(ranked[i].d).toBeGreaterThanOrEqual(ranked[i - 1].d);
  });

  it("沒有墨、或墨太矮（< 4 列）：回空陣列", () => {
    const names = parseNames(raw);
    expect(rankText({ w: 40, h: 20, m: new Float32Array(800) }, names.jobs, names.gh)).toEqual([]);
    const flat = { w: 40, h: 20, m: new Float32Array(800) };
    for (let x = 0; x < 40; x++) flat.m[10 * 40 + x] = 1;
    expect(rankText(flat, names.jobs, names.gh)).toEqual([]);
  });
});
