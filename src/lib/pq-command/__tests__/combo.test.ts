import { describe, expect, it } from "vitest";
import { comboSay, combos, firstAssign, moves, nextAssign } from "../combo";

describe("combos", () => {
  it("6 挑 3 照編號小到大，共 20 組", () => {
    const list = combos(6, 3);
    expect(list).toHaveLength(20);
    expect(list[0]).toEqual([1, 2, 3]);
    expect(list[1]).toEqual([1, 2, 4]);
    expect(list[4]).toEqual([1, 3, 4]);
    expect(list[19]).toEqual([4, 5, 6]);
  });
  it("4 挑 3 共 4 組、5 挑 2 共 10 組（拉桿 12、13…45）", () => {
    expect(combos(4, 3)).toHaveLength(4);
    const levers = combos(5, 2).map((c) => c.join(""));
    expect(levers).toEqual(["12", "13", "14", "15", "23", "24", "25", "34", "35", "45"]);
  });
});

describe("moves", () => {
  it("123 → 124：只有站 3 號的換到 4 號", () => {
    expect(moves([1, 2, 3], [1, 2, 4])).toEqual([[3, 4]]);
  });
  it("126 → 134：兩個人換，離開的跟新位置小到大配對", () => {
    expect(moves([1, 2, 6], [1, 3, 4])).toEqual([[2, 3], [6, 4]]);
  });
});

describe("assign", () => {
  it("一開始第 i 個人站第 i 個位置", () => {
    expect(firstAssign([1, 2, 3])).toEqual([1, 2, 3]);
  });
  it("換組時只動要換的人，其他人位置不變", () => {
    // 阿明 1、小華 2、阿強 3 → 124：阿強到 4
    expect(nextAssign([1, 2, 3], [1, 2, 4])).toEqual([1, 2, 4]);
    // 阿明 1、小華 2、阿強 6 → 134：小華到 3、阿強到 4
    expect(nextAssign([1, 2, 6], [1, 3, 4])).toEqual([1, 3, 4]);
    // 位置跟人不一定同順序：阿明 5、小華 2、阿強 3 → 2・3・6：阿明到 6
    expect(nextAssign([5, 2, 3], [2, 3, 6])).toEqual([6, 2, 3]);
  });
});

describe("comboSay", () => {
  const unit = { kind: "stand" as const, unit: "號桶" };
  it("第一組：每個人站哪裡，帶名字", () => {
    expect(comboSay(unit, null, [1, 2, 3], ["阿明", "小華", "阿強"])).toBe("第一組：阿明 1 號桶、小華 2 號桶、阿強 3 號桶，站好別動");
  });
  it("下一組：只叫要換的人", () => {
    expect(comboSay(unit, [1, 2, 3], [1, 2, 4], ["阿明", "小華", "阿強"])).toBe("下一組：阿強從 3 號桶換到 4 號桶，其他人別動");
  });
  it("沒填名字寫站幾號的人；名字空白也一樣", () => {
    expect(comboSay(unit, [1, 2, 6], [1, 3, 4], [])).toBe("下一組：站 2 號桶的人換到 3 號桶、站 6 號桶的人換到 4 號桶，其他人別動");
    expect(comboSay(unit, [1, 2, 6], [1, 3, 4], ["阿明", " ", ""])).toBe("下一組：站 2 號桶的人換到 3 號桶、站 6 號桶的人換到 4 號桶，其他人別動");
    expect(comboSay(unit, null, [1, 2, 3], [])).toBe("第一組：三個人分別站 1、2、3 號桶，站好別動");
  });
  it("拉桿：不是站人，寫拉哪幾根", () => {
    const lever = { kind: "pull" as const, unit: "號拉桿" };
    expect(comboSay(lever, null, [1, 2], [])).toBe("第一組：拉下 1、2 號拉桿，其他推回去");
    expect(comboSay(lever, [1, 2], [1, 3], ["阿明"])).toBe("下一組：拉下 1、3 號拉桿，其他推回去");
  });
});
