import test from "node:test";
import assert from "node:assert/strict";
import { doneFromDescriptions, planDay, tomorrowTw, twIso } from "./daily.mjs";

test("tomorrowTw：照台灣時間算明天", () => {
  assert.equal(tomorrowTw(Date.parse("2026-11-17T15:30:00Z")), "2026-11-18"); // 台灣 11/17 23:30
  assert.equal(tomorrowTw(Date.parse("2026-11-17T16:30:00Z")), "2026-11-19"); // 台灣 11/18 00:30
});

test("twIso：台灣時間轉 UTC", () => {
  assert.equal(twIso("2026-11-18", "19:00"), "2026-11-18T11:00:00.000Z");
});

test("doneFromDescriptions：說明欄的 utm_campaign 加上手做的那幾集", () => {
  const done = doneFromDescriptions(["https://maplehelper.tw/db/monsters/210100?utm_source=youtube&utm_medium=video&utm_campaign=mob-210100\n…", "公告片 utm_campaign=video-84077"]);
  assert.ok(done.has("mob-210100"));
  assert.ok(done.has("mob-2230101")); // 手做的殭屍菇菇
  assert.ok(!done.has("video-84077"));
});

test("planDay：2 個正片＋短影音、4 個只有短影音，做過的不挑", () => {
  const mobs = ["mob-1", "mob-2", "mob-3"].map((key) => ({ key }));
  const gos = ["go-1", "go-2"].map((key) => ({ key }));
  const p = planDay("2026-11-18", new Set(["mob-1"]), { mobs, gos });
  assert.equal(p.full.length, 2);
  assert.equal(p.shorts.length, 4);
  assert.equal(p.full[0].cands[0].key, "go-1");
  assert.equal(p.full[1].cands[0].key, "mob-2");
  assert.equal(p.full[1].at, "2026-11-18T11:00:00.000Z");
  const times = [...p.full, ...p.shorts].map((x) => x.at);
  assert.equal(new Set(times).size, 6);
});

test("nextVersion：dev 的 commit 跟開著的 PR 取最大再加 1", async () => {
  const { nextVersion } = await import("./daily.mjs");
  assert.equal(nextVersion("v2.32: 影片區\nMerge pull request\nv2.34: 每日影片\nv2.33: 加一集"), "v2.35");
  assert.equal(nextVersion("v2.09: a"), "v2.10");
  assert.equal(nextVersion("沒有版號"), "v0.00");
});
