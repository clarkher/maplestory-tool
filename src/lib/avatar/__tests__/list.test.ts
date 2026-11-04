import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { candidates, searchGroups } from "@/lib/avatar/list";
import type { Entry, TabKey } from "@/lib/avatar/list";
import type { AvatarData, AvatarItem, AvatarStyle, Gender } from "@/lib/avatar/types";

const data = JSON.parse(readFileSync(join(process.cwd(), "public/data/avatar.json"), "utf8")) as AvatarData;

const ORDER: TabKey[] = ["hair", "face", "skin", "cap", "overall", "coat", "pants", "shoes", "glove", "cape", "weapon", "eyeAcc", "faceAcc", "earrings", "shield"];
const GENDERS: Gender[] = [0, 1];

/** 這一格穿得到這個性別嗎 */
const fitsGender = (e: Entry, g: Gender) => (e.kind === "skin" ? true : (e.kind === "item" ? e.item.g : e.style.g) === g || (e.kind === "item" ? e.item.g : e.style.g) === 2);
const idOf = (e: Entry) => (e.kind === "skin" ? e.skin.id : e.kind === "item" ? e.item.id : e.style.id);
const keyOf = (e: Entry) => `${e.kind}:${idOf(e)}`;

// v1.40 搬家前的 candidates（原樣抄一份當對照）：沒開「只看商城有賣」時，順序要跟它一模一樣
const coloursOf = (s: AvatarStyle) => [...new Set([...s.t, ...s.j])].sort((a, b) => a - b);
function v140(d: AvatarData, g: Gender, tab: TabKey, text: string): Entry[] {
  const q = text.trim().toLowerCase();
  const hit = (n: string) => !q || n.toLowerCase().includes(q);
  const fits = (x: { g: 0 | 1 | 2 }) => x.g === g || x.g === 2;
  if (tab === "skin") return d.skin.filter((s) => hit(s.n)).map((skin): Entry => ({ kind: "skin", skin }));
  if (tab === "hair" || tab === "face") {
    const styles = d[tab].filter((s) => fits(s) && hit(s.n));
    const drawn = styles.filter((s) => coloursOf(s).length > 0);
    const missing = styles.filter((s) => coloursOf(s).length === 0);
    return [...drawn, ...missing].map((style): Entry => ({ kind: tab, style }));
  }
  const rank = (i: AvatarItem) => (i.cash ? 0 : 2) + (i.r ? 0 : 1);
  return d.items
    .filter((i) => i.k === tab && fits(i) && hit(i.n))
    .sort((a, b) => rank(a) - rank(b))
    .map((item): Entry => ({ kind: "item", item }));
}

describe("跨類別搜尋 searchGroups", () => {
  it("目前分頁那類排第一，其他照分頁順序；空的類別不列", () => {
    const groups = searchGroups(data, 0, "楓葉", ORDER, "weapon");
    expect(groups[0].tab).toBe("weapon");
    expect(groups.map((g) => g.tab)).toEqual(["weapon", ...ORDER.filter((t) => t !== "weapon" && groups.some((g) => g.tab === t))]);
    expect(groups.every((g) => g.entries.length > 0)).toBe(true);
    // 楓葉：帽子、手套、披風、武器、臉飾、耳環、盾牌都有，至少兩組
    expect(groups.length).toBeGreaterThanOrEqual(2);
  });
  it("目前分頁沒有符合的就不列它，其他照分頁順序", () => {
    const groups = searchGroups(data, 0, "楓葉", ORDER, "shoes");
    expect(groups.map((g) => g.tab)).toEqual(["cap", "glove", "cape", "weapon", "faceAcc", "earrings", "shield"]);
  });
  it("目前分頁是髮型、臉型、膚色也一樣排第一", () => {
    const byCoat = searchGroups(data, 0, "造型", ORDER, "coat");
    expect(byCoat[0].tab).toBe("coat");
    const byHair = searchGroups(data, 0, "造型", ORDER, "hair");
    expect(byHair[0].tab).toBe("hair");
    expect(byHair.map((g) => g.tab)).toEqual(["hair", ...ORDER.filter((t) => t !== "hair" && byHair.some((g) => g.tab === t))]);
  });
  it("每一組的格子跟單獨搜那個分頁一樣（內容與順序）", () => {
    for (const g of GENDERS)
      for (const q of ["楓葉", "帽", "造型", "黃"])
        for (const grp of searchGroups(data, g, q, ORDER, "coat"))
          expect(grp.entries.map(keyOf), `${g}/${q}/${grp.tab}`).toEqual(candidates(data, g, grp.tab, q).map(keyOf));
  });
  it("女生搜尋不出現只有男生能穿的", () => {
    const male = searchGroups(data, 0, "帽", ORDER, "cap").flatMap((g) => g.entries);
    const female = searchGroups(data, 1, "帽", ORDER, "cap").flatMap((g) => g.entries);
    expect(female.length).toBeGreaterThan(0);
    for (const e of female) expect(fitsGender(e, 1), keyOf(e)).toBe(true);
    for (const e of male) expect(fitsGender(e, 0), keyOf(e)).toBe(true);
    // 男生才穿得到的真的有（青青出遊深藍帽），女生搜不到
    expect(male.some((e) => e.kind === "item" && e.item.n === "青青出遊深藍帽")).toBe(true);
    expect(female.some((e) => e.kind === "item" && e.item.n === "青青出遊深藍帽")).toBe(false);
  });
  it("膚色也搜得到：搜「奶油」有 skin 這一組", () => {
    const groups = searchGroups(data, 1, "奶油", ORDER, "cap");
    const skin = groups.find((g) => g.tab === "skin");
    expect(skin?.entries.map((e) => (e.kind === "skin" ? e.skin.n : ""))).toEqual(["奶油皮膚"]);
  });
  it("搜尋字前後空白、英文大小寫不影響；空白字串不列任何東西", () => {
    expect(searchGroups(data, 0, "  楓葉 ", ORDER, "cap").map((g) => g.tab)).toEqual(searchGroups(data, 0, "楓葉", ORDER, "cap").map((g) => g.tab));
    expect(searchGroups(data, 0, "", ORDER, "cap")).toEqual([]);
    expect(searchGroups(data, 0, "   ", ORDER, "cap")).toEqual([]);
  });
  it("找不到任何東西回空陣列", () => {
    expect(searchGroups(data, 0, "這個字絕對沒有任何裝備叫這個", ORDER, "cap")).toEqual([]);
  });
  it("只看商城有賣：沒有髮型、臉型、膚色、一般裝備，每件都有 pr", () => {
    for (const g of GENDERS) {
      // 「造型」沒開時髮型、臉型、裝備都有；開了只剩有價的裝備
      const all = searchGroups(data, g, "造型", ORDER, "cap");
      expect(all.some((x) => x.tab === "hair")).toBe(true);
      const shop = searchGroups(data, g, "帽", ORDER, "cap", true);
      expect(shop.length).toBeGreaterThan(0);
      for (const grp of shop) {
        expect(["hair", "face", "skin"]).not.toContain(grp.tab);
        for (const e of grp.entries) {
          expect(e.kind).toBe("item");
          if (e.kind === "item") {
            expect(e.item.cash, String(e.item.id)).toBe(1);
            expect(e.item.pr, String(e.item.id)).toBeGreaterThan(0);
          }
        }
      }
    }
    // 髮型、臉型、膚色一定不在：搜「造型」「奶油」這種髮型、膚色才有的字
    expect(searchGroups(data, 0, "奶油", ORDER, "cap", true)).toEqual([]);
    expect(searchGroups(data, 0, "造型", ORDER, "hair", true).map((x) => x.tab)).toEqual(["coat", "pants", "shoes"]);
  });
  it("只看商城有賣：總數＝沒開時有價的那幾件，順序一樣", () => {
    const shop = searchGroups(data, 0, "黃", ORDER, "cap", true);
    const expected = searchGroups(data, 0, "黃", ORDER, "cap")
      .map((grp) => ({ tab: grp.tab, ids: grp.entries.filter((e) => e.kind === "item" && e.item.pr).map(idOf) }))
      .filter((grp) => grp.ids.length > 0);
    expect(shop.map((grp) => ({ tab: grp.tab, ids: grp.entries.map(idOf) }))).toEqual(expected);
  });
});

describe("分頁清單 candidates", () => {
  it("只看商城有賣：帽子全有 pr，順序跟沒開時的相對順序一樣", () => {
    for (const g of GENDERS) {
      const all = candidates(data, g, "cap", "");
      const shop = candidates(data, g, "cap", "", true);
      expect(shop.length).toBeGreaterThan(0);
      expect(shop.length).toBeLessThan(all.length);
      expect(shop.every((e) => e.kind === "item" && e.item.pr && e.item.pr > 0)).toBe(true);
      expect(shop.map(keyOf)).toEqual(all.filter((e) => e.kind === "item" && e.item.pr).map(keyOf));
    }
  });
  it("只看商城有賣：十二類裝備分頁每一頁都套得上，沒價錢的不出現", () => {
    for (const tab of ORDER.slice(3))
      for (const e of candidates(data, 0, tab, "", true)) expect(e.kind === "item" && e.item.pr, `${tab}/${keyOf(e)}`).toBeTruthy();
  });
  it("只看商城有賣再加搜尋字：兩個條件都要符合", () => {
    const shop = candidates(data, 0, "cap", "帽", true);
    expect(shop.length).toBeGreaterThan(0);
    for (const e of shop) expect(e.kind === "item" && e.item.pr && e.item.n.includes("帽")).toBeTruthy();
  });
  it("髮型、臉型、膚色分頁不套用只看商城有賣（沒價錢，套了就全空）", () => {
    for (const tab of ["hair", "face", "skin"] as const) {
      expect(candidates(data, 0, tab, "", true).map(keyOf)).toEqual(candidates(data, 0, tab, "").map(keyOf));
      expect(candidates(data, 0, tab, "", true).length).toBeGreaterThan(0);
    }
  });
  it("沒開時既有順序不變：跟 v1.40 的算法逐項一模一樣（十五個分頁、男女、有沒有搜尋字）", () => {
    for (const g of GENDERS)
      for (const tab of ORDER)
        for (const q of ["", "  ", "楓葉", "帽", "造型", "黃"])
          for (const shopOnly of [undefined, false])
            expect(candidates(data, g, tab, q, shopOnly).map(keyOf), `${g}/${tab}/${q}`).toEqual(v140(data, g, tab, q).map(keyOf));
  });
  it("沒開時：點裝在前、畫得出來的在前；髮型畫得出來的在前", () => {
    const rank = (i: AvatarItem) => (i.cash ? 0 : 2) + (i.r ? 0 : 1);
    const caps = candidates(data, 0, "cap", "").map((e) => (e.kind === "item" ? rank(e.item) : -1));
    expect(caps).toEqual([...caps].sort((a, b) => a - b));
    expect(caps[0]).toBe(0);
    const hairs = candidates(data, 0, "hair", "").map((e) => (e.kind === "hair" ? coloursOf(e.style).length > 0 : null));
    const firstMissing = hairs.indexOf(false);
    if (firstMissing >= 0) expect(hairs.slice(firstMissing).every((x) => x === false)).toBe(true);
  });
});
