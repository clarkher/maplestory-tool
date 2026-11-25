import { describe, expect, it, vi } from "vitest";
import { startRoundVideo, type VideoState } from "../round-video";

const clip = new Blob(["x"], { type: "video/mp4" });
const tick = () => new Promise(r => setTimeout(r, 0));

/** 假的分頁：hide／show 會叫監聽；每次錄影留一筆，測試決定什麼時候錄完 */
function setup(hidden = false) {
  const tab = { hidden };
  let cb = () => {};
  const unwatch = vi.fn();
  const takes: { signal: AbortSignal; end: (b: Blob | null) => void; fail: () => void }[] = [];
  const states: VideoState["status"][] = [];
  let last: VideoState | null = null;
  const stop = startRoundVideo({
    record: signal => new Promise((resolve, reject) => takes.push({ signal, end: resolve, fail: () => reject(new Error("x")) })),
    hidden: () => tab.hidden,
    watch: f => {
      cb = f;
      return unwatch;
    },
    onState: s => {
      last = s;
      states.push(s.status);
    },
  });
  return {
    takes,
    states,
    stop,
    unwatch,
    last: () => last,
    hide: () => {
      tab.hidden = true;
      cb();
    },
    show: () => {
      tab.hidden = false;
      cb();
    },
  };
}

describe("startRoundVideo（演出一開始就在背後錄好，v2.74）", () => {
  it("馬上開始錄，錄好給 blob", async () => {
    const s = setup();
    expect(s.takes.length).toBe(1);
    expect(s.states).toEqual(["recording"]);
    s.takes[0].end(clip);
    await tick();
    expect(s.last()).toEqual({ status: "ready", blob: clip });
  });
  it("錄不出來（null、丟例外）→ failed，不重錄", async () => {
    const a = setup();
    a.takes[0].end(null);
    await tick();
    expect(a.states.at(-1)).toBe("failed");
    a.hide();
    a.show();
    expect(a.takes.length).toBe(1);
    const b = setup();
    b.takes[0].fail();
    await tick();
    expect(b.states.at(-1)).toBe("failed");
  });
  it("錄到一半切走：停掉那次、不算失敗；回來重錄", async () => {
    const s = setup();
    s.hide();
    expect(s.takes[0].signal.aborted).toBe(true);
    s.takes[0].end(null);
    await tick();
    expect(s.states.at(-1)).toBe("recording");
    expect(s.takes.length).toBe(1);
    s.show();
    expect(s.takes.length).toBe(2);
    s.takes[1].end(clip);
    await tick();
    expect(s.states.at(-1)).toBe("ready");
  });
  it("切走又馬上回來：舊的那次晚到，結果不算數", async () => {
    const s = setup();
    s.hide();
    s.show();
    expect(s.takes.length).toBe(2);
    s.takes[0].end(null);
    await tick();
    expect(s.states.at(-1)).toBe("recording");
    s.takes[1].end(clip);
    await tick();
    expect(s.states.at(-1)).toBe("ready");
  });
  it("一開始就在背景：回來才錄", () => {
    const s = setup(true);
    expect(s.takes.length).toBe(0);
    s.show();
    expect(s.takes.length).toBe(1);
  });
  it("錄好之後切走再回來（去 App 發完回來）不重錄", async () => {
    const s = setup();
    s.takes[0].end(clip);
    await tick();
    s.hide();
    s.show();
    expect(s.takes.length).toBe(1);
    expect(s.states.at(-1)).toBe("ready");
  });
  it("stop（再寫一次、離開頁面）：停掉、不再回報、不再聽", async () => {
    const s = setup();
    s.stop();
    expect(s.takes[0].signal.aborted).toBe(true);
    expect(s.unwatch).toHaveBeenCalledTimes(1);
    s.takes[0].end(clip);
    await tick();
    expect(s.states).toEqual(["recording"]);
    s.show();
    expect(s.takes.length).toBe(1);
  });
});
