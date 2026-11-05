import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultOutfit, faceDrawable, hairDrawable, itemIndex } from "@/lib/avatar/outfit";
import { randomOutfit } from "@/lib/avatar/random";
import type { AvatarData } from "@/lib/avatar/types";

const data = JSON.parse(readFileSync(join(process.cwd(), "public/data/avatar.json"), "utf8")) as AvatarData;
const idx = itemIndex(data);

/** 固定種子的亂數（mulberry32）：測試每次跑出來都一樣 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261103);

// 跑 200 次、男女各一輪，後面幾個測試共用這批結果
const runs = [0, 1].flatMap((g) =>
  Array.from({ length: 200 }, () => randomOutfit(data, defaultOutfit(g as 0 | 1), rng)),
);

describe("隨機穿搭", () => {
  it("200 次都合法：性別對、畫得出來、不衝突", () => {
    for (let i = 0; i < 200; i++)
      for (const g of [0, 1] as const) {
        const o = randomOutfit(data, defaultOutfit(g), rng);
        expect(o.g).toBe(g);
        for (const id of Object.values(o.wear)) {
          const it = idx.get(id!)!;
          expect(it.r).toBeTruthy();
          expect([g, 2]).toContain(it.g);
        }
        expect(o.wear.overall && (o.wear.coat || o.wear.pants)).toBeFalsy();
        if (o.wear.weapon && idx.get(o.wear.weapon)!.h) expect(o.wear.shield).toBeUndefined();
        expect(hairDrawable(data, o.hair)).toBe(true);
        expect(faceDrawable(data, o.face)).toBe(true);
      }
  });

  it("沿用動作、表情、翻面", () => {
    const o = randomOutfit(data, { ...defaultOutfit(0), pose: "sit", emo: "cry", flip: true }, rng);
    expect([o.pose, o.emo, o.flip]).toEqual(["sit", "cry", true]);
  });

  it("每格道具放在對的格子，髮型臉型性別對、膚色是 8 選 1", () => {
    const skins = new Set(data.skin.map((s) => s.id));
    for (const o of runs) {
      for (const [k, id] of Object.entries(o.wear)) expect(idx.get(id!)!.k).toBe(k);
      const hair = data.hair.find((h) => h.id === Math.floor(o.hair / 10) * 10)!;
      const face = data.face.find((f) => f.id === o.face - (Math.floor(o.face / 100) % 10) * 100)!;
      expect([o.g, 2]).toContain(hair.g);
      expect([o.g, 2]).toContain(face.g);
      expect(skins.has(o.skin)).toBe(true);
    }
  });

  it("鞋子、手套、帽子、披風、武器一定各穿一件；套服或上衣＋褲裙二選一", () => {
    for (const o of runs) {
      for (const k of ["shoes", "glove", "cap", "cape", "weapon"] as const) expect(o.wear[k]).toBeDefined();
      if (o.wear.overall) expect(Object.keys(o.wear)).not.toEqual(expect.arrayContaining(["coat"]));
      else expect([o.wear.coat, o.wear.pants].every((v) => v !== undefined)).toBe(true);
    }
  });

  it("不是千篇一律：套服／上衣褲裙都出現過、眼飾臉飾耳環有穿有不穿、單手武器有配盾牌也有不配、雙手不配", () => {
    const has = (pred: (o: (typeof runs)[number]) => boolean) => runs.filter(pred).length;
    const n = runs.length;
    expect(has((o) => !!o.wear.overall)).toBeGreaterThan(n * 0.3);
    expect(has((o) => !o.wear.overall)).toBeGreaterThan(n * 0.3);
    for (const k of ["eyeAcc", "faceAcc", "earrings"] as const) {
      expect(has((o) => o.wear[k] !== undefined)).toBeGreaterThan(n * 0.3);
      expect(has((o) => o.wear[k] === undefined)).toBeGreaterThan(n * 0.3);
    }
    const oneHand = runs.filter((o) => !idx.get(o.wear.weapon!)!.h);
    const twoHand = runs.filter((o) => idx.get(o.wear.weapon!)!.h);
    expect(oneHand.filter((o) => o.wear.shield !== undefined).length).toBeGreaterThan(oneHand.length * 0.3);
    expect(oneHand.filter((o) => o.wear.shield === undefined).length).toBeGreaterThan(oneHand.length * 0.3);
    expect(twoHand.length).toBeGreaterThan(0);
    expect(twoHand.every((o) => o.wear.shield === undefined)).toBe(true);
    // 髮型、臉型、髮色也有變化
    expect(new Set(runs.map((o) => o.hair)).size).toBeGreaterThan(100);
    expect(new Set(runs.map((o) => o.face)).size).toBeGreaterThan(100);
    expect(new Set(runs.map((o) => o.skin)).size).toBe(8);
  });

  it("髮色、瞳色從台服＋日服畫得出的顏色挑（日服限定款也會被挑到）", () => {
    const jOnlyHair = new Set(data.hair.filter((h) => h.t.length === 0).map((h) => h.id));
    const jOnlyFace = new Set(data.face.filter((f) => f.t.length === 0).map((f) => f.id));
    expect(runs.some((o) => jOnlyHair.has(Math.floor(o.hair / 10) * 10))).toBe(true);
    expect(runs.some((o) => jOnlyFace.has(o.face - (Math.floor(o.face / 100) % 10) * 100))).toBe(true);
    // 顏色不只第 0 號
    expect(new Set(runs.map((o) => o.hair % 10)).size).toBe(8);
    expect(new Set(runs.map((o) => Math.floor(o.face / 100) % 10)).size).toBe(8);
  });

  it("同一顆種子結果一樣，不碰 base 的穿搭", () => {
    const base = defaultOutfit(1);
    const snapshot = JSON.stringify(base);
    const a = randomOutfit(data, base, mulberry32(7));
    const b = randomOutfit(data, base, mulberry32(7));
    expect(a).toEqual(b);
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it("不給 rng 也能跑（預設 Math.random）", () => {
    const o = randomOutfit(data, defaultOutfit(0));
    expect(hairDrawable(data, o.hair)).toBe(true);
  });
});
