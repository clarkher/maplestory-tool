import { describe, expect, it } from "vitest";
import type { MainPick, TrainOption } from "@/lib/now-plan";
import { GODDESS_PQ, goddessNoteFor, goddessPqNote } from "@/lib/v002-notes";

describe("女神的痕跡（2026-10-16 使用者選 1A：只放官方確定的，不改主推）", () => {
  it("51～70 等才出現；寫地點、找誰、幾個人、最終獎勵（女神組隊進 pq.json 後不再說「還沒有人整理」）", () => {
    for (const level of [51, 60, 70]) {
      const note = goddessPqNote(level);
      expect(note, String(level)).not.toBeNull();
      expect(note!.text).toContain("天空之城的疑問之塔");
      expect(note!.text).toContain("溫莉");
      expect(note!.text).toContain("6 個人");
      expect(note!.text).toContain("女神手鐲");
      expect(note!.text).not.toContain("台服打法還沒有人整理");
    }
    for (const level of [1, 50, 71, 120]) expect(goddessPqNote(level), String(level)).toBeNull();
  });

  it("連到任務卡（遊戲資料的任務 1203）跟入口（疑問之塔）", () => {
    expect(goddessPqNote(55)!.quest).toBe(`/db/quests?id=${GODDESS_PQ.quest}`);
    expect(GODDESS_PQ.quest).toBe("1203");
    expect(GODDESS_PQ.entrance).toBe(200080101);
  });
});

describe("女神組隊進了 pq.json 之後（v1.08）：主推就是女神組隊時，不重複舊提示", () => {
  const goddessPick = {
    kind: "pq",
    pq: { key: "goddess", name: "女神的痕跡", quest: GODDESS_PQ.quest, entrance: GODDESS_PQ.entrance, byJob: {} },
    window: [51, 70],
    job: 110,
  } as MainPick;
  const otherPq = {
    kind: "pq",
    pq: { key: "kerning", name: "毒物森林組隊", quest: "1100", entrance: 103000800, byJob: {} },
    window: [21, 30],
    job: 110,
  } as MainPick;
  const mapPick = { kind: "map", option: {} as TrainOption } as MainPick;

  it("主推是女神組隊時這行不顯示", () => {
    expect(goddessNoteFor(55, goddessPick)).toBeNull();
  });

  it("主推是練功圖、別的組隊任務、轉職、或還沒有主推時，照舊提醒", () => {
    for (const pick of [mapPick, otherPq, { kind: "advance", instructors: [] } as MainPick, undefined]) {
      const note = goddessNoteFor(55, pick);
      expect(note, String(pick?.kind)).not.toBeNull();
      expect(note!.quest).toBe(`/db/quests?id=${GODDESS_PQ.quest}`);
    }
  });

  it("不在 51～70 等一律不顯示，不管主推是什麼", () => {
    for (const level of [1, 50, 71, 120]) {
      for (const pick of [mapPick, goddessPick, undefined]) expect(goddessNoteFor(level, pick), `${level} ${pick?.kind}`).toBeNull();
    }
  });

  it("提示文字不再說「台服打法還沒有人整理」，其餘照舊", () => {
    const text = goddessPqNote(55)!.text;
    expect(text).not.toContain("台服打法還沒有人整理");
    expect(text).toBe("51～70 等可以打組隊任務「女神的痕跡」：到天空之城的疑問之塔找溫莉，要 6 個人，最終獎勵女神手鐲。");
  });
});
