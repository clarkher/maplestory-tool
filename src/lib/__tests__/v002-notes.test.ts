import { describe, expect, it } from "vitest";
import { GODDESS_PQ, goddessPqNote } from "@/lib/v002-notes";

describe("女神的痕跡（2026-10-16 使用者選 1A：只放官方確定的，不改主推）", () => {
  it("51～70 等才出現；寫地點、找誰、幾個人、最終獎勵，照實說還沒有台服打法", () => {
    for (const level of [51, 60, 70]) {
      const note = goddessPqNote(level);
      expect(note, String(level)).not.toBeNull();
      expect(note!.text).toContain("天空之城的疑問之塔");
      expect(note!.text).toContain("溫莉");
      expect(note!.text).toContain("6 個人");
      expect(note!.text).toContain("女神手鐲");
      expect(note!.text).toContain("還沒有人整理");
    }
    for (const level of [1, 50, 71, 120]) expect(goddessPqNote(level), String(level)).toBeNull();
  });

  it("連到任務卡（遊戲資料的任務 1203）跟入口（疑問之塔）", () => {
    expect(goddessPqNote(55)!.quest).toBe(`/db/quests?id=${GODDESS_PQ.quest}`);
    expect(GODDESS_PQ.quest).toBe("1203");
    expect(GODDESS_PQ.entrance).toBe(200080101);
  });
});
