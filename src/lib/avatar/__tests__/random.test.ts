import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SLOT_ORDER, defaultOutfit, faceDrawable, hairDrawable, itemIndex } from "@/lib/avatar/outfit";
import type { Outfit } from "@/lib/avatar/outfit";
import type { LockKey } from "@/lib/avatar/looks";
import { randomOutfit } from "@/lib/avatar/random";
import type { AvatarData, AvatarItem, SlotKey } from "@/lib/avatar/types";

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

describe("隨機穿搭加鎖", () => {
  // 從真資料挑常數（不寫死 id，資料更新也不會壞）；男生穿得了、畫得出來
  const first = (k: SlotKey, pred: (i: AvatarItem) => boolean = () => true) =>
    data.items.find((i) => i.k === k && !!i.r && i.g !== 1 && pred(i))!.id;
  const ONE_HAND = first("weapon", (i) => !i.h);
  const TWO_HAND = first("weapon", (i) => !!i.h);
  const SHIELD = first("shield");
  const OVERALL = first("overall");
  const COAT = first("coat");
  const PANTS = first("pants");
  const base = (wear: Outfit["wear"]): Outfit => ({ ...defaultOutfit(0), wear, hair: 30030, face: 20000 });
  /** 種子 1～200 各跑一次 */
  const run200 = (b: Outfit, locks: ReadonlySet<LockKey>) =>
    Array.from({ length: 200 }, (_, i) => randomOutfit(data, b, mulberry32(i + 1), locks));
  const locksOf = (...keys: LockKey[]) => new Set<LockKey>(keys);

  it("鎖住的 200 次都不變：髮型含顏色、臉型、膚色、裝備", () => {
    // 髮色 5、瞳色 3、膚色第 6 個：都不是預設，才看得出「連顏色一起鎖」
    const hair = data.hair.find((s) => s.g !== 1 && s.t.includes(5))!.id + 5;
    const face = data.face.find((s) => s.g !== 1 && s.t.includes(3))!.id + 300;
    const skin = data.skin[5].id;
    expect(hairDrawable(data, hair)).toBe(true);
    expect(faceDrawable(data, face)).toBe(true);
    const wear: Outfit["wear"] = {
      cap: first("cap"),
      coat: COAT,
      pants: PANTS,
      shoes: first("shoes"),
      glove: first("glove"),
      cape: first("cape"),
      weapon: ONE_HAND,
      shield: SHIELD,
      eyeAcc: first("eyeAcc"),
      faceAcc: first("faceAcc"),
      earrings: first("earrings"),
    };
    const b: Outfit = { ...base(wear), hair, face, skin, pose: "sit", emo: "cry", flip: true };

    // 全鎖：什麼都不變
    for (const o of run200(b, locksOf("hair", "face", "skin", ...(Object.keys(wear) as SlotKey[])))) expect(o).toEqual(b);

    // 只鎖一部分：鎖的不變，沒鎖的照樣在變
    const some = run200(b, locksOf("hair", "face", "skin", "cap", "glove", "earrings"));
    for (const o of some) {
      expect([o.hair, o.face, o.skin]).toEqual([hair, face, skin]);
      expect([o.wear.cap, o.wear.glove, o.wear.earrings]).toEqual([wear.cap, wear.glove, wear.earrings]);
      expect([o.pose, o.emo, o.flip]).toEqual(["sit", "cry", true]);
    }
    expect(new Set(some.map((o) => o.wear.shoes)).size).toBeGreaterThan(20);
    expect(new Set(some.map((o) => o.wear.weapon)).size).toBeGreaterThan(20);
    expect(new Set(some.map((o) => o.wear.cape)).size).toBeGreaterThan(20);
  });

  it("只鎖髮型：臉型、膚色照樣換；只鎖臉型：髮型照樣換", () => {
    const hairOnly = run200(base({}), locksOf("hair"));
    expect(hairOnly.every((o) => o.hair === 30030)).toBe(true);
    expect(new Set(hairOnly.map((o) => o.face)).size).toBeGreaterThan(50);
    expect(new Set(hairOnly.map((o) => o.skin)).size).toBe(8);
    const faceOnly = run200(base({}), locksOf("face"));
    expect(faceOnly.every((o) => o.face === 20000)).toBe(true);
    expect(new Set(faceOnly.map((o) => o.hair)).size).toBeGreaterThan(50);
  });

  it("鎖套服：200 次都沒有上衣、褲裙", () => {
    for (const o of run200(base({ overall: OVERALL }), locksOf("overall"))) {
      expect(o.wear.overall).toBe(OVERALL);
      expect(o.wear.coat).toBeUndefined();
      expect(o.wear.pants).toBeUndefined();
      expect(o.wear.shoes).toBeDefined(); // 其他格子照挑
    }
  });

  it("鎖上衣：200 次都沒有套服、褲裙照挑（200 次裡至少一次有褲裙）", () => {
    const runs = run200(base({ coat: COAT }), locksOf("coat"));
    for (const o of runs) {
      expect(o.wear.coat).toBe(COAT);
      expect(o.wear.overall).toBeUndefined();
    }
    expect(runs.some((o) => o.wear.pants !== undefined)).toBe(true);
    expect(new Set(runs.map((o) => o.wear.pants)).size).toBeGreaterThan(20);
  });

  it("鎖褲裙：200 次都沒有套服、上衣照挑", () => {
    const runs = run200(base({ pants: PANTS }), locksOf("pants"));
    for (const o of runs) {
      expect(o.wear.pants).toBe(PANTS);
      expect(o.wear.overall).toBeUndefined();
    }
    expect(new Set(runs.map((o) => o.wear.coat)).size).toBeGreaterThan(20);
  });

  it("上衣褲裙都鎖：兩件都不變、沒有套服", () => {
    for (const o of run200(base({ coat: COAT, pants: PANTS }), locksOf("coat", "pants"))) {
      expect([o.wear.coat, o.wear.pants, o.wear.overall]).toEqual([COAT, PANTS, undefined]);
    }
  });

  it("鎖盾牌：200 次武器都是單手、盾牌還在", () => {
    const runs = run200(base({ shield: SHIELD }), locksOf("shield"));
    for (const o of runs) {
      expect(o.wear.shield).toBe(SHIELD);
      expect(o.wear.weapon).toBeDefined();
      expect(idx.get(o.wear.weapon!)!.h).toBeFalsy();
    }
    expect(new Set(runs.map((o) => o.wear.weapon)).size).toBeGreaterThan(20);
  });

  it("鎖雙手武器：200 次都沒有盾牌", () => {
    for (const o of run200(base({ weapon: TWO_HAND }), locksOf("weapon"))) {
      expect(o.wear.weapon).toBe(TWO_HAND);
      expect(o.wear.shield).toBeUndefined();
    }
  });

  it("鎖單手武器：200 次裡有配盾牌也有沒配的", () => {
    const runs = run200(base({ weapon: ONE_HAND }), locksOf("weapon"));
    for (const o of runs) expect(o.wear.weapon).toBe(ONE_HAND);
    expect(runs.filter((o) => o.wear.shield !== undefined).length).toBeGreaterThan(200 * 0.3);
    expect(runs.filter((o) => o.wear.shield === undefined).length).toBeGreaterThan(200 * 0.3);
  });

  it("武器跟盾牌都鎖：兩件都不變", () => {
    for (const o of run200(base({ weapon: ONE_HAND, shield: SHIELD }), locksOf("weapon", "shield"))) {
      expect([o.wear.weapon, o.wear.shield]).toEqual([ONE_HAND, SHIELD]);
    }
  });

  it("鎖了空的格子當沒鎖：照常挑，不會丟錯", () => {
    const b = base({}); // 什麼都沒穿
    const empties = locksOf("cap", "overall", "weapon", "shield");
    for (let i = 1; i <= 200; i++) {
      // 空格子的鎖不算數：結果跟沒鎖一模一樣（連亂數消耗都一樣）
      expect(randomOutfit(data, b, mulberry32(i), empties)).toEqual(randomOutfit(data, b, mulberry32(i)));
    }
    const o = randomOutfit(data, b, mulberry32(1), empties);
    expect(o.wear.cap).toBeDefined();
    expect(o.wear.weapon).toBeDefined();
    // 空格子的鎖旁邊有真的鎖（髮型）：空的不影響、髮型照鎖
    for (const r of run200(b, locksOf("cap", "weapon", "hair"))) {
      expect(r.hair).toBe(30030);
      expect(r.wear.cap).toBeDefined();
      expect(r.wear.weapon).toBeDefined();
    }
  });

  it("沒傳 locks：同一個種子結果跟不傳第四個參數一樣", () => {
    for (const g of [0, 1] as const)
      for (let i = 1; i <= 200; i++) {
        const b = defaultOutfit(g);
        expect(randomOutfit(data, b, mulberry32(i), new Set())).toEqual(randomOutfit(data, b, mulberry32(i)));
      }
  });

  it("任意鎖組合：鎖住的 id 都不變、不出現互斥的組合、其他格子仍合法", () => {
    const all: LockKey[] = ["hair", "face", "skin", ...SLOT_ORDER];
    for (let i = 1; i <= 200; i++) {
      const g = (i % 2) as 0 | 1;
      // 先隨機穿一套當底（穿滿、合法），再隨機鎖幾格
      const b = randomOutfit(data, defaultOutfit(g), mulberry32(i * 31));
      const pickRng = mulberry32(i * 97 + 5);
      const locks = new Set(all.filter(() => pickRng() < 0.4));
      const o = randomOutfit(data, b, mulberry32(i), locks);

      if (locks.has("hair")) expect(o.hair).toBe(b.hair);
      if (locks.has("face")) expect(o.face).toBe(b.face);
      if (locks.has("skin")) expect(o.skin).toBe(b.skin);
      for (const k of SLOT_ORDER) if (locks.has(k) && b.wear[k] !== undefined) expect(o.wear[k]).toBe(b.wear[k]);

      expect(o.wear.overall && (o.wear.coat || o.wear.pants)).toBeFalsy();
      if (o.wear.weapon && idx.get(o.wear.weapon)!.h) expect(o.wear.shield).toBeUndefined();
      for (const [k, id] of Object.entries(o.wear)) {
        const it = idx.get(id!)!;
        expect(it.k).toBe(k);
        expect(it.r).toBeTruthy();
        expect([g, 2]).toContain(it.g);
      }
      expect(hairDrawable(data, o.hair)).toBe(true);
      expect(faceDrawable(data, o.face)).toBe(true);
    }
  });
});
