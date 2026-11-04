import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SLOT_ORDER, defaultOutfit, outfitQuery, takeOff } from "@/lib/avatar/outfit";
import type { Outfit } from "@/lib/avatar/outfit";
import { deckKey, liveLocks, locksText, parseLocks, peekLook, popLook, pushLook, restoreLook, sameLook } from "@/lib/avatar/looks";
import type { LockKey } from "@/lib/avatar/looks";
import { randomOutfit } from "@/lib/avatar/random";
import type { AvatarData } from "@/lib/avatar/types";

const data = JSON.parse(readFileSync(join(process.cwd(), "public/data/avatar.json"), "utf8")) as AvatarData;

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

/** 第 n 套：只有髮型不同，網址一定各不相同（outfitQuery 不驗髮型存不存在） */
const look = (n: number): Outfit => ({ ...defaultOutfit(0), hair: 40000 + n });
const parse = (history: string): unknown => JSON.parse(history);

describe("上一套（pushLook / peekLook / popLook）", () => {
  it("pushLook 第 31 筆丟最舊的；peek 拿最新；pop 之後 peek 拿前一筆", () => {
    let h = "";
    for (let n = 0; n < 31; n++) h = pushLook(h, look(n));
    const list = parse(h) as string[];
    expect(list).toHaveLength(30);
    // 第 0 套被丟掉，第 1 套變最舊
    expect(list[0]).toBe(outfitQuery(look(1)));
    expect(list[29]).toBe(outfitQuery(look(30)));
    expect(peekLook(h)).toBe(outfitQuery(look(30)));
    h = popLook(h);
    expect(parse(h) as string[]).toHaveLength(29);
    expect(peekLook(h)).toBe(outfitQuery(look(29)));
    // 一路 pop 到底：最後沒東西，peek 回 null、再 pop 不會丟錯
    for (let i = 0; i < 29; i++) h = popLook(h);
    expect(peekLook(h)).toBeNull();
    expect(peekLook(popLook(h))).toBeNull();
  });

  it("剛好 30 筆不丟；存的是網址參數字串", () => {
    let h = "";
    for (let n = 0; n < 30; n++) h = pushLook(h, look(n));
    const list = parse(h) as string[];
    expect(list).toHaveLength(30);
    expect(list[0]).toBe("h=40000");
    expect(peekLook(pushLook("", { ...defaultOutfit(1), skin: 2001 }))).toBe("g=1&s=2001");
  });

  it("全預設的穿搭存成空字串，peek 回 \"\" 不是 null", () => {
    const h = pushLook("", defaultOutfit(0));
    expect(parse(h)).toEqual([""]);
    expect(peekLook(h)).toBe("");
    expect(peekLook(h)).not.toBeNull();
    // 動作、表情、翻面不算：只差這三個，一樣是全預設
    expect(peekLook(pushLook("", { ...defaultOutfit(0), pose: "sit", emo: "cry", flip: true }))).toBe("");
    // pop 掉那筆空字串之後才變 null
    expect(peekLook(popLook(h))).toBeNull();
  });

  it("存的網址不含動作、表情、翻面，其他照存", () => {
    const o: Outfit = { ...defaultOutfit(0), hair: 30031, pose: "jump", emo: "wink", flip: true };
    expect(peekLook(pushLook("", o))).toBe("h=30031");
  });

  it("history 字串壞掉（\"{\"、\"123\"、\"[1,2]\"、\"\"）當成沒有：peek 回 null、push 從頭開始", () => {
    const o = look(7);
    for (const bad of ["{", "123", "[1,2]", "", '{"a":1}', '"abc"', "null", "true", '["a",1]', "[null]", "[[]]", "undefined", "[\"a\""]) {
      expect(peekLook(bad)).toBeNull();
      expect(parse(popLook(bad))).toEqual([]);
      const pushed = pushLook(bad, o);
      expect(parse(pushed)).toEqual([outfitQuery(o)]);
      expect(peekLook(pushed)).toBe(outfitQuery(o));
    }
  });

  it("空陣列、沒有東西可回：peek 回 null", () => {
    expect(peekLook("[]")).toBeNull();
    expect(parse(popLook("[]"))).toEqual([]);
  });

  it("舊版格式（超過 30 筆的陣列）也能讀；再 push 會裁到 30 筆", () => {
    const old = JSON.stringify(Array.from({ length: 40 }, (_, n) => `h=${40000 + n}`));
    expect(peekLook(old)).toBe("h=40039");
    const list = parse(pushLook(old, look(99))) as string[];
    expect(list).toHaveLength(30);
    expect(list[29]).toBe(outfitQuery(look(99)));
    expect(list[0]).toBe("h=40011");
  });
});

describe("鎖定（parseLocks / locksText / liveLocks）", () => {
  it("parseLocks 認不得的丟掉：\"hair,xxx,cap,\" → {hair, cap}；locksText 順序固定", () => {
    expect(parseLocks("hair,xxx,cap,")).toEqual(new Set(["hair", "cap"]));
    expect(parseLocks("")).toEqual(new Set());
    expect(parseLocks("   ")).toEqual(new Set());
    expect(parseLocks("Hair,CAP,constructor,__proto__,toString,0")).toEqual(new Set());
    // 順序亂、重複都沒關係，輸出固定：hair,face,skin，再照 SLOT_ORDER
    expect(locksText(new Set<LockKey>(["weapon", "skin", "cap", "hair", "face", "weapon"]))).toBe("hair,face,skin,cap,weapon");
    expect(locksText(new Set())).toBe("");
    const all: LockKey[] = ["hair", "face", "skin", ...SLOT_ORDER];
    expect(locksText(new Set([...all].reverse()))).toBe(all.join(","));
    // 存了再讀回來一樣
    expect(parseLocks(locksText(new Set(all)))).toEqual(new Set(all));
    expect(parseLocks("face,skin,earrings")).toEqual(new Set(["face", "skin", "earrings"]));
  });

  it("liveLocks：cap 沒穿就丟掉、hair 留著", () => {
    const o: Outfit = { ...defaultOutfit(0), wear: { coat: 1, pants: 2 } };
    const locks = new Set<LockKey>(["hair", "face", "skin", "cap", "coat", "weapon"]);
    expect(liveLocks(locks, o)).toEqual(new Set(["hair", "face", "skin", "coat"]));
    // 不動傳進來的集合
    expect(locks.size).toBe(6);
    // 只看格子有沒有東西，不看哪一件：換了別件鎖還在
    expect(liveLocks(new Set<LockKey>(["coat"]), { ...o, wear: { coat: 999 } })).toEqual(new Set(["coat"]));
    // 全脫光：裝備格的鎖全丟，髮型臉型膚色還在
    expect(liveLocks(locks, { ...o, wear: {} })).toEqual(new Set(["hair", "face", "skin"]));
    expect(liveLocks(new Set(), o)).toEqual(new Set());
  });
});

describe("sameLook / restoreLook", () => {
  const a = randomOutfit(data, defaultOutfit(0), mulberry32(11));

  it("sameLook 不看動作、表情、翻面", () => {
    expect(sameLook(a, a)).toBe(true);
    expect(sameLook(a, { ...a, pose: "sit", emo: "cry", flip: !a.flip })).toBe(true);
    // 穿搭只要有一處不一樣就不同
    expect(sameLook(a, { ...a, g: 1 })).toBe(false);
    expect(sameLook(a, { ...a, skin: a.skin + 1 })).toBe(false);
    expect(sameLook(a, { ...a, hair: a.hair + 1 })).toBe(false);
    expect(sameLook(a, { ...a, face: a.face + 100 })).toBe(false);
    expect(sameLook(a, { ...a, wear: { ...a.wear, cap: (a.wear.cap ?? 0) + 1 } })).toBe(false);
    expect(sameLook(a, { ...a, wear: { ...a.wear, shoes: undefined } })).toBe(false);
    expect(sameLook(defaultOutfit(0), { ...defaultOutfit(0), wear: { ...defaultOutfit(0).wear, cape: 1 } })).toBe(false);
    // 鍵的順序不同、值一樣算一樣
    expect(sameLook({ ...a, wear: { coat: 1, pants: 2 } }, { ...a, wear: { pants: 2, coat: 1 } })).toBe(true);
  });

  it("restoreLook 用現在的動作、表情、翻面", () => {
    const current: Outfit = { ...defaultOutfit(0), pose: "sit", emo: "cry", flip: true };
    const back = restoreLook(peekLook(pushLook("", a))!, current, data);
    expect(sameLook(back, a)).toBe(true);
    expect([back.pose, back.emo, back.flip]).toEqual(["sit", "cry", true]);
    // 存的時候動作、表情、翻面是別的也一樣
    const jumping: Outfit = { ...a, pose: "jump", emo: "wink", flip: true };
    const back2 = restoreLook(peekLook(pushLook("", jumping))!, { ...current, pose: "walk", emo: "love", flip: false }, data);
    expect(sameLook(back2, a)).toBe(true);
    expect([back2.pose, back2.emo, back2.flip]).toEqual(["walk", "love", false]);
  });

  it("restoreLook：隨機穿的男女各 100 套，存了再還原都一樣", () => {
    for (let i = 1; i <= 100; i++)
      for (const g of [0, 1] as const) {
        const o = randomOutfit(data, defaultOutfit(g), mulberry32(i * 13 + g));
        expect(sameLook(restoreLook(peekLook(pushLook("", o))!, defaultOutfit(g), data), o)).toBe(true);
      }
  });

  it("restoreLook：空字串是全預設；壞掉的字串不丟錯、回合法的穿搭", () => {
    const current: Outfit = { ...defaultOutfit(1), pose: "alert" };
    expect(sameLook(restoreLook("", current, data), defaultOutfit(0))).toBe(true);
    for (const bad of ["w=<script>", "g=1&h=abc&w=....", "try=1&&==", "%E0%A4%A", "s=999999&f=-1"]) {
      const o = restoreLook(bad, current, data);
      expect(o.pose).toBe("alert");
      expect(Number.isInteger(o.hair)).toBe(true);
    }
  });
});

describe("deckKey（先算好的下一套還能不能用）", () => {
  const worn: Outfit = { ...defaultOutfit(0), hair: 30030, wear: { cap: 1000016, coat: 1040002, pants: 1060002 } };
  const hair = new Set<LockKey>(["hair"]);

  it("性別、動作、表情、翻面任何一個變了，key 就變", () => {
    const key = deckKey(worn, hair);
    expect(deckKey({ ...worn, g: 1 }, hair)).not.toBe(key);
    expect(deckKey({ ...worn, pose: "walk" }, hair)).not.toBe(key);
    expect(deckKey({ ...worn, emo: "smile" }, hair)).not.toBe(key);
    expect(deckKey({ ...worn, flip: true }, hair)).not.toBe(key);
  });

  it("鎖多一格、少一格，key 就變", () => {
    const key = deckKey(worn, hair);
    expect(deckKey(worn, new Set<LockKey>(["hair", "cap"]))).not.toBe(key);
    expect(deckKey(worn, new Set<LockKey>())).not.toBe(key);
  });

  it("鎖住的那件換了，key 就變；沒鎖的那幾件換了，key 不變（反正會重挑）", () => {
    const capLocked = new Set<LockKey>(["cap"]);
    const key = deckKey(worn, capLocked);
    expect(deckKey({ ...worn, wear: { ...worn.wear, cap: 1000017 } }, capLocked)).not.toBe(key);
    expect(deckKey({ ...worn, hair: 30040, wear: { ...worn.wear, coat: 1040003 } }, capLocked)).toBe(key);
  });

  it("空格子的鎖不算數（隨機穿搭也不看它）", () => {
    const bare = takeOff(worn, "cap");
    expect(deckKey(bare, new Set<LockKey>(["cap"]))).toBe(deckKey(bare, new Set<LockKey>()));
  });
});
