import { describe, expect, it } from "vitest";
import { EMPTY_LINES, introLines, resultLines, type Seg } from "../lines";

const flat = (rows: Seg[][]) => rows.map((r) => r.map((s) => s.t).join(""));

describe("introLines", () => {
  it("開場逐字", () => {
    const rows = introLines(0);
    expect(flat(rows).filter(Boolean)).toEqual([
      "新來的冒險者？",
      "要登錄冒險者名冊的話，先在登記書上簽你的 ID。",
      "簽完多出來的筆畫……我會幫你收著的。",
    ]);
    expect(rows[1].find((s) => s.t === "冒險者名冊")?.c).toBe("blue");
    expect(rows[1].find((s) => s.t === "ID")?.c).toBe("blue");
    expect(rows.flat().find((s) => s.t === "幫你收著")?.c).toBe("red");
  });
  it("拒絕 1～4 逐字", () => {
    expect(flat(introLines(1))).toEqual(["……你剛剛是不是手滑了？要登錄冒險者名冊嗎？"]);
    expect(flat(introLines(2))).toEqual(["冒險者名冊只差你一個了。"]);
    expect(flat(introLines(3))).toEqual(["我會一直問喔。"]);
    expect(flat(introLines(4))).toEqual(["真的不簽？"]);
  });
  it("第 5 次起 3、4 輪播", () => {
    expect(flat(introLines(5))).toEqual(flat(introLines(3)));
    expect(flat(introLines(6))).toEqual(flat(introLines(4)));
    expect(["我會一直問喔。", "真的不簽？"]).toContain(flat(introLines(10))[0]);
  });
});

describe("resultLines", () => {
  it("怪物", () => {
    const rows = resultLines({ kind: "monster", id: 1, n: "藍蝸牛", kept: [], score: 80, xf: { sx: 1, sy: 1, dx: 0, dy: 0 } });
    expect(flat(rows)).toEqual(["簽好了。多的筆畫我收下囉。", "從今天起，你的名字是「藍蝸牛」"]);
    expect(rows[1][1]).toEqual({ t: "「藍蝸牛」", c: "blue" });
  });
  it("一坨照抄", () => {
    expect(flat(resultLines({ kind: "poop", score: 10 })).join("")).toBe("拉完了，測出來是一坨。建議換個暱稱。");
  });
  it("empty", () => {
    expect(resultLines({ kind: "empty" })).toEqual(EMPTY_LINES);
    expect(flat(EMPTY_LINES)).toEqual(["還沒簽喔。在登記書上寫你的 ID 吧。"]);
  });
});
