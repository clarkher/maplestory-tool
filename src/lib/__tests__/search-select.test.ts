import { describe, expect, it } from "vitest";
import { filterOptions, type SearchOption } from "../search-select";

const MONSTERS: SearchOption[] = [
  { value: 1, label: "嫩寶 Lv.2" },
  { value: 2, label: "綠水靈 Lv.6" },
  { value: 3, label: "紅寶王 Lv.65" },
  { value: 4, label: "寶寶龍 Lv.40" },
  { value: 5, label: "Jr. 巴洛古 Lv.50" },
];

describe("算傷害的打字找（v2.13：打哪隻怪、武器）", () => {
  it("沒打字就全部照原本順序列（跟原本下拉選單一樣能從頭滑）", () => {
    expect(filterOptions(MONSTERS, "").map(o => o.value)).toEqual([1, 2, 3, 4, 5]);
    expect(filterOptions(MONSTERS, "   ").map(o => o.value)).toEqual([1, 2, 3, 4, 5]);
  });

  it("名字開頭對上的排前面，中間對上的排後面，各自照原本順序", () => {
    expect(filterOptions(MONSTERS, "寶").map(o => o.value)).toEqual([4, 1, 3]);
  });

  it("英文不分大小寫、空白不算", () => {
    expect(filterOptions(MONSTERS, "jr巴").map(o => o.value)).toEqual([5]);
  });

  it("打等級也找得到（Lv.65）", () => {
    expect(filterOptions(MONSTERS, "lv.65").map(o => o.value)).toEqual([3]);
  });

  it("找不到就是空的", () => {
    expect(filterOptions(MONSTERS, "雪吉拉")).toEqual([]);
  });
});
