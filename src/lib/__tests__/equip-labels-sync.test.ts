import { describe, expect, it } from "vitest";
import { equipStatLabel, equipStatValue } from "@/lib/format";
import * as pipe from "../../../pipeline/lib/equip-labels.mjs";

// 改版整理（pipeline/lib/patch-diff.mjs）用 pipeline 這份對照，要跟站上 format.ts 一樣
describe("pipeline/lib/equip-labels.mjs 跟 format.ts 同步", () => {
  const keys = Object.keys(pipe.EQUIP_STAT_LABELS);
  it("每個欄位名一樣", () => {
    for (const key of keys) expect(pipe.equipStatLabel(key)).toBe(equipStatLabel(key));
    expect(pipe.equipStatLabel("zzz")).toBe(equipStatLabel("zzz"));
  });
  it("值的寫法一樣", () => {
    const samples: Array<[string, number | string]> = [
      ["reqJob", 0], ["reqJob", -1], ["reqJob", 1], ["reqJob", 9], ["reqJob", 31], ["reqJob", 40],
      ["attackSpeed", 2], ["attackSpeed", 4], ["attackSpeed", 6], ["attackSpeed", 9], ["attackSpeed", 1],
      ["islot", "WpSi"], ["islot", "MaPn"], ["islot", "Wp"], ["incPAD", 48],
    ];
    for (const [k, v] of samples) expect(pipe.equipStatValue(k, v)).toBe(equipStatValue(k, v));
  });
});
