import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isSimEquip, isSimScroll } from "@/lib/scroll-sim/linkable";
import type { Item } from "@/lib/types";
import type { ScrollSimData } from "@/lib/scroll-sim/types";

const read = (f: string) => JSON.parse(readFileSync(join(process.cwd(), "public/data", f), "utf8"));
const raw = read("items.json");
const items: Item[] = Array.isArray(raw) ? raw : raw.items;
const sim = read("scroll-sim.json") as ScrollSimData;

describe("查資料的「算衝卷」入口跟 scroll-sim.json 一致（防漂移）", () => {
  it("卷軸：有按鈕的 id 就是 scroll-sim 收的 id", () => {
    const simIds = new Set(sim.scrolls.flatMap((s) => s.ids));
    expect(simIds.size).toBeGreaterThan(300);
    const linkable = new Set(items.filter(isSimScroll).map((i) => i.id));
    expect([...linkable].filter((id) => !simIds.has(id))).toEqual([]);
    expect([...simIds].filter((id) => !linkable.has(id))).toEqual([]);
  });
  it("裝備：有按鈕的 id 就是 scroll-sim 收的 id", () => {
    const simIds = new Set(sim.equips.map((e) => e.id));
    expect(simIds.size).toBeGreaterThan(1500);
    const linkable = new Set(items.filter(isSimEquip).map((i) => i.id));
    expect([...linkable].filter((id) => !simIds.has(id))).toEqual([]);
    expect([...simIds].filter((id) => !linkable.has(id))).toEqual([]);
  });
  it("排除的名字沒有按鈕", () => {
    const one = items.find((i) => i.s === "卷軸" && i.n.startsWith("一級"));
    if (one) expect(isSimScroll(one)).toBe(false);
  });
});
