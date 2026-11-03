import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMOS,
  EYE_COLORS,
  HAIR_COLORS,
  POSES,
  defaultOutfit,
  eyeColour,
  faceDrawable,
  faceStyle,
  hairColour,
  hairDrawable,
  hairStyle,
  itemIndex,
  outfitQuery,
  parseOutfit,
  removedSlots,
  setGender,
  takeOff,
  wearItem,
} from "@/lib/avatar/outfit";
import type { Outfit } from "@/lib/avatar/outfit";
import { avatarLink } from "@/lib/avatar/linkable";
import { randomOutfit } from "@/lib/avatar/random";
import type { AvatarData, AvatarItem } from "@/lib/avatar/types";
import type { Item } from "@/lib/types";

const data = JSON.parse(readFileSync(join(process.cwd(), "public/data/avatar.json"), "utf8")) as AvatarData;
const index = itemIndex(data);
const byId = (id: number): AvatarItem => {
  const it = index.get(id);
  if (!it) throw new Error("avatar.json 沒有這個道具 " + id);
  return it;
};
const fits = (g: 0 | 1 | 2, who: 0 | 1) => g === who || g === 2;

// 從真資料挑常數（不寫死 id，資料更新也不會壞）
const CAP_F = data.items.find((i) => i.k === "cap" && i.g === 1 && i.r)!.id;
const UNISEX_CAP = data.items.find((i) => i.k === "cap" && i.g === 2 && i.r)!.id;
const FEMALE_OVERALL = data.items.find((i) => i.k === "overall" && i.g === 1 && i.r)!.id;
const MALE_OVERALL = data.items.find((i) => i.k === "overall" && i.g === 0 && i.r)!.id;
const MALE_COAT = data.items.find((i) => i.k === "coat" && i.g === 0 && i.r)!.id;
const UNISEX_COAT = data.items.find((i) => i.k === "coat" && i.g === 2 && i.r)!.id;
const UNISEX_PANTS = data.items.find((i) => i.k === "pants" && i.g === 2 && i.r)!.id;
const FEMALE_PANTS = data.items.find((i) => i.k === "pants" && i.g === 1 && i.r)!.id;
// 男生穿得了、但畫不出來：被擋的原因只會是「畫不出來」
const UNDRAWABLE = data.items.find((i) => !i.r && i.g !== 1)!.id;
const TWO_HANDED = data.items.find((i) => i.k === "weapon" && i.h && i.r && i.g !== 1)!.id;
const RED_HAIR_M = data.hair.find((h) => h.g === 0 && h.t.includes(1))!.id + 1;
// 臉型要 0、1 號瞳色都畫得出來（測試會用 +100 換瞳色）
const FACE_F = data.face.find((f) => f.g === 1 && f.t.includes(0) && f.t.includes(1))!.id;

describe("預設穿搭", () => {
  it.each([0, 1] as const)("性別 %i 的預設：道具、髮型、臉型都在資料裡、畫得出來、性別對", (g) => {
    const o = defaultOutfit(g);
    expect(o).toMatchObject({ g, skin: 2000, pose: "stand", emo: "default", flip: false });
    expect(data.skin.some((s) => s.id === o.skin)).toBe(true);
    expect(hairDrawable(data, o.hair)).toBe(true);
    expect(faceDrawable(data, o.face)).toBe(true);
    expect(fits(data.hair.find((h) => h.id === Math.floor(o.hair / 10) * 10)!.g, g)).toBe(true);
    expect(fits(data.face.find((f) => f.id === o.face)!.g, g)).toBe(true);
    expect(Object.keys(o.wear).sort()).toEqual(["coat", "pants"]);
    for (const [k, id] of Object.entries(o.wear)) {
      const it = byId(id!);
      expect(it.k).toBe(k);
      expect(it.r).toBeTruthy();
      expect(fits(it.g, g)).toBe(true);
    }
  });
  it("男女預設照拍板的 id；每次拿到的都是新物件", () => {
    expect(defaultOutfit(0)).toEqual({ g: 0, skin: 2000, hair: 30030, face: 20000, wear: { coat: 1040002, pants: 1060002 }, pose: "stand", emo: "default", flip: false });
    expect(defaultOutfit(1)).toEqual({ g: 1, skin: 2000, hair: 31470, face: 21058, wear: { coat: 1041002, pants: 1061002 }, pose: "stand", emo: "default", flip: false });
    expect(defaultOutfit(0).wear).not.toBe(defaultOutfit(0).wear);
  });
  it("動作、表情、髮色、瞳色清單", () => {
    expect(POSES.map((p) => p.label)).toEqual(["站著", "走路", "警戒", "跳", "趴下", "坐下"]);
    expect(POSES.map((p) => p.key)).toEqual(["stand", "walk", "alert", "jump", "prone", "sit"]);
    expect(EMOS.map((e) => e.label)).toEqual(["一般", "微笑", "眨眼", "生氣", "哭", "困擾", "驚訝", "愛心"]);
    expect(EMOS.map((e) => e.key)).toEqual(["default", "smile", "wink", "angry", "cry", "troubled", "bewildered", "love"]);
    expect(HAIR_COLORS.map((c) => c.n)).toEqual(["黑色", "紅色", "橘色", "黃色", "綠色", "藍色", "紫色", "棕色"]);
    expect(EYE_COLORS.map((c) => c.n)).toEqual(["黑色", "藍色", "紅色", "綠色", "褐色", "藍綠色", "紫色", "亮紫色"]);
    for (const c of [...HAIR_COLORS, ...EYE_COLORS]) expect(c.css).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("畫得出來", () => {
  it("髮型看顏色碼（個位數），臉型看百位數", () => {
    expect(hairDrawable(data, 30030)).toBe(true);
    expect(hairDrawable(data, 30038)).toBe(false); // 沒有 8 號色
    expect(hairDrawable(data, 99999)).toBe(false);
    expect(hairDrawable(data, 30030.5)).toBe(false);
    expect(faceDrawable(data, 20000)).toBe(true);
    expect(faceDrawable(data, 20300)).toBe(true); // 3 號瞳色
    expect(faceDrawable(data, 20800)).toBe(false);
    expect(faceDrawable(data, 12345)).toBe(false);
  });
  it("hairStyle／faceStyle 回那一款（名字不帶顏色），顏色碼另外拆", () => {
    expect(hairStyle(data, 30035)?.id).toBe(30030);
    expect(hairColour(30035)).toBe(5);
    expect(hairStyle(data, 30038)).toBeUndefined();
    expect(faceStyle(data, 20300)?.id).toBe(20000);
    expect(eyeColour(20300)).toBe(3);
    expect(faceStyle(data, 20800)).toBeUndefined();
  });
  it("只有日服畫得出來的顏色也算", () => {
    const h = data.hair.find((s) => s.t.length === 0 && s.j.length > 0)!;
    expect(hairDrawable(data, h.id + h.j[0])).toBe(true);
    const f = data.face.find((s) => s.t.length === 0 && s.j.length > 0)!;
    expect(faceDrawable(data, f.id + f.j[0] * 100)).toBe(true);
  });
});

describe("網址", () => {
  it("全預設時網址是空的，來回一致", () => {
    expect(outfitQuery(defaultOutfit(0))).toBe("");
    expect(outfitQuery(defaultOutfit(1))).toBe("g=1");
    const o = { ...defaultOutfit(1), wear: { ...defaultOutfit(1).wear, cap: CAP_F }, pose: "walk" as const, flip: true };
    expect(parseOutfit(new URLSearchParams(outfitQuery(o)), data)).toEqual(o);
  });
  it("只寫跟預設不一樣的欄位，順序 g,s,h,f,w,p,e,x", () => {
    const o = { ...defaultOutfit(1), skin: 2001, hair: 31471, face: FACE_F + 100, wear: { cap: CAP_F, coat: 1041002 }, pose: "sit" as const, emo: "love" as const, flip: true };
    expect(outfitQuery(o)).toBe(`g=1&s=2001&h=31471&f=${FACE_F + 100}&w=${CAP_F}.1041002&p=sit&e=love&x=1`);
    expect(outfitQuery({ ...defaultOutfit(0), emo: "wink" })).toBe("e=wink");
  });
  it("壞網址不壞頁：亂字、不存在、畫不出來、性別不符都換回預設；w 有寫就只穿認得的", () => {
    const o = parseOutfit(new URLSearchParams("g=9&s=abc&h=99999&f=-1&w=1.2.x." + UNDRAWABLE + "." + FEMALE_OVERALL + "&p=fly&e=lol&x=2"), data);
    expect(o).toEqual({ ...defaultOutfit(0), wear: {} });
    expect(parseOutfit(new URLSearchParams("w="), data).wear).toEqual({});
    expect(outfitQuery({ ...defaultOutfit(0), wear: {} })).toBe("w=");
  });
  it("沒寫 w 就是預設衣服；髮型臉型要合性別、畫得出來；膚色要在資料裡", () => {
    expect(parseOutfit(new URLSearchParams(""), data)).toEqual(defaultOutfit(0));
    expect(parseOutfit(new URLSearchParams("g=1"), data)).toEqual(defaultOutfit(1));
    const femaleHair = data.hair.find((h) => h.g === 1)!.id;
    expect(parseOutfit(new URLSearchParams("h=" + femaleHair), data).hair).toBe(30030); // 男生不能用女生髮型
    expect(parseOutfit(new URLSearchParams("g=1&h=" + femaleHair), data).hair).toBe(femaleHair);
    expect(parseOutfit(new URLSearchParams("h=30038&f=20800"), data)).toMatchObject({ hair: 30030, face: 20000 });
    expect(parseOutfit(new URLSearchParams("s=2004"), data).skin).toBe(2004);
    expect(parseOutfit(new URLSearchParams("s=2005"), data).skin).toBe(2000);
  });
  it("w 的道具照順序穿，後穿的蓋掉衝突的", () => {
    expect(parseOutfit(new URLSearchParams(`w=${MALE_OVERALL}.1040002`), data).wear).toEqual({ coat: 1040002 });
    expect(parseOutfit(new URLSearchParams(`w=1092000.${TWO_HANDED}`), data).wear).toEqual({ weapon: TWO_HANDED });
  });
  it("try：髮型換髮型、女生的點裝換女生預設", () => {
    expect(parseOutfit(new URLSearchParams("try=" + RED_HAIR_M), data).hair).toBe(RED_HAIR_M);
    const f = parseOutfit(new URLSearchParams("try=" + FEMALE_OVERALL), data);
    expect(f.g).toBe(1); expect(f.wear.overall).toBe(FEMALE_OVERALL); expect(f.wear.coat).toBeUndefined();
  });
  it("try：臉型、男生的道具、男女都能穿的看 g、畫不出來或亂字就當沒這回事", () => {
    const f = parseOutfit(new URLSearchParams("try=" + (FACE_F + 100)), data);
    expect(f).toEqual({ ...defaultOutfit(1), face: FACE_F + 100 });
    expect(parseOutfit(new URLSearchParams("try=" + MALE_OVERALL), data)).toEqual({ ...defaultOutfit(0), wear: { overall: MALE_OVERALL } });
    expect(parseOutfit(new URLSearchParams("try=" + UNISEX_CAP), data).g).toBe(0);
    expect(parseOutfit(new URLSearchParams("g=1&try=" + UNISEX_CAP), data)).toEqual({ ...defaultOutfit(1), wear: { ...defaultOutfit(1).wear, cap: UNISEX_CAP } });
    expect(parseOutfit(new URLSearchParams("try=" + UNDRAWABLE), data)).toEqual(defaultOutfit(0));
    expect(parseOutfit(new URLSearchParams("try=abc&p=jump"), data)).toEqual({ ...defaultOutfit(0), pose: "jump" });
  });
});

describe("穿脫", () => {
  it("套服跟上衣褲裙互斥、雙手武器跟盾牌互斥", () => {
    const withOverall = wearItem(defaultOutfit(0), byId(MALE_OVERALL), data);
    expect(withOverall.wear).toEqual({ overall: MALE_OVERALL });
    expect(wearItem(withOverall, byId(1040002), data).wear).toEqual({ coat: 1040002 });
    const shield = wearItem(defaultOutfit(0), byId(1092000), data);
    expect(wearItem(shield, byId(TWO_HANDED), data).wear.shield).toBeUndefined();
    expect(wearItem(wearItem(defaultOutfit(0), byId(TWO_HANDED), data), byId(1092000), data).wear.weapon).toBeUndefined();
  });
  it("不靠呼叫順序：全新的資料副本（沒先跑過 itemIndex／parseOutfit）也判得出雙手武器", () => {
    const fresh = JSON.parse(JSON.stringify(data)) as AvatarData;
    const twoHanded = fresh.items.find((i) => i.id === TWO_HANDED)!;
    const shield = fresh.items.find((i) => i.id === 1092000)!;
    expect(wearItem(wearItem(defaultOutfit(0), twoHanded, fresh), shield, fresh).wear.weapon).toBeUndefined();
  });
  it("雙手與否看傳進去的資料，不是全域記憶：副本裡把某把單手武器改成雙手，穿盾牌就會脫掉它", () => {
    const fresh = JSON.parse(JSON.stringify(data)) as AvatarData;
    const one = fresh.items.find((i) => i.k === "weapon" && !i.h && i.r && i.g !== 1)!;
    const shield = fresh.items.find((i) => i.id === 1092000)!;
    const holding = wearItem(wearItem(defaultOutfit(0), one, fresh), shield, fresh);
    expect(holding.wear).toMatchObject({ weapon: one.id, shield: 1092000 }); // 原資料：單手可以拿盾
    one.h = 1;
    expect(wearItem(wearItem(defaultOutfit(0), one, fresh), shield, fresh).wear.weapon).toBeUndefined();
    const before = wearItem(defaultOutfit(0), one, data); // 原資料那把還是單手：不受副本影響
    expect(wearItem(before, byId(1092000), data).wear.weapon).toBe(one.id);
  });
  it("同一格換件；不改到原本的物件", () => {
    const o = defaultOutfit(0);
    const before = JSON.stringify(o);
    const n = wearItem(o, byId(UNISEX_CAP), data);
    expect(n.wear).toEqual({ ...o.wear, cap: UNISEX_CAP });
    expect(JSON.stringify(o)).toBe(before);
    const one = data.items.find((i) => i.k === "weapon" && !i.h && i.r && i.g !== 1)!;
    const holding = wearItem(wearItem(o, byId(1092000), data), one, data);
    expect(holding.wear.shield).toBe(1092000); // 單手武器跟盾牌可以一起
  });
  it("脫下", () => {
    const o = defaultOutfit(0);
    const t = takeOff(o, "coat");
    expect(t.wear).toEqual({ pants: 1060002 });
    expect(o.wear.coat).toBe(1040002);
    expect(takeOff(t, "cap")).toEqual(t);
  });
});

describe("規則順手脫掉了哪幾格（removedSlots，挑衣服卡的提示用）", () => {
  const changed = (o: Outfit, id: number) => removedSlots(o.wear, wearItem(o, byId(id), data).wear, byId(id).k);
  it("穿盾牌脫雙手武器、穿雙手武器脫盾牌、穿套服脫上衣褲裙、穿上衣或褲裙脫套服", () => {
    const base = defaultOutfit(0);
    expect(changed(wearItem(base, byId(TWO_HANDED), data), 1092000)).toEqual(["weapon"]);
    expect(changed(wearItem(base, byId(1092000), data), TWO_HANDED)).toEqual(["shield"]);
    expect(changed(base, MALE_OVERALL)).toEqual(["coat", "pants"]); // 順序照網址 w：上衣在褲裙前
    const inOverall = wearItem(base, byId(MALE_OVERALL), data);
    expect(changed(inOverall, MALE_COAT)).toEqual(["overall"]);
    expect(changed(inOverall, UNISEX_PANTS)).toEqual(["overall"]);
  });
  it("同一格換件、穿到空格、單手武器配盾牌、脫下自己那格：沒有別格被脫", () => {
    const base = defaultOutfit(0);
    expect(changed(base, UNISEX_COAT)).toEqual([]);
    expect(changed(base, UNISEX_CAP)).toEqual([]);
    const one = data.items.find((i) => i.k === "weapon" && !i.h && i.r && i.g !== 1)!;
    expect(changed(wearItem(base, byId(1092000), data), one.id)).toEqual([]);
    expect(removedSlots(base.wear, takeOff(base, "coat").wear, "coat")).toEqual([]);
    // 穿套服時身上本來就沒有上衣褲裙：沒東西被脫
    expect(changed({ ...base, wear: {} }, MALE_OVERALL)).toEqual([]);
  });
});

describe("換性別", () => {
  it("穿不了的換掉、男女都能穿的留著、身上沒衣服就穿新性別預設上衣褲裙", () => {
    const o = setGender({ ...defaultOutfit(0), wear: { overall: MALE_OVERALL, cap: UNISEX_CAP } }, 1, data);
    expect(o.wear).toEqual({ cap: UNISEX_CAP, coat: 1041002, pants: 1061002 }); expect(o.hair).toBe(31470); expect(o.face).toBe(21058);
    expect(setGender(defaultOutfit(0), 1, data)).toEqual(defaultOutfit(1));
  });
  it("膚色、動作、表情、翻面不動；脫光的人換性別會穿上新性別的衣服；同性別原樣回傳", () => {
    const o = { ...defaultOutfit(1), skin: 2004, pose: "sit" as const, emo: "cry" as const, flip: true, wear: {} };
    const m = setGender(o, 0, data);
    expect(m).toEqual({ ...defaultOutfit(0), skin: 2004, pose: "sit", emo: "cry", flip: true });
    expect(setGender(m, 0, data)).toBe(m);
  });
  it("哪件穿不了就補哪件預設：男上衣＋共用褲換女生，只換上衣、褲子留著", () => {
    const o = setGender({ ...defaultOutfit(0), wear: { coat: MALE_COAT, pants: UNISEX_PANTS } }, 1, data);
    expect(o.wear).toEqual({ coat: 1041002, pants: UNISEX_PANTS });
  });
  it("哪件穿不了就補哪件預設：女褲＋共用上衣換男生，只換褲子、上衣留著", () => {
    const o = setGender({ ...defaultOutfit(1), wear: { coat: UNISEX_COAT, pants: FEMALE_PANTS } }, 0, data);
    expect(o.wear).toEqual({ coat: UNISEX_COAT, pants: 1060002 });
  });
  it("其他穿不了的格子（帽子、鞋子…）不補；上衣褲子都穿得了就原樣", () => {
    const female = data.items.find((i) => i.k === "shoes" && i.g === 1 && i.r)!.id;
    const o = setGender({ ...defaultOutfit(1), wear: { coat: UNISEX_COAT, pants: UNISEX_PANTS, cap: CAP_F, shoes: female } }, 0, data);
    expect(o.wear).toEqual({ coat: UNISEX_COAT, pants: UNISEX_PANTS });
  });
  it("套服穿不了就上衣＋褲裙都補；共用套服留著就不補", () => {
    const unisexOverall = data.items.find((i) => i.k === "overall" && i.g === 2 && i.r)!.id;
    expect(setGender({ ...defaultOutfit(1), wear: { overall: FEMALE_OVERALL } }, 0, data).wear).toEqual({ coat: 1040002, pants: 1060002 });
    expect(setGender({ ...defaultOutfit(1), wear: { overall: unisexOverall } }, 0, data).wear).toEqual({ overall: unisexOverall });
  });
  it("男女都能用的髮型、臉型換性別時留著（顏色也留）", () => {
    const hs = data.hair.find((h) => h.g === 2 && h.j.includes(3))!;
    expect(setGender({ ...defaultOutfit(0), hair: hs.id + 3 }, 1, data).hair).toBe(hs.id + 3);
    const fs = data.face.find((f) => f.g === 2 && f.j.includes(2))!;
    expect(setGender({ ...defaultOutfit(0), face: fs.id + 200 }, 1, data).face).toBe(fs.id + 200);
  });
});

describe("網址往返、try 正式化、惡意參數（整條分支審查的探針收進來）", () => {
  /** 固定種子的亂數（mulberry32，同 random.test.ts）：每次跑出來都一樣 */
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
  const parse = (q: string) => parseOutfit(new URLSearchParams(q), data);
  /** 解出來的東西寫回網址再解一次要一模一樣（網址是穩定的） */
  const canonical = (o: Outfit) => expect(parse(outfitQuery(o)), outfitQuery(o)).toEqual(o);

  it("隨機穿搭 × 6 動作 × 8 表情 × 翻面 × 男女（各 2 套，共 384 套）：outfitQuery → parseOutfit 原樣回來", () => {
    const rng = mulberry32(20261103);
    let n = 0;
    for (const g of [0, 1] as const)
      for (const p of POSES)
        for (const e of EMOS)
          for (const flip of [false, true])
            for (let k = 0; k < 2; k++) {
              const o = randomOutfit(data, { ...defaultOutfit(g), pose: p.key, emo: e.key, flip }, rng);
              expect(o).toMatchObject({ g, pose: p.key, emo: e.key, flip });
              canonical(o);
              n += 1;
            }
    expect(n).toBe(384);
  });

  it("每個有「穿上看看」的 id，g=0、g=1 各一次：try= 解出來的寫回網址（不帶 try）再解一次一模一樣", () => {
    const raw = JSON.parse(readFileSync(join(process.cwd(), "public/data/items.json"), "utf8"));
    const items: Item[] = Array.isArray(raw) ? raw : raw.items;
    const linked = items.filter((i) => avatarLink(i, data));
    expect(linked.length).toBeGreaterThan(1000);
    for (const it of linked)
      for (const g of [0, 1]) {
        const o = parse(`g=${g}&try=${it.id}`);
        const q = outfitQuery(o);
        expect(q).not.toContain("try");
        expect(parse(q), `${it.n}（${it.id}）g=${g}`).toEqual(o);
      }
  });

  it("惡意參數不丟錯、壞的那項退回預設，結果一樣能穩定寫回網址", () => {
    const d0 = defaultOutfit(0);
    const huge = "9".repeat(400); // Number() 變 Infinity
    const cases: [string, Outfit][] = [
      ["h=1e5&f=2e4&s=2.001e3", d0], // 科學記號、小數點都不是純數字
      ["h=0x7531&f=-20000&s=+2001", d0],
      ["h=３００３１", d0], // 全形數字
      [`h=${huge}&f=${huge}&s=${huge}&try=${huge}`, d0],
      [`h=${Number.MAX_SAFE_INTEGER + 2}&w=${Number.MAX_SAFE_INTEGER + 2}`, { ...d0, wear: {} }],
      ["p=__proto__&e=constructor", d0],
      ["p=toString&e=hasOwnProperty&x=true", d0],
      ["w=__proto__.constructor.prototype", { ...d0, wear: {} }],
      ["w=" + Array.from({ length: 5000 }, (_, i) => (i % 3 === 0 ? "x" : i % 3 === 1 ? huge : "")).join("."), { ...d0, wear: {} }],
      ["w=" + Array(5000).fill("1040002").join("."), { ...d0, wear: { coat: 1040002 } }],
      // 5000 段套服、上衣輪流穿：後穿的蓋掉前面的，最後一段是上衣
      ["w=" + Array.from({ length: 5000 }, (_, i) => (i % 2 ? 1040002 : MALE_OVERALL)).join("."), { ...d0, wear: { coat: 1040002 } }],
      // 前面補 0：照數字認，寫回網址就沒有 0 了
      [`h=0${RED_HAIR_M}&s=02001&w=01040002.001060002`, { ...d0, hair: RED_HAIR_M, skin: 2001 }],
      ["g=01&x=01", d0], // g、x 只認剛好是 1
      // 同一個參數寫兩次：照 URLSearchParams.get，認第一個
      [`p=walk&p=sit&h=${RED_HAIR_M}&h=99999`, { ...d0, pose: "walk", hair: RED_HAIR_M }],
      ["w=1040002&w=", { ...d0, wear: { coat: 1040002 } }],
      ["g=1&g=0", defaultOutfit(1)],
      [`try=${MALE_OVERALL}&try=${UNISEX_CAP}`, { ...d0, wear: { overall: MALE_OVERALL } }],
    ];
    for (const [q, want] of cases) {
      let o: Outfit | undefined;
      expect(() => (o = parse(q)), q.slice(0, 80)).not.toThrow();
      expect(o, q.slice(0, 80)).toEqual(want);
      canonical(o!);
    }
    expect(outfitQuery(parse(`h=0${RED_HAIR_M}`))).toBe(`h=${RED_HAIR_M}`);
  });
});
