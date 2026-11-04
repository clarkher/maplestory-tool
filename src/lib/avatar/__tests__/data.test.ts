import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AvatarData } from "@/lib/avatar/types";
// 件數統計只有 pipeline 那一份（build-gear、verify.mjs 也用它），這裡直接拿來驗，不再自己算
import { avatarCoverage, MIN_DRAWABLE_RATIO, MIN_SHOP_PRICED } from "../../../../pipeline/lib/avatar.mjs";

const read = (f: string) => JSON.parse(readFileSync(join(process.cwd(), f), "utf8"));
const data = read("public/data/avatar.json") as AvatarData;
const msio = read("data/raw/msio-avatar.json") as { checked: number[] };
const SLOT_KEYS = ["cap", "overall", "coat", "pants", "shoes", "glove", "cape", "weapon", "eyeAcc", "faceAcc", "earrings", "shield"];

describe("avatar.json（紙娃娃資料）", () => {
  it("件數合理", () => {
    expect(data.hair.length).toBeGreaterThan(400);
    expect(data.face.length).toBeGreaterThan(200);
    expect(data.skin.map((s) => s.n)).toEqual(["奶油皮膚", "日光浴皮膚", "健康皮膚", "乳白皮膚", "淒涼皮膚", "蒼白皮膚", "貴族皮膚", "華麗皮膚"]);
    for (const k of SLOT_KEYS) expect(data.items.filter((i) => i.k === k).length, k).toBeGreaterThan(20);
  });
  it("比對過的裡面畫得出來的超過九成（還沒比對過的新道具不算）", () => {
    const cov = avatarCoverage(data, msio);
    expect(cov.compared.total).toBeGreaterThan(4000);
    expect(cov.ratio).toBeGreaterThanOrEqual(MIN_DRAWABLE_RATIO);
  });
  it("商城價：有價的件數夠多（防上游改版漏抽），而且都是點裝、價錢大於 0", () => {
    const priced = data.items.filter((i) => i.pr);
    expect(priced.length).toBeGreaterThanOrEqual(MIN_SHOP_PRICED);
    for (const i of priced) {
      expect(i.cash, String(i.id)).toBe(1);
      expect(i.pr, String(i.id)).toBeGreaterThan(0);
    }
  });
  it("男女都有得挑", () => {
    for (const g of [0, 1]) expect(data.hair.filter((h) => h.g === g || h.g === 2).length).toBeGreaterThan(150);
  });
});
