import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AvatarData } from "@/lib/avatar/types";

const data = JSON.parse(readFileSync(join(process.cwd(), "public/data/avatar.json"), "utf8")) as AvatarData;
const SLOT_KEYS = ["cap", "overall", "coat", "pants", "shoes", "glove", "cape", "weapon", "eyeAcc", "faceAcc", "earrings", "shield"];

describe("avatar.json（紙娃娃資料）", () => {
  it("件數合理", () => {
    expect(data.hair.length).toBeGreaterThan(400);
    expect(data.face.length).toBeGreaterThan(200);
    expect(data.skin.map((s) => s.n)).toEqual(["奶油皮膚", "日光浴皮膚", "健康皮膚", "乳白皮膚", "淒涼皮膚", "蒼白皮膚", "貴族皮膚", "華麗皮膚"]);
    for (const k of SLOT_KEYS) expect(data.items.filter((i) => i.k === k).length, k).toBeGreaterThan(20);
  });
  it("畫得出來的超過九成", () => {
    const drawable = data.items.filter((i) => i.r).length + data.hair.filter((h) => h.t.length + h.j.length).length;
    expect(drawable / (data.items.length + data.hair.length)).toBeGreaterThan(0.9);
  });
  it("男女都有得挑", () => {
    for (const g of [0, 1]) expect(data.hair.filter((h) => h.g === g || h.g === 2).length).toBeGreaterThan(150);
  });
});
