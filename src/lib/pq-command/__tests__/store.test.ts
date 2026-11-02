import { describe, expect, it } from "vitest";
import { combos } from "../combo";
import { assignAt, defaultPqState, parsePqState, resetPq } from "../store";

describe("parsePqState", () => {
  it("沒存過、壞 JSON、不是物件：回預設（月妙、第一關）", () => {
    for (const raw of [null, "", "{壞", "[1,2]", "42"]) expect(parsePqState(raw)).toEqual(defaultPqState());
  });

  it("讀回正常存檔", () => {
    const raw = JSON.stringify({
      pq: "kerning",
      names: ["阿明", "小華"],
      prog: { kerning: { stage: 3, combo: { barrel: { i: 4, hit: false } }, checked: ["barrel:0"] } },
    });
    const s = parsePqState(raw);
    expect(s.pq).toBe("kerning");
    expect(s.names).toEqual(["阿明", "小華"]);
    expect(s.prog.kerning).toEqual({ stage: 3, combo: { barrel: { i: 4, hit: false } }, checked: ["barrel:0"] });
    expect(s.prog.moon.stage).toBe(0);
  });

  it("壞欄位各自回預設，不拖累其他欄位", () => {
    const raw = JSON.stringify({
      pq: "不存在",
      names: ["阿明", 5, "一二三四五六七八九十十一十二十三", "a", "b", "c", "d"],
      prog: {
        kerning: {
          stage: 99,
          combo: { barrel: { i: 21 }, rope: { i: 2, hit: true }, boss: { i: 1 }, nope: { i: 0 } },
          checked: ["barrel:0", "barrel:99", "x", 3, "barrel:0"],
        },
        goddess: "壞",
      },
    });
    const s = parsePqState(raw);
    expect(s.pq).toBe("moon");
    expect(s.names).toHaveLength(6);
    expect(s.names[1]).toBe("");
    expect(s.names[2]).toHaveLength(12);
    expect(s.prog.kerning.stage).toBe(0);
    // 跳木桶共 20 組，i 最多 20（全部試過）；21 不收。不是試組合的關（boss）、不存在的關不收
    expect(s.prog.kerning.combo).toEqual({ rope: { i: 2, hit: true } });
    expect(s.prog.kerning.checked).toEqual(["barrel:0"]);
    expect(s.prog.goddess).toEqual({ stage: 0, combo: {}, checked: [] });
  });

  it("全部試過（i＝總組數）時不會是答案", () => {
    const s = parsePqState(JSON.stringify({ prog: { kerning: { combo: { barrel: { i: 20, hit: true } } } } }));
    expect(s.prog.kerning.combo.barrel).toEqual({ i: 20, hit: false });
  });
});

describe("resetPq", () => {
  it("只清這個任務，名字跟別的任務留著", () => {
    const s = parsePqState(JSON.stringify({ pq: "kerning", names: ["阿明"], prog: { kerning: { stage: 2 }, moon: { stage: 3 } } }));
    const r = resetPq(s, "kerning");
    expect(r.prog.kerning.stage).toBe(0);
    expect(r.prog.moon.stage).toBe(3);
    expect(r.names).toEqual(["阿明"]);
  });
});

describe("assignAt", () => {
  it("跳木桶第 5 組（134）：一路換過來每個人站的位置", () => {
    const list = combos(6, 3);
    expect(assignAt(list, 0)).toEqual([1, 2, 3]);
    expect(assignAt(list, 3)).toEqual([1, 2, 6]);
    expect(assignAt(list, 4)).toEqual([1, 3, 4]);
    expect([...assignAt(list, 19)].sort()).toEqual([4, 5, 6]);
    // 超過最後一組（全部試過）停在最後一組
    expect(assignAt(list, 20)).toEqual(assignAt(list, 19));
  });
});
