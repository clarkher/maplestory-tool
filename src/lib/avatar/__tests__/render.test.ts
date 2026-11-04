import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultOutfit, itemIndex, wearItem } from "@/lib/avatar/outfit";
import { FRAMES, MSIO, characterUrl, stanceFor } from "@/lib/avatar/render";
import type { AvatarData, AvatarItem } from "@/lib/avatar/types";

const data = JSON.parse(readFileSync(join(process.cwd(), "public/data/avatar.json"), "utf8")) as AvatarData;

type Part = { itemId: number; region: string; version: string; animationName?: string };
/** 把網址的道具那段（第 6 段）解回陣列 */
const partsOf = (u: string): Part[] => JSON.parse("[" + decodeURIComponent(u.split("/")[5]) + "]");

describe("characterUrl", () => {
  it("預設角色的網址", () => {
    const u = characterUrl(defaultOutfit(0), data, { frame: 0, resize: 2 });
    expect(u.startsWith(MSIO + "/")).toBe(true);
    const items = JSON.parse("[" + decodeURIComponent(u.split("/")[5]) + "]");
    expect(items.map((i: { itemId: number }) => i.itemId).sort()).toEqual([1040002, 1060002, 2000, 12000, 20000, 30030].sort());
    expect(u.endsWith("/stand1/0?resize=2&renderMode=0&flipX=false")).toBe(true);
  });

  it("表情放在臉型、日服道具帶 JMS/444", () => {
    const jms = data.items.find((i) => i.r === "j" && i.g !== 1)!;
    const u = characterUrl({ ...wearItem(defaultOutfit(0), jms, data), emo: "smile" }, data, { frame: 0, resize: 1 });
    const items = JSON.parse("[" + decodeURIComponent(u.split("/")[5]) + "]");
    expect(items.find((i: { itemId: number }) => i.itemId === 20000).animationName).toBe("smile");
    expect(items.find((i: { itemId: number }) => i.itemId === jms.id)).toMatchObject({ region: "JMS", version: "444" });
  });

  it("槍矛用 stand2／walk2，其他 stand1", () => {
    expect(stanceFor("stand", { id: 1432000 } as AvatarItem)).toBe("stand2");
    expect(stanceFor("walk", { id: 1442000 } as AvatarItem)).toBe("walk2");
    expect(stanceFor("stand", { id: 1402000 } as AvatarItem)).toBe("stand1");
    expect(stanceFor("stand", undefined)).toBe("stand1");
    expect(stanceFor("prone", undefined)).toBe("prone");
  });

  it("沒有 emo 時（default）臉型不帶 animationName；台服道具帶 TWMS/256", () => {
    const items = partsOf(characterUrl(defaultOutfit(0), data, { frame: 0, resize: 2 }));
    for (const p of items) {
      expect(p).toMatchObject({ region: "TWMS", version: "256" });
      expect("animationName" in p).toBe(false);
    }
  });

  it("膚色放身體 skin 跟頭 skin+10000 兩件（台服）", () => {
    const u = characterUrl({ ...defaultOutfit(0), skin: 2003 }, data, { frame: 0, resize: 2 });
    const items = partsOf(u);
    expect(items.find((i) => i.itemId === 2003)).toMatchObject({ region: "TWMS", version: "256" });
    expect(items.find((i) => i.itemId === 12003)).toMatchObject({ region: "TWMS", version: "256" });
    expect(items.some((i) => i.itemId === 2000 || i.itemId === 12000)).toBe(false);
  });

  it("髮型臉型的地區看顏色：台服有的顏色走 TWMS，只有日服有的顏色走 JMS", () => {
    const hs = data.hair.find((h) => h.t.length > 0 && h.j.length > 0) ?? data.hair.find((h) => h.j.length > 0)!;
    const jOnlyColour = hs.j.find((c) => !hs.t.includes(c))!;
    const hairJ = hs.id + jOnlyColour;
    let items = partsOf(characterUrl({ ...defaultOutfit(0), hair: hairJ }, data, { frame: 0, resize: 2 }));
    expect(items.find((i) => i.itemId === hairJ)).toMatchObject({ region: "JMS", version: "444" });
    if (hs.t.length > 0) {
      const hairT = hs.id + hs.t[0];
      items = partsOf(characterUrl({ ...defaultOutfit(0), hair: hairT }, data, { frame: 0, resize: 2 }));
      expect(items.find((i) => i.itemId === hairT)).toMatchObject({ region: "TWMS", version: "256" });
    }
    const fs = data.face.find((f) => f.t.length === 0 && f.j.length > 0)!;
    const faceJ = fs.id + fs.j[0] * 100;
    items = partsOf(characterUrl({ ...defaultOutfit(0), face: faceJ, emo: "wink" }, data, { frame: 0, resize: 2 }));
    expect(items.find((i) => i.itemId === faceJ)).toMatchObject({ region: "JMS", version: "444", animationName: "wink" });
  });

  it("翻面、縮放、格數、動作進網址", () => {
    const u = characterUrl({ ...defaultOutfit(1), flip: true, pose: "alert" }, data, { frame: 2, resize: 3 });
    expect(u.endsWith("/alert/2?resize=3&renderMode=0&flipX=true")).toBe(true);
  });

  it("mode 進 renderMode：沒寫是 0，舞台用 4（腳在正中間），2 也帶得出去", () => {
    const o = { ...defaultOutfit(0), pose: "walk" as const };
    expect(characterUrl(o, data, { frame: 1, resize: 2 })).toContain("/walk1/1?resize=2&renderMode=0&");
    expect(characterUrl(o, data, { frame: 1, resize: 1, mode: 4 }).endsWith("/walk1/1?resize=1&renderMode=4&flipX=false")).toBe(true);
    expect(characterUrl(o, data, { frame: 1, resize: 1, mode: 2 }).endsWith("/walk1/1?resize=1&renderMode=2&flipX=false")).toBe(true);
    // 換模式只改 renderMode，道具陣列不變
    expect(partsOf(characterUrl(o, data, { frame: 0, resize: 1, mode: 4 }))).toEqual(partsOf(characterUrl(o, data, { frame: 0, resize: 2 })));
  });

  it("武器影響 stance：拿槍站著用 stand2，走路用 walk2", () => {
    const spear = data.items.find((i) => i.k === "weapon" && i.r && i.g !== 1 && Math.floor(i.id / 10000) === 144)!;
    const sword = data.items.find((i) => i.k === "weapon" && i.r && i.g !== 1 && Math.floor(i.id / 10000) === 140)!;
    const o = wearItem(defaultOutfit(0), spear, data);
    expect(characterUrl(o, data, { frame: 0, resize: 2 })).toContain("/stand2/0?");
    expect(characterUrl({ ...o, pose: "walk" }, data, { frame: 1, resize: 2 })).toContain("/walk2/1?");
    const o2 = wearItem(defaultOutfit(0), sword, data);
    expect(characterUrl(o2, data, { frame: 0, resize: 2 })).toContain("/stand1/0?");
    // 武器也真的在道具陣列裡
    expect(partsOf(characterUrl(o, data, { frame: 0, resize: 2 })).some((p) => p.itemId === spear.id)).toBe(true);
  });

  it("每格道具都帶進陣列，資料裡沒有或畫不出來的 id 不放（免得整張圖 404）", () => {
    const idx = itemIndex(data);
    const cap = data.items.find((i) => i.k === "cap" && i.r && i.g !== 1)!;
    const undrawable = data.items.find((i) => !i.r && i.g !== 1)!;
    let o = wearItem(defaultOutfit(0), cap, data);
    o = { ...o, wear: { ...o.wear, shoes: undrawable.id, glove: 9999999 } };
    const ids = partsOf(characterUrl(o, data, { frame: 0, resize: 2 })).map((p) => p.itemId);
    expect(ids).toContain(cap.id);
    expect(ids).not.toContain(undrawable.id);
    expect(ids).not.toContain(9999999);
    expect(idx.get(cap.id)).toBeDefined();
  });
});

describe("FRAMES", () => {
  it("每個動作都有格數；站著 3 格 500ms、走路 4 格 180ms、警戒 3 格 500ms，其他單格", () => {
    expect(FRAMES.stand).toMatchObject({ n: 3, ms: 500 });
    expect(FRAMES.walk).toMatchObject({ n: 4, ms: 180 });
    expect(FRAMES.alert).toMatchObject({ n: 3, ms: 500 });
    for (const k of ["jump", "prone", "sit"] as const) expect(FRAMES[k].n).toBe(1);
  });
});
