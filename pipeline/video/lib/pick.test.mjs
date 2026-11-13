import test from "node:test";
import assert from "node:assert/strict";
import { shouldMakeVideo, readVideoState, writeVideoState, pendingVideos } from "./pick.mjs";
import { readSeen, writeSeen } from "../../announce/lib/bulletin.mjs";

test("shouldMakeVideo：商城外觀、活動、改版做；維護、開機、制裁不做", () => {
  assert.equal(shouldMakeVideo("【閃亮彗星】喵喵管家&軟綿綿雪兔"), true);
  assert.equal(shouldMakeVideo("【2026 橘子週年慶｜Gama Island 探險】"), true);
  assert.equal(shouldMakeVideo("V003 改版內容預告"), true);
  assert.equal(shouldMakeVideo("新楓之谷：經典版 《1112(四)V002覺醒與突破例行維護開機公告》"), false);
  assert.equal(shouldMakeVideo("新楓之谷：經典版 《1106(五) 商城臨時維護公告》"), false);
  assert.equal(shouldMakeVideo("新楓之谷：經典版 《遊戲異常行為制裁公告》"), false);
  assert.equal(shouldMakeVideo("系統說明"), false);
});

test("狀態往返：write 後 read 相同、seen 註解原封不動", () => {
  const body = "追蹤\n\n<!-- seen:84140,84087 -->";
  const state = new Map([["84140", { n: 3, done: false }], ["84087", { n: 0, done: true }], ["84000", { n: 2, done: false }]]);
  const out = writeVideoState(body, state);
  assert.ok(out.endsWith("<!-- seen:84140,84087 -->"));
  assert.deepEqual(readVideoState(out), new Map([["84140", { n: 3, done: false }], ["84087", { n: 0, done: true }], ["84000", { n: 2, done: false }]]));
  // 再寫一次是取代不是附加
  const again = writeVideoState(out, state);
  assert.equal(again.match(/<!-- video:/g).length, 1);
  assert.deepEqual(readSeen(again), new Set(["84140", "84087"]));
});

test("writeVideoState 後 writeSeen 還正常，video 註解留著", () => {
  const body = writeVideoState("追蹤\n\n<!-- seen:1,2 -->", new Map([["5", { n: 1, done: false }]]));
  const out = writeSeen(body, ["1", "2", "3"]);
  assert.deepEqual(readSeen(out), new Set(["1", "2", "3"]));
  assert.deepEqual(readVideoState(out), new Map([["5", { n: 1, done: false }]]));
  assert.equal(out.match(/<!-- seen:/g).length, 1);
  assert.ok(out.trimEnd().endsWith("-->"));
});

test("沒有註解時 read 回空、write 附加在最後", () => {
  assert.equal(readVideoState("").size, 0);
  assert.equal(readVideoState(undefined).size, 0);
  const out = writeVideoState("內文", new Map([["9", { n: 1, done: false }]]));
  assert.match(out, /<!-- video:9=1 -->/);
  assert.deepEqual(readVideoState(out).get("9"), { n: 1, done: false });
});

test("pendingVideos：排除 done、n=3、8 天前、不做片的；舊的先", () => {
  const now = Date.UTC(2026, 10, 13, 4, 0); // 台北 11/13 12:00
  const r = (id, title, startDate) => ({ bullentinId: id, title, startDate });
  const rows = [
    r("5", "【閃亮彗星】新外觀", "2026/11/13"),
    r("2", "【轉蛋】新一期", "2026/11/10"),
    r("3", "【轉蛋】已做", "2026/11/11"),
    r("4", "【轉蛋】失敗三次", "2026/11/11"),
    r("1", "【轉蛋】太舊", "2026/11/05"),
    r("6", "《例行維護開機公告》", "2026/11/12"),
    r("7", "【轉蛋】剛好七天", "2026/11/06"),
  ];
  const state = new Map([["3", { n: 1, done: true }], ["4", { n: 3, done: false }]]);
  assert.deepEqual(pendingVideos(rows, state, now).map(x => x.bullentinId), ["7", "2", "5"]);
});

test("writeVideoState：最多留 id 最新的 200 則", () => {
  const state = new Map();
  for (let i = 1; i <= 250; i++) state.set(String(80000 + i), { n: 0, done: true });
  const back = readVideoState(writeVideoState("x", state));
  assert.equal(back.size, 200);
  assert.ok(back.has("80250") && back.has("80051") && !back.has("80050") && !back.has("80001"));
});
