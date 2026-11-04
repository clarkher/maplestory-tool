import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GET } from "@/app/api/avatar/share/route";
import robots from "@/app/robots";
import { EMOS, POSES, defaultOutfit, itemIndex, parseOutfit, wearItem } from "@/lib/avatar/outfit";
import type { Outfit } from "@/lib/avatar/outfit";
import { randomOutfit } from "@/lib/avatar/random";
import { MSIO, characterUrl } from "@/lib/avatar/render";
import { readShare, shareHtml, shareQuery } from "@/lib/avatar/share";
import type { AvatarData } from "@/lib/avatar/types";

const data = JSON.parse(readFileSync(join(process.cwd(), "public/data/avatar.json"), "utf8")) as AvatarData;

type Part = { itemId: number; region: string; version: string; animationName?: string };
/** 把網址的道具那段（第 6 段）解回陣列 */
const partsOf = (u: string): Part[] => JSON.parse("[" + decodeURIComponent(u.split("/")[5]) + "]");
const read = (q: string) => readShare(new URLSearchParams(q));

/** 固定種子的亂數（mulberry32），測試每次抽到同一批穿搭 */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 一批隨機穿搭：男女都有、六種動作輪流、表情翻面混著 */
function outfits(n: number, seed = 20261104): Outfit[] {
  const rng = seeded(seed);
  return Array.from({ length: n }, (_, i) => {
    const base: Outfit = { ...defaultOutfit((i % 2) as 0 | 1), pose: POSES[i % POSES.length].key, emo: EMOS[i % EMOS.length].key, flip: i % 3 === 0 };
    return randomOutfit(data, base, rng);
  });
}

/** 隨便挑一件某格、日服才畫得出來的道具 */
const jItem = (k: string, g: 0 | 1 = 0) => data.items.find((i) => i.k === k && i.r === "j" && (i.g === g || i.g === 2))!;

/** page 只准出現我們自己寫的字：路徑、鍵、數字、點、等號、&、? */
const PAGE_OK = /^\/plan\/avatar(\?[a-z0-9=&.]+)?$/;
/** image 只准是 maplestory.io 的角色圖，道具陣列部分全被編成 %xx */
const IMAGE_OK = /^https:\/\/maplestory\.io\/api\/character\/[A-Za-z0-9%]+\/(stand[12]|walk[12]|alert|jump|prone|sit)\/0\?resize=6&renderMode=0&flipX=(true|false)$/;

describe("shareQuery／readShare 來回", () => {
  it("shareQuery 給 readShare，page 開起來穿搭一樣", () => {
    const o = { ...defaultOutfit(1), skin: 2001, pose: "walk", emo: "smile", flip: true } as Outfit;
    const { page } = readShare(new URLSearchParams(shareQuery(o, data)));
    const back = parseOutfit(new URL(page, "https://x").searchParams, data);
    expect(back).toEqual(o);
  });

  it("一批隨機穿搭（男女、六種動作、日服的髮型臉型裝備都有）：page 開起來穿搭一樣", () => {
    for (const o of outfits(400)) {
      const { page } = read(shareQuery(o, data));
      expect(parseOutfit(new URL(page, "https://x").searchParams, data)).toEqual(o);
    }
  });

  it("一批隨機穿搭：route 沒有資料檔畫出來的圖，跟頁面（characterUrl 第 0 格、6 倍）一字不差", () => {
    const seen = { jHair: 0, jFace: 0, jItem: 0, spear: 0, female: 0, emo: 0, flip: 0 };
    const items = itemIndex(data);
    const poses = new Set<string>();
    for (const o of outfits(400)) {
      const { image } = read(shareQuery(o, data));
      expect(image).toBe(characterUrl(o, data, { frame: 0, resize: 6 }));
      const parts = partsOf(image!);
      if (parts.find((p) => p.itemId === o.hair)?.region === "JMS") seen.jHair++;
      if (parts.find((p) => p.itemId === o.face)?.region === "JMS") seen.jFace++;
      if (parts.some((p) => p.region === "JMS" && items.has(p.itemId))) seen.jItem++;
      if (image!.includes("/stand2/") || image!.includes("/walk2/")) seen.spear++;
      if (o.g === 1) seen.female++;
      if (o.emo !== "default") seen.emo++;
      if (o.flip) seen.flip++;
      poses.add(o.pose);
    }
    // 樣本真的涵蓋到難的情況，上面那條才算數
    for (const [what, n] of Object.entries(seen)) expect(n, what).toBeGreaterThan(0);
    expect(poses.size).toBe(POSES.length);
  });

  it("沒穿衣服（w 是空的）也來回，圖是光身子", () => {
    const o = { ...defaultOutfit(0), wear: {} } as Outfit;
    const q = shareQuery(o, data);
    expect(q).toBe("s=2000&h=30030&f=20000&w=");
    const { page, image } = read(q);
    expect(page).toBe("/plan/avatar?s=2000&h=30030&f=20000&w=");
    expect(parseOutfit(new URL(page, "https://x").searchParams, data)).toEqual(o);
    expect(image).toBe(characterUrl(o, data, { frame: 0, resize: 6 }));
    expect(partsOf(image!).map((p) => p.itemId)).toEqual([2000, 12000, 30030, 20000]);
  });

  it("資料裡沒有、畫不出來的道具不寫進 w（跟 characterUrl 一樣不放，免得整張圖 404）", () => {
    const undrawable = data.items.find((i) => !i.r && i.g !== 1)!;
    const o = { ...defaultOutfit(0), wear: { ...defaultOutfit(0).wear, shoes: undrawable.id, glove: 9999999 } } as Outfit;
    const q = shareQuery(o, data);
    expect(q).not.toContain(String(undrawable.id));
    expect(q).not.toContain("9999999");
    expect(read(q).image).toBe(characterUrl(o, data, { frame: 0, resize: 6 }));
  });
});

describe("shareQuery 寫什麼", () => {
  it("順序 g,s,h,f,w,p,e,x,j；男生不寫 g，動作表情翻面是預設就不寫", () => {
    expect(shareQuery(defaultOutfit(0), data)).toBe("s=2000&h=30030&f=20000&w=1040002.1060002");
    const o = { ...defaultOutfit(1), pose: "sit", emo: "love", flip: true } as Outfit;
    expect(shareQuery(o, data)).toBe("g=1&s=2000&h=31470&f=21058&w=1041002.1061002&p=sit&e=love&x=1");
  });

  it("日服髮型顏色、日服臉型瞳色、日服裝備的 id 都進 j（用「.」接）；全是台服就不寫 j", () => {
    const hs = data.hair.find((h) => h.g !== 1 && h.j.some((c) => !h.t.includes(c)))!;
    const hairJ = hs.id + hs.j.find((c) => !hs.t.includes(c))!;
    const fs = data.face.find((f) => f.g !== 1 && f.t.length === 0 && f.j.length > 0)!;
    const faceJ = fs.id + fs.j[0] * 100;
    const cap = jItem("cap");
    const o = wearItem({ ...defaultOutfit(0), hair: hairJ, face: faceJ }, cap, data);
    const j = new URLSearchParams(shareQuery(o, data)).get("j")!;
    expect(j.split(".").map(Number).sort()).toEqual([hairJ, faceJ, cap.id].sort());
    expect(new URLSearchParams(shareQuery(defaultOutfit(0), data)).has("j")).toBe(false);
  });
});

describe("readShare 的圖", () => {
  it("每件照 j 分台服日服、膚色兩件、resize=6、renderMode=0、flipX、stand2（拿槍）、表情放臉型", () => {
    const hs = data.hair.find((h) => h.g !== 1 && h.j.some((c) => !h.t.includes(c)))!;
    const hairJ = hs.id + hs.j.find((c) => !hs.t.includes(c))!;
    const spear = data.items.find((i) => i.k === "weapon" && i.r === "t" && i.g !== 1 && Math.floor(i.id / 10000) === 144)!;
    const cap = jItem("cap");
    let o = { ...defaultOutfit(0), skin: 2003, hair: hairJ, emo: "wink", flip: true } as Outfit;
    o = wearItem(wearItem(o, spear, data), cap, data);
    const { image } = read(shareQuery(o, data));
    expect(image).toBe(characterUrl(o, data, { frame: 0, resize: 6 }));
    expect(image!.endsWith("/stand2/0?resize=6&renderMode=0&flipX=true")).toBe(true);
    const parts = partsOf(image!);
    expect(parts.slice(0, 2)).toEqual([
      { itemId: 2003, region: "TWMS", version: "256" },
      { itemId: 12003, region: "TWMS", version: "256" },
    ]);
    expect(parts.find((p) => p.itemId === hairJ)).toMatchObject({ region: "JMS", version: "444" });
    expect(parts.find((p) => p.itemId === cap.id)).toMatchObject({ region: "JMS", version: "444" });
    expect(parts.find((p) => p.itemId === spear.id)).toMatchObject({ region: "TWMS", version: "256" });
    expect(parts.find((p) => p.itemId === 20000)).toMatchObject({ region: "TWMS", animationName: "wink" });
    // 表情只放臉型那一件
    expect(parts.filter((p) => p.animationName).length).toBe(1);
  });

  it("其他武器、跳躍等動作的 stance 跟頁面一樣", () => {
    expect(read("s=2000&h=30030&f=20000&w=1402000&p=walk").image).toContain("/walk1/0?");
    expect(read("s=2000&h=30030&f=20000&w=1432000&p=walk").image).toContain("/walk2/0?");
    expect(read("s=2000&h=30030&f=20000&w=1432000&p=jump").image).toContain("/jump/0?");
    expect(read("s=2000&h=30030&f=20000&w=1040002").image).toContain("/stand1/0?");
  });

  it("image 一律 https://maplestory.io/api/character/ 開頭（不接受外部網址）", () => {
    for (const q of [
      "s=2000&h=30030&f=20000&w=1040002",
      "s=2000&h=30030&f=20000&image=https://evil.example/x.png&og=https://evil.example",
      "s=2000&h=30030&f=20000&w=1040002&p=https://evil.example",
      "s=https://evil.example&h=30030&f=20000",
    ]) {
      const { image, page } = read(q);
      if (image) {
        expect(image.startsWith(MSIO + "/")).toBe(true);
        expect(image.startsWith("https://maplestory.io/api/character/")).toBe(true);
        expect(image).toMatch(IMAGE_OK);
      }
      expect(page).not.toContain("evil");
    }
  });

  it("沒寫 w 當預設衣服（跟頁面開起來一樣），不是光身子", () => {
    const { image, page } = read("g=1&s=2000&h=31470&f=21058");
    expect(page).not.toContain("w=");
    expect(partsOf(image!).map((p) => p.itemId)).toEqual([2000, 12000, 31470, 21058, 1041002, 1061002]);
    expect(image).toBe(characterUrl(defaultOutfit(1), data, { frame: 0, resize: 6 }));
  });
});

describe("readShare 的 page", () => {
  it("page 不含 j；穿搭參數照我們的順序重寫", () => {
    const cap = jItem("cap");
    const o = wearItem(defaultOutfit(0), cap, data);
    const q = shareQuery({ ...o, pose: "alert" }, data);
    expect(q).toContain("&j=");
    const { page } = read(q);
    expect(page.startsWith("/plan/avatar?s=2000&h=30030&f=20000&w=")).toBe(true);
    expect(page.endsWith("&p=alert")).toBe(true);
    expect(page).not.toMatch(/[?&]j=/);
  });

  it("缺 s、h、f 其中一個：image 是 null，page 回 /plan/avatar 有什麼帶什麼（沒有 j）", () => {
    for (const miss of ["s", "h", "f"]) {
      const params = new URLSearchParams({ s: "2000", h: "30030", f: "20000", w: "1040002", j: "1.2", p: "walk" });
      params.delete(miss);
      const { image, page } = readShare(params);
      expect(image, miss).toBeNull();
      expect(page.startsWith("/plan/avatar?"), miss).toBe(true);
      expect(page, miss).not.toContain(`${miss}=`);
      expect(page, miss).not.toMatch(/[?&]j=/);
      expect(page, miss).toContain("p=walk");
    }
    expect(read("")).toEqual({ page: "/plan/avatar", image: null });
  });
});

describe("壞值丟掉", () => {
  it("w=1.<script>.2 只留 1、2（逐個丟，不是整串丟）", () => {
    const { page, image } = read("s=2000&h=30030&f=20000&w=1.%3Cscript%3E.2");
    expect(page).toContain("&w=1.2");
    expect(partsOf(image!).map((p) => p.itemId).slice(4)).toEqual([1, 2]);
    expect(page + image).not.toMatch(/script|<|>/);
  });

  it("h=abc 當缺 h → image null；數字超過 8 位也是壞的", () => {
    expect(read("s=2000&h=abc&f=20000").image).toBeNull();
    expect(read("s=2000&h=abc&f=20000").page).not.toContain("h=");
    expect(read("s=2000&h=123456789&f=20000").image).toBeNull();
    expect(read("s=2000&h=12345678&f=20000").image).not.toBeNull();
    expect(read("s=-1&h=30030&f=20000").image).toBeNull();
    expect(read("s=1.5&h=30030&f=20000").image).toBeNull();
    expect(read("s=&h=30030&f=20000").image).toBeNull();
  });

  it("全形數字、尾巴帶換行（%0A）都是壞值：單一欄位當缺，w、j 裡的逐個丟", () => {
    const FULL = "%EF%BC%92%EF%BC%90%EF%BC%90%EF%BC%90"; // 全形的 2000
    expect(read(`s=${FULL}&h=30030&f=20000`).image).toBeNull();
    expect(read(`s=${FULL}&h=30030&f=20000`).page).toBe("/plan/avatar?h=30030&f=20000");
    expect(read("s=2000%0A&h=30030&f=20000").image).toBeNull();
    expect(read("s=2000&h=30030%0A&f=20000").page).toBe("/plan/avatar?s=2000&f=20000");
    const { page, image } = read(`s=2000&h=30030&f=20000&w=1040002%0A.${FULL}.1060002&j=1060002%0A.${FULL}`);
    expect(page).toBe("/plan/avatar?s=2000&h=30030&f=20000&w=1060002");
    expect(partsOf(image!).slice(4)).toEqual([{ itemId: 1060002, region: "TWMS", version: "256" }]);
  });

  it("j=1&j=<x> 不出現在任何輸出；j 裡的壞值逐個丟", () => {
    const out = read("s=2000&h=30030&f=20000&w=1040002&j=1&j=%3Cx%3E");
    expect(JSON.stringify(out)).not.toMatch(/<|>|%3C|%3c/);
    const j = read("s=2000&h=30030&f=20000&w=1040002&j=1040002.%3Cx%3E.abc");
    // 1040002 在 j 裡 → 這件用日服畫
    expect(partsOf(j.image!).find((p) => p.itemId === 1040002)).toMatchObject({ region: "JMS", version: "444" });
    expect(JSON.stringify(j)).not.toMatch(/<|>|abc/);
  });

  it("w 超過 12 件只取前 12 件（先丟壞的再數）", () => {
    const many = Array.from({ length: 30 }, (_, i) => 1000000 + i);
    const { image, page } = read(`s=2000&h=30030&f=20000&w=${many.join(".")}`);
    expect(partsOf(image!).map((p) => p.itemId).slice(4)).toEqual(many.slice(0, 12));
    expect(page).toContain(`w=${many.slice(0, 12).join(".")}`);
    expect(page).not.toContain(String(many[12]));
    const mixed = read(`s=2000&h=30030&f=20000&w=${Array.from({ length: 20 }, (_, i) => (i % 2 ? "x" : String(2000000 + i))).join(".")}`);
    expect(partsOf(mixed.image!).length).toBe(4 + 10);
    const filtered = read(`s=2000&h=30030&f=20000&w=${Array.from({ length: 40 }, (_, i) => (i < 20 ? "x" : String(3000000 + i))).join(".")}`);
    expect(partsOf(filtered.image!).length).toBe(4 + 12);
  });

  it("p、e 不認得就不帶；g 只認 1", () => {
    const { page, image } = read("g=2&s=2000&h=30030&f=20000&w=1040002&p=fly&e=<b>&x=2");
    expect(page).toBe("/plan/avatar?s=2000&h=30030&f=20000&w=1040002");
    expect(image).toContain("/stand1/0?");
    expect(image).toContain("flipX=false");
    expect(partsOf(image!).some((p) => p.animationName)).toBe(false);
    expect(read("g=1&s=2000&h=30030&f=20000&w=").page.startsWith("/plan/avatar?g=1&")).toBe(true);
    expect(read("g=01&s=2000&h=30030&f=20000&w=").page.startsWith("/plan/avatar?s=")).toBe(true);
    // 物件原型上的名字不能被當成認得的動作
    expect(read("s=2000&h=30030&f=20000&p=constructor&e=__proto__").page).toBe("/plan/avatar?s=2000&h=30030&f=20000");
    // 預設值（站著、一般）不用寫
    expect(read("s=2000&h=30030&f=20000&w=1040002&p=stand&e=default").page).toBe("/plan/avatar?s=2000&h=30030&f=20000&w=1040002");
  });

  it("重複的參數取第一個；超長字串、空字串、各種注入字串都只剩我們自己寫的字", () => {
    expect(read("s=2000&s=2001&h=30030&f=20000").page).toContain("s=2000");
    expect(read("s=%3Cx%3E&s=2001&h=30030&f=20000").image).toBeNull();
    const long = "9".repeat(100_000);
    const attacks = [
      "",
      "s=2000&h=30030&f=20000&w=%3Cscript%3Ealert(1)%3C/script%3E",
      `s=${long}&h=30030&f=20000`,
      `s=2000&h=30030&f=20000&w=${"1.".repeat(50_000)}&j=${"2.".repeat(50_000)}`,
      `s=2000&h=30030&f=20000&w=${long}`,
      "s=2000&h=30030&f=20000&w=%22%3E%3Cimg%20src=x%20onerror=alert(1)%3E",
      "s=2000&h=30030&f=20000&w=1&p=%22%3E%3Cscript%3E&e=%22onload=1&x=%3Cb%3E&g=%3C",
      "s=2000&h=30030&f=20000&w=1&amp;h=2&&&==&=&s",
      "s=2000&h=30030&f=20000&j=%00.%0A.%FF&w=%00",
      "s=%E2%80%A8&h=30030&f=20000",
      "__proto__=1&constructor=2&s=2000&h=30030&f=20000",
    ];
    for (const q of attacks) {
      const { page, image } = read(q);
      expect(page, q.slice(0, 40)).toMatch(PAGE_OK);
      if (image) expect(image, q.slice(0, 40)).toMatch(IMAGE_OK);
      const html = image ? shareHtml(page, image) : "";
      expect(html.toLowerCase().match(/<script/g)?.length ?? 0, q.slice(0, 40)).toBe(image ? 1 : 0);
      expect(html).not.toMatch(/alert|onerror|onload/);
    }
  });
});

describe("shareHtml", () => {
  const page = "/plan/avatar?g=1&s=2000&h=31470&f=21058&w=1041002.1061002";
  const image = `${MSIO}/%7B%22itemId%22%3A2000%7D/stand1/0?resize=6&renderMode=0&flipX=false`;
  const html = shareHtml(page, image);

  it("og:title、og:description 逐字、og:site_name、og:image、twitter:card=summary、title", () => {
    expect(html).toContain('<meta property="og:title" content="看看我的紙娃娃">');
    expect(html).toContain('<meta property="og:description" content="楓谷幫手紙娃娃：換髮型、穿點裝，看角色穿起來的樣子">');
    expect(html).toContain('<meta property="og:site_name" content="楓谷幫手">');
    expect(html).toContain(`<meta property="og:image" content="${image.replace(/&/g, "&amp;")}">`);
    expect(html).toContain('<meta name="twitter:card" content="summary">');
    expect(html).toContain("<title>看看我的紙娃娃</title>");
    expect(html).not.toContain("og:url");
  });

  it("人打開馬上轉去穿搭頁：meta refresh 跟 location.replace 都指向 page", () => {
    expect(html).toContain(`<meta http-equiv="refresh" content="0;url=${page.replace(/&/g, "&amp;")}">`);
    expect(html).toContain(`location.replace(${JSON.stringify(page)})`);
  });

  it("& < > \" 都跳脫：屬性裡 &amp; &lt; &gt; &quot;，script 裡 < 變成 \\u003c", () => {
    const bad = shareHtml('/plan/avatar?a=1&b="x"><script>alert(1)</script>', 'https://maplestory.io/x?a=1&b="><img src=x>');
    expect(bad).not.toContain("<img");
    expect(bad).not.toContain('"><script>');
    expect(bad.toLowerCase().match(/<script/g)?.length).toBe(1);
    expect(bad).toContain("a=1&amp;b=&quot;x&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(bad).toContain("a=1&amp;b=&quot;&gt;&lt;img src=x&gt;");
    expect(bad).toContain("\\u003cscript>alert(1)\\u003c/script>");
    expect(bad).not.toContain("</script>alert");
  });
});

describe("route：GET /api/avatar/share", () => {
  const url = (q: string) => `https://maplehelper.tw/api/avatar/share${q ? "?" + q : ""}`;

  it("分享連結回一小頁 HTML：200、text/html、快取一天、noindex、og 文案跟圖", async () => {
    const o = { ...defaultOutfit(1), pose: "walk" } as Outfit;
    const res = await GET(new Request(url(shareQuery(o, data))));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    const body = await res.text();
    expect(body).toContain('content="看看我的紙娃娃"');
    expect(body).toContain('content="楓谷幫手紙娃娃：換髮型、穿點裝，看角色穿起來的樣子"');
    expect(body).toContain(characterUrl(o, data, { frame: 0, resize: 6 }).replace(/&/g, "&amp;"));
    expect(body).toContain("location.replace(" + JSON.stringify(read(shareQuery(o, data)).page) + ")");
  });

  it("缺 h：302 轉到 /plan/avatar（有什麼帶什麼）", async () => {
    const res = await GET(new Request(url("g=1&s=2000&f=21058&w=1041002&j=1")));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://maplehelper.tw/plan/avatar?g=1&s=2000&f=21058&w=1041002");
    expect((await GET(new Request(url("")))).headers.get("location")).toBe("https://maplehelper.tw/plan/avatar");
  });

  it("亂改的連結不會 500、不會多出一個 <script>", async () => {
    const attacks = [
      "s=2000&h=30030&f=20000&w=%3Cscript%3Ealert(1)%3C/script%3E&p=%22%3E",
      `s=2000&h=30030&f=20000&w=${"1.".repeat(20_000)}`,
      "s=%3Cscript%3E&h=%3C&f=%22",
      "%E0%A4%A",
      "w=1&w=2&w=3&s=2000&s=2001&h=30030&f=20000&f=1",
    ];
    for (const q of attacks) {
      const res = await GET(new Request(url(q)));
      expect([200, 302], q.slice(0, 30)).toContain(res.status);
      const body = await res.text();
      expect(body.toLowerCase().match(/<script/g)?.length ?? 0, q.slice(0, 30)).toBe(res.status === 200 ? 1 : 0);
      expect(body).not.toContain("alert(1)");
    }
  });
});

describe("robots：開放分享連結給爬蟲看 og 標籤", () => {
  it("兩條規則都 allow 首頁跟 /api/avatar/share，/api/ 照舊不給爬", () => {
    const rules = robots().rules as { userAgent: string | string[]; allow: string[]; disallow: string }[];
    expect(rules.length).toBe(2);
    for (const r of rules) {
      expect(r.allow).toEqual(["/", "/api/avatar/share"]);
      expect(r.disallow).toBe("/api/");
    }
  });
});
