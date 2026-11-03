import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { avatarLink } from "@/lib/avatar/linkable";
import { parseOutfit } from "@/lib/avatar/outfit";
import type { AvatarData } from "@/lib/avatar/types";
import type { Item } from "@/lib/types";

const read = (f: string) => JSON.parse(readFileSync(join(process.cwd(), "public/data", f), "utf8"));
const raw = read("items.json");
const items: Item[] = Array.isArray(raw) ? raw : raw.items;
const data = read("avatar.json") as AvatarData;

// 從真資料挑常數（不寫死 id，資料更新也不會壞）
const UNDRAWABLE_CASH = data.items.find((i) => i.cash && !i.r)!.id; // 現金道具但台服、日服都畫不出來
const HAIR = data.hair.find((h) => h.t.length > 0)!;
const HAIR_ID = HAIR.id + HAIR.t[0];
const FACE = data.face.find((f) => f.t.length > 0)!;
const FACE_ID = FACE.id + FACE.t[0] * 100;

describe("查資料「穿上看看」入口", () => {
  it("點裝畫得出來才有、一般裝備沒有", () => {
    expect(avatarLink({ id: 1042029, c: "時裝" }, data)).toBe("/plan/avatar?try=1042029"); // 三眼章魚T恤：台服畫得出來、男女都能穿
    expect(avatarLink({ id: 1040002, c: "裝備" }, data)).toBeNull();
    expect(avatarLink({ id: UNDRAWABLE_CASH, c: "時裝" }, data)).toBeNull();
    expect(avatarLink({ id: 30030, c: "時裝" }, data)).toBe("/plan/avatar?try=30030"); // 髮型
  });
  it("髮型、臉型：款式畫得出來的顏色才有", () => {
    expect(avatarLink({ id: HAIR_ID, c: "時裝" }, data)).toBe(`/plan/avatar?try=${HAIR_ID}`);
    expect(avatarLink({ id: FACE_ID, c: "時裝" }, data)).toBe(`/plan/avatar?try=${FACE_ID}`);
  });
  it("不是時裝一律沒有（就算 id 在紙娃娃資料裡）", () => {
    expect(avatarLink({ id: HAIR_ID, c: "裝備" }, data)).toBeNull();
    expect(avatarLink({ id: FACE_ID, c: "消耗" }, data)).toBeNull();
    expect(avatarLink({ id: 1042029, c: "現金" }, data)).toBeNull();
  });
  it("資料裡沒有的 id 沒有", () => {
    expect(avatarLink({ id: 99999999, c: "時裝" }, data)).toBeNull();
  });
  it("每個有按鈕的 id，紙娃娃打開真的穿得上（防漂移）", () => {
    const linked = items.filter((i) => avatarLink(i, data));
    expect(linked.length).toBeGreaterThan(1000);
    for (const it of linked) {
      const o = parseOutfit(new URLSearchParams("try=" + it.id), data);
      const worn = [o.hair, o.face, ...Object.values(o.wear)];
      expect(worn, it.n).toContain(it.id);
    }
  });
});
