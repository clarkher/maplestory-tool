import test from "node:test";
import assert from "node:assert/strict";
import { todayList, localDate, localIso, DAILY, WEEKLY, ALL_ITEMS, EQUIPS } from "./list.mjs";

test("週二只查每天那 5 件", () => {
  const list = todayList(new Date(2026, 9, 13)); // 2026-10-13 是週二
  assert.deepEqual(list.map(x => x.name), DAILY);
  assert.ok(list.every(x => x.freq === "daily"));
});

test("週一多每週那 4 件，排在每天的後面", () => {
  const list = todayList(new Date(2026, 9, 12)); // 2026-10-12 是週一
  assert.deepEqual(list.map(x => x.name), [...DAILY, ...WEEKLY]);
  assert.equal(list.at(-1).freq, "weekly");
});

test("清單照 spec：9 件、只有黃色雨傘照屬性分組", () => {
  assert.deepEqual(DAILY, ["手套攻擊卷軸10%", "手套攻擊卷軸60%", "日之鏢", "雷之鏢", "寵物速度卷軸100%"]);
  assert.deepEqual(WEEKLY, ["黃色雨傘", "雪花鏢", "玻璃鞋", "轉蛋券"]);
  assert.equal(ALL_ITEMS.length, 9);
  assert.deepEqual([...EQUIPS], ["黃色雨傘"]);
});

test("localDate 補零、localIso 帶時區", () => {
  const d = new Date(2026, 0, 5, 9, 3, 7);
  assert.equal(localDate(d), "2026-01-05");
  assert.match(localIso(d), /^2026-01-05T09:03:07[+-]\d{2}:\d{2}$/);
});
