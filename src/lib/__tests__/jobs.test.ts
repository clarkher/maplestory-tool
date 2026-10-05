import { describe, expect, it } from "vitest";
import {
  JOB_OPTIONS, advancementLevel, baseJob, commitLevelText, consistentJob, isSecondJob, levelHint, minLevelFor, normalizeJob, pickJobKeepingLevel,
  profileWithJob, stageJob, typedLevel,
} from "@/lib/jobs";

describe("職業清單", () => {
  it("一轉 5 職加二轉 12 職，共 17 個", () => {
    expect(JOB_OPTIONS.map(job => job.id)).toEqual([
      100, 110, 120, 130, 200, 210, 220, 230, 300, 310, 320, 400, 410, 420, 500, 510, 520,
    ]);
  });

  it("二轉職業的一轉前身", () => {
    expect(baseJob(110)).toBe(100);
    expect(baseJob(100)).toBe(100);
    expect(baseJob(520)).toBe(500);
    expect(isSecondJob(110)).toBe(true);
    expect(isSecondJob(100)).toBe(false);
    expect(isSecondJob(0)).toBe(false);
  });

  it("法師 8 等轉職，其他 10 等", () => {
    expect(advancementLevel(200)).toBe(8);
    expect(advancementLevel(230)).toBe(8);
    expect(advancementLevel(310)).toBe(10);
  });

  it("經典版沒有的職業代碼視為還沒選", () => {
    expect(normalizeJob(1110)).toBe(0);
    expect(normalizeJob(431)).toBe(0);
    expect(normalizeJob(111)).toBe(0);
    expect(normalizeJob(220)).toBe(220);
    expect(normalizeJob(0)).toBe(0);
    expect(normalizeJob(-1)).toBe(-1);
  });

  it("選了二轉職業但還沒到 30 等，用一轉的內容", () => {
    expect(stageJob(110, 25)).toBe(100);
    expect(stageJob(110, 30)).toBe(110);
    expect(stageJob(100, 45)).toBe(100);
    expect(stageJob(0, 5)).toBe(0);
  });

  it("選了職業但還沒到轉職等級，還是初心者", () => {
    expect(stageJob(100, 9)).toBe(0);
    expect(stageJob(110, 5)).toBe(0);
    expect(stageJob(200, 8)).toBe(200);
    expect(stageJob(230, 7)).toBe(0);
  });
});

describe("職業的最低等級", () => {
  it("選了職業就代表已經轉職：初心者 1、法師 8、其他一轉 10、二轉 30", () => {
    expect(minLevelFor(-1)).toBe(1);
    expect(minLevelFor(0)).toBe(1);
    expect(minLevelFor(200)).toBe(8);
    expect(minLevelFor(100)).toBe(10);
    expect(minLevelFor(110)).toBe(30);
    expect(minLevelFor(230)).toBe(30);
  });

  it("以前存過的不可能組合改成實際那一轉，等級不動", () => {
    expect(consistentJob(110, 25)).toBe(100);
    expect(consistentJob(110, 8)).toBe(0);
    expect(consistentJob(210, 9)).toBe(200);
    expect(consistentJob(100, 8)).toBe(0);
    expect(consistentJob(110, 35)).toBe(110);
    expect(consistentJob(0, 50)).toBe(0);
    expect(consistentJob(-1, 20)).toBe(-1);
    expect(consistentJob(1110, 50)).toBe(1110);
  });

  it("選職業時等級不夠就調到最低等級並給提示", () => {
    expect(profileWithJob({ level: 25, job: 100 }, 110)).toEqual({ next: { job: 110, level: 30 }, note: "狂戰士 30 等起，等級改成 30" });
    expect(profileWithJob({ level: 35, job: 100 }, 110)).toEqual({ next: { job: 110, level: 35 }, note: null });
    expect(profileWithJob({ level: 0, job: -1 }, 110)).toEqual({ next: { job: 110, level: 0 }, note: null });
  });

  it("選職業時，輸入框裡被擋下的等級重新驗：新職業允許就套用，不允許照舊（輸入框跟著改回實際等級）", () => {
    // 狂戰士 Lv.30 打 25 被擋 → 改點劍士：25 可以，套用
    expect(profileWithJob({ level: 30, job: 110 }, 100, 25)).toEqual({ next: { job: 100, level: 25 }, note: null });
    // 改點見習騎士：25 還是不行，等級留在 30
    expect(profileWithJob({ level: 30, job: 110 }, 120, 25)).toEqual({ next: { job: 120, level: 30 }, note: null });
    // 輸入框就是現在的等級時照舊
    expect(profileWithJob({ level: 25, job: 100 }, 110, 25)).toEqual({ next: { job: 110, level: 30 }, note: "狂戰士 30 等起，等級改成 30" });
  });

  it("打的等級太低時給提示", () => {
    expect(levelHint(110, 25)).toBe("狂戰士至少 30 等");
    expect(levelHint(110, 30)).toBeNull();
    expect(levelHint(-1, 5)).toBeNull();
  });
});

describe("等級輸入框", () => {
  it("打字時只套用這個職業允許、又沒超過上限的等級，其他先等（不閃「至少 30 等」）", () => {
    expect(typedLevel("1", 320, 100)).toBeNull();
    expect(typedLevel("15", 320, 100)).toBeNull();
    expect(typedLevel("45", 320, 100)).toBe(45);
    expect(typedLevel("150", 320, 100)).toBeNull();
    expect(typedLevel("", 320, 100)).toBeNull();
    expect(typedLevel("0", 0, 100)).toBeNull();
    expect(typedLevel("7", 0, 100)).toBe(7);
  });

  it("離開輸入框（或按 Enter）：空白、不是數字、小於 1 就默默改回現在的等級", () => {
    const profile = { level: 50, job: 220 };
    expect(commitLevelText("", profile, 100)).toEqual({ level: 50, hint: null });
    expect(commitLevelText("abc", profile, 100)).toEqual({ level: 50, hint: null });
    expect(commitLevelText("0", profile, 100)).toEqual({ level: 50, hint: null });
  });

  it("超過上限：改成上限並說「目前等級上限 Lv.100」", () => {
    expect(commitLevelText("150", { level: 100, job: 320 }, 100)).toEqual({ level: 100, hint: "目前等級上限 Lv.100" });
  });

  it("比職業最低等級低：給原本的提示，輸入框改回現在的等級", () => {
    expect(commitLevelText("15", { level: 95, job: 320 }, 100)).toEqual({ level: 95, hint: "弩弓手至少 30 等" });
  });

  it("合理的等級就套用", () => {
    expect(commitLevelText("62", { level: 95, job: 320 }, 100)).toEqual({ level: 62, hint: null });
  });
});

describe("手滑點到二轉", () => {
  it("劍士 18 → 狂戰士被拉到 30，記住 18；點回劍士就還原 18、忘掉", () => {
    const raised = pickJobKeepingLevel({ level: 18, job: 100 }, 110, undefined, null);
    expect(raised).toEqual({ next: { job: 110, level: 30 }, note: "狂戰士 30 等起，等級改成 30", raisedFrom: 18 });
    expect(pickJobKeepingLevel(raised.next, 100, undefined, raised.raisedFrom)).toEqual({ next: { job: 100, level: 18 }, note: null, raisedFrom: null });
  });

  it("下一個職業還是不允許那個等級：等級是它的最低等級、照樣說一聲，繼續記著（狂戰士 → 見習騎士 → 劍士）", () => {
    const knight = pickJobKeepingLevel({ level: 30, job: 110 }, 120, undefined, 18);
    expect(knight).toEqual({ next: { job: 120, level: 30 }, note: "見習騎士 30 等起，等級改成 30", raisedFrom: 18 });
    expect(pickJobKeepingLevel(knight.next, 100, undefined, knight.raisedFrom)).toEqual({ next: { job: 100, level: 18 }, note: null, raisedFrom: null });
  });

  it("連點：打 5 → 劍士 → 初心者 → 狂戰士 → 法師，停在法師 8 等並說一聲（不是被拉高的 30）；再點初心者回到 5", () => {
    let profile = { level: 5, job: -1 };
    let raisedFrom: number | null = null;
    const pick = (job: number) => {
      // 輸入框跟著顯示現在的等級，所以 typed 就是現在的等級
      const result = pickJobKeepingLevel(profile, job, profile.level, raisedFrom);
      profile = result.next;
      raisedFrom = result.raisedFrom;
      return result;
    };
    expect(pick(100)).toMatchObject({ next: { job: 100, level: 10 }, note: "劍士 10 等起，等級改成 10" });
    expect(pick(0)).toMatchObject({ next: { job: 0, level: 5 }, note: null });
    expect(pick(110)).toMatchObject({ next: { job: 110, level: 30 }, note: "狂戰士 30 等起，等級改成 30" });
    expect(pick(200)).toEqual({ next: { job: 200, level: 8 }, note: "法師 8 等起，等級改成 8", raisedFrom: 5 });
    expect(pick(0)).toEqual({ next: { job: 0, level: 5 }, note: null, raisedFrom: null });
  });

  it("沒有被拉高就不記；輸入框裡另外打的等級優先", () => {
    expect(pickJobKeepingLevel({ level: 35, job: 100 }, 110, undefined, null)).toEqual({ next: { job: 110, level: 35 }, note: null, raisedFrom: null });
    expect(pickJobKeepingLevel({ level: 30, job: 110 }, 100, 25, 18)).toEqual({ next: { job: 100, level: 25 }, note: null, raisedFrom: null });
  });
});
