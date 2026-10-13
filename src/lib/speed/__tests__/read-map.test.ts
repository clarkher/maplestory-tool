// src/lib/speed/__tests__/read-map.test.ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import type { MapRecord, TrainingRow } from "@/lib/types";
import { findMapButton, readTitle, resolveMap, type TitleReading } from "../read-map";
import { parseNames } from "../names";
import { loadFixture } from "./fixture";

const names = parseNames(JSON.parse(fs.readFileSync("public/data/speed-names.json", "utf8")));
const maps: Record<string, MapRecord> = JSON.parse(fs.readFileSync("public/data/maps.json", "utf8"));
const training: TrainingRow[] = JSON.parse(fs.readFileSync("public/data/training.json", "utf8"));
const trainingIds = new Set(training.map(row => row.m));

describe("小地圖標題", () => {
  it.each([1, 1.5, 2])("放大 %s 倍：找到橘色「地圖」按鈕（基準 82–118、39–50），不會找到標題列的楓葉", async scale => {
    const button = findMapButton(await loadFixture("window-1364.png", scale))!;
    expect(button.x0 / scale).toBeCloseTo(82, -1);
    expect(button.y0 / scale).toBeCloseTo(39, -1);
    expect((button.x1 - button.x0) / (button.y1 - button.y0)).toBeGreaterThan(2.5);
  });

  it("讀得到兩行、簽章固定（同一張畫面兩次一樣）", async () => {
    const frame = await loadFixture("window-1364.png");
    const a = readTitle(frame, names)!;
    const b = readTitle(frame, names)!;
    expect(a.signature).toBe(b.signature);
    expect(a.street.length).toBeGreaterThan(10);
    expect(a.name.length).toBeGreaterThan(100);
  });

  it("記過的簽章直接用記下的地圖", () => {
    const title: TitleReading = { signature: "abc", street: [], name: [] };
    expect(resolveMap(title, maps, trainingIds, { abc: 105040303 })).toEqual({ mapId: 105040303, confident: true, choices: [] });
  });

  it("街道＋地圖名一起排：明顯最像的才自動認，候選最多 5 張、同名的取有練功資料的那張", () => {
    const title: TitleReading = {
      signature: "x",
      street: [{ text: "迷霧森林", d: 0.02 }, { text: "黃金海岸", d: 0.09 }],
      name: [{ text: "森林迷宮III", d: 0.03 }, { text: "森林迷宮II", d: 0.06 }, { text: "森林迷宮IV", d: 0.065 }],
    };
    const guess = resolveMap(title, maps, trainingIds, {});
    expect(guess.mapId).toBe(105040303);
    expect(guess.confident).toBe(true);
    expect(guess.choices[0]).toBe(105040303);
    expect(guess.choices.length).toBeLessThanOrEqual(5);
  });

  it("前兩名太接近：不自動認，給候選讓玩家點", () => {
    const title: TitleReading = {
      signature: "x",
      street: [{ text: "迷霧森林", d: 0.02 }],
      name: [{ text: "森林迷宮III", d: 0.03 }, { text: "森林迷宮II", d: 0.032 }],
    };
    const guess = resolveMap(title, maps, trainingIds, {});
    expect(guess.confident).toBe(false);
    expect(guess.choices).toEqual(expect.arrayContaining([105040303, 105040302]));
  });
});
