// src/lib/speed/__tests__/view.test.ts
import { describe, expect, it } from "vitest";
import type { MemberExp } from "../party-exp";
import type { Segment } from "../tracker";
import {
  backCalcLine, draftParty, HINT_RESET_AFTER, hitterAfterRemove, jobName, levelPercent, nextHints, partyKillLine, partyLevel, partySize, runBody, saveNote,
  type HintState,
} from "../view";

const exp = (level: number, total: number, hitter = false, effective = true): MemberExp => ({ level, hitter, effective, white: total, bonus: 0, total });

describe("levelPercent", () => {
  it("用經驗 ÷ 這一級升級要的經驗算（基準截圖 406,947／510,420 → 79.73%）", () => {
    const toNext: number[] = [];
    toNext[46] = 510_420;
    expect(levelPercent(406_947, 46, toNext)?.toFixed(2)).toBe("79.73");
  });

  it("表裡沒有這一級回 null", () => {
    expect(levelPercent(100, 3, [])).toBeNull();
  });
});

describe("jobName", () => {
  it("職業 id 換成名字；初心者是 0；不認得回 null", () => {
    expect(jobName(220)).toBe("冰雷巫師");
    expect(jobName(0)).toBe("初心者");
    expect(jobName(999)).toBeNull();
    expect(jobName(null)).toBeNull();
  });
});

describe("partyLevel", () => {
  it("1～120 的整數才算", () => {
    expect(partyLevel("44")).toBe(44);
    expect(partyLevel(" 1 ")).toBe(1);
    expect(partyLevel("120")).toBe(120);
  });

  it("空的、0、超過 120、小數、不是數字都不算", () => {
    for (const text of ["", "0", "121", "4.5", "abc", "-3", "1e2"]) expect(partyLevel(text)).toBeNull();
  });
});

describe("draftParty", () => {
  it("每一格都合法：照填的存", () => {
    expect(draftParty(true, ["44", "30"], 2)).toEqual({ on: true, others: [44, 30], hitter: 2 });
    expect(draftParty(false, [], 0)).toEqual({ on: false, others: [], hitter: 0 });
  });

  it("空的、不合法的格子不存；打怪的人照著挪到同一位隊友（不會位移到別人身上）", () => {
    expect(draftParty(true, ["44", ""], 0)).toEqual({ on: true, others: [44], hitter: 0 });
    expect(draftParty(true, ["", "44"], 2)).toEqual({ on: true, others: [44], hitter: 1 });
    expect(draftParty(true, ["30", "200", "44"], 3)).toEqual({ on: true, others: [30, 44], hitter: 2 });
  });

  it("打怪的那一格還沒填好：先算自己打", () => {
    expect(draftParty(true, ["44", ""], 2)).toEqual({ on: true, others: [44], hitter: 0 });
  });

  it("打怪的人超出範圍算自己打；隊友最多存 5 個", () => {
    expect(draftParty(true, ["44"], 2)).toEqual({ on: true, others: [44], hitter: 0 });
    expect(draftParty(true, ["1", "2", "3", "4", "5", "6"], 6)).toEqual({ on: true, others: [1, 2, 3, 4, 5], hitter: 0 });
  });
});

describe("hitterAfterRemove", () => {
  it("刪掉打怪的那一位：改回自己打", () => {
    expect(hitterAfterRemove(2, 1)).toBe(0);
  });

  it("刪掉前面的隊友：打怪的人往前挪一格；刪後面的不動", () => {
    expect(hitterAfterRemove(3, 0)).toBe(2);
    expect(hitterAfterRemove(1, 2)).toBe(1);
    expect(hitterAfterRemove(0, 0)).toBe(0);
  });
});

describe("partySize", () => {
  it("勾了組隊＝自己＋隊友數；沒勾＝1", () => {
    expect(partySize({ on: true, others: [44, 30], hitter: 0 })).toBe(3);
    expect(partySize({ on: false, others: [44, 30], hitter: 0 })).toBe(1);
    expect(partySize({ on: true, others: [], hitter: 0 })).toBe(1);
  });
});

describe("partyKillLine", () => {
  it("第一個是你，其他寫等級；打怪的人後面標「打」、吸不到的寫「吸不到」", () => {
    expect(partyKillLine([exp(46, 52.4, true), exp(44, 40.6), exp(20, 0, false, false)])).toBe("組隊每隻：你 +52（打）、Lv.44 +41、Lv.20 吸不到");
  });

  it("隊友打：標在隊友後面；數字照千分位", () => {
    expect(partyKillLine([exp(46, 1200), exp(44, 1500, true)])).toBe("組隊每隻：你 +1,200、Lv.44 +1,500（打）");
  });
});

describe("backCalcLine", () => {
  it("全隊打幾隻（四捨五入）、每個隊友 10 分鐘約多少", () => {
    expect(backCalcLine({ kills: 52.4, per10: [20_000, 18_100.6, 9_000] }, [46, 44, 30])).toBe("回推：全隊 10 分鐘約打 52 隻；Lv.44 隊友 10 分鐘約 18,101、Lv.30 約 9,000");
  });

  it("隊友吸不到寫「吸不到」", () => {
    expect(backCalcLine({ kills: 10, per10: [5_000, 0] }, [46, 20])).toBe("回推：全隊 10 分鐘約打 10 隻；Lv.20 隊友吸不到");
  });

  it("算不出來（null）或沒有隊友：不出這行", () => {
    expect(backCalcLine(null, [46, 44])).toBeNull();
    expect(backCalcLine({ kills: 3, per10: [100] }, [46])).toBeNull();
  });
});

describe("nextHints", () => {
  const fresh: HintState = { nullRun: 0, cleared: false };
  const withExp = { bar: true, exp: true };
  const noExp = { bar: true, exp: false };

  it("讀到經驗：照 tracker 給等級提示", () => {
    expect(nextHints(fresh, withExp, { accepted: true, hints: [46, 47] })).toEqual({ state: fresh, hints: [46, 47] });
  });

  it(`連續 ${HINT_RESET_AFTER} 張有狀態列、讀不到經驗：送一次空的提示`, () => {
    let state = fresh;
    const sent: Array<number[] | null> = [];
    for (let i = 0; i < HINT_RESET_AFTER + 2; i++) {
      const step = nextHints(state, noExp, { accepted: false, hints: [46, 47] });
      state = step.state;
      sent.push(step.hints);
    }
    expect(sent.slice(0, HINT_RESET_AFTER - 1).every(hints => hints === null)).toBe(true);
    expect(sent[HINT_RESET_AFTER - 1]).toEqual([]);
    expect(sent.slice(HINT_RESET_AFTER)).toEqual([null, null]);
    expect(state.cleared).toBe(true);
  });

  it("清掉之後：tracker 還沒接受讀數就維持空的；接受了才換回 tracker 的提示", () => {
    const cleared: HintState = { nullRun: HINT_RESET_AFTER, cleared: true };
    const rejected = nextHints(cleared, withExp, { accepted: false, hints: [46, 47] });
    expect(rejected.hints).toBeNull();
    expect(rejected.state).toEqual({ nullRun: 0, cleared: true });
    const accepted = nextHints(rejected.state, withExp, { accepted: true, hints: [50, 51] });
    expect(accepted).toEqual({ state: fresh, hints: [50, 51] });
  });

  it("沒有狀態列的畫面不算在連續裡（計數歸零）", () => {
    const step = nextHints({ nullRun: 7, cleared: false }, { bar: false, exp: false }, { accepted: false, hints: [] });
    expect(step).toEqual({ state: { nullRun: 0, cleared: false }, hints: null });
  });
});

function segment(patch: Partial<Segment> = {}): Segment {
  return {
    mode: "auto", startedAt: Date.parse("2026-10-13T08:00:00.000Z"), endedAt: 0, lastChangeAt: Date.parse("2026-10-13T08:12:00.400Z"),
    startLevel: 46, level: 46, exp: 0, job: 220, party: 1, mapKey: "k", gained: 120_000, levelUps: 0, deaths: 1, byMap: {}, ...patch,
  };
}

describe("runBody", () => {
  const base = { charId: "芙莉蓮", isPublic: false, profileJob: 210, clientVer: "v0.95" };

  it("單練：組隊欄位送空的；時間照這段算到最後一次變動（秒，四捨五入）", () => {
    expect(runBody(segment(), { mapId: 101, mapName: "森林迷宮III" }, { ...base, party: { on: false, others: [44], hitter: 1 } })).toEqual({
      mapId: 101, mapName: "森林迷宮III", level: 46, job: 220, charId: "芙莉蓮", isPublic: false, partyLevels: [], partyHitter: 0,
      mode: "auto", startedAt: "2026-10-13T08:00:00.000Z", durationSec: 720, expGained: 120_000, levelUps: 0, deaths: 1, clientVer: "v0.95",
    });
  });

  it("組隊：送隊友等級跟誰在打，不送 partySize", () => {
    const body = runBody(segment(), { mapId: null, mapName: null }, { ...base, party: { on: true, others: [44, 30], hitter: 2 } });
    expect(body.partyLevels).toEqual([44, 30]);
    expect(body.partyHitter).toBe(2);
    expect("partySize" in body).toBe(false);
  });

  it("畫面沒認出職業：用「我的路線」選的；那邊也沒選就是 null", () => {
    expect(runBody(segment({ job: null }), { mapId: null, mapName: null }, { ...base, party: { on: false, others: [], hitter: 0 } }).job).toBe(210);
    expect(runBody(segment({ job: null }), { mapId: null, mapName: null }, { ...base, profileJob: -1, party: { on: false, others: [], hitter: 0 } }).job).toBeNull();
  });
});

describe("saveNote", () => {
  const ranked = { durationSec: 900, mapId: 101 };

  it("存好了：進排行、或寫出為什麼不進", () => {
    expect(saveNote({ kind: "response", status: 200, ok: true, ranked: true }, ranked)).toBe("存好了，已列入這張圖的排行。");
    expect(saveNote({ kind: "response", status: 200, ok: true, ranked: false }, { durationSec: 400, mapId: 101 })).toBe("存好了。不到 10 分鐘，不列排行。");
    expect(saveNote({ kind: "response", status: 200, ok: true, ranked: false }, { durationSec: 900, mapId: null })).toBe("存好了。認不出地圖，不列排行。");
    expect(saveNote({ kind: "response", status: 200, ok: true, ranked: false }, ranked)).toBe("存好了。這張圖不列排行（不是練功地圖，或超過這張圖打得到的上限）。");
  });

  it("排行還沒開（503）", () => {
    expect(saveNote({ kind: "response", status: 503, ok: false, error: "排行還沒開" }, ranked)).toBe("排行還沒開，這段沒存到。");
  });

  it("開始時間被擋：請玩家校正電腦時間", () => {
    expect(saveNote({ kind: "response", status: 400, ok: false, error: "開始時間要在最近 7 天內" }, ranked)).toBe("沒存到：電腦時間跟標準時間差太多，校正一下時間再試。");
  });

  it("其他錯誤照伺服器的話寫；沒有話就寫等一下再過來", () => {
    expect(saveNote({ kind: "response", status: 429, ok: false, error: "送太快了，等一下再存" }, ranked)).toBe("沒存到：送太快了，等一下再存。");
    expect(saveNote({ kind: "response", status: 500, ok: false }, ranked)).toBe("沒存到：等一下再過來。");
  });

  it("沒填角色 ID、不到 5 分鐘、網路不通", () => {
    expect(saveNote({ kind: "noId" }, ranked)).toBe("沒填角色 ID，這段沒存進排行。");
    expect(saveNote({ kind: "short" }, ranked)).toBe("不到 5 分鐘，沒存。");
    expect(saveNote({ kind: "network" }, ranked)).toBe("沒存到：網路不通，等一下再過來。");
  });
});
