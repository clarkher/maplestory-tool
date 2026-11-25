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

test("planDay：2 個正片＋短影音、2 個只有短影音（一天 6 支，留給公告片），做過的不挑", () => {
  const mobs = ["mob-1", "mob-2", "mob-3"].map((key) => ({ key }));
  const gos = ["go-1", "go-2"].map((key) => ({ key }));
  const p = planDay("2026-11-18", new Set(["mob-1"]), { mobs, gos });
  assert.equal(p.full.length, 2);
  assert.equal(p.shorts.length, 2);
  assert.equal(p.full[0].cands[0].key, "go-1");
  assert.equal(p.full[1].cands[0].key, "mob-2");
  assert.equal(p.full[1].at, "2026-11-18T11:00:00.000Z");
  const times = [...p.full, ...p.shorts].map((x) => x.at);
  assert.equal(new Set(times).size, 4);
});

test("nextVersion：dev 的 commit 跟開著的 PR 取最大再加 1", async () => {
  const { nextVersion } = await import("./daily.mjs");
  assert.equal(nextVersion("v2.32: 影片區\nMerge pull request\nv2.34: 每日影片\nv2.33: 加一集"), "v2.35");
  assert.equal(nextVersion("v2.09: a"), "v2.10");
  assert.equal(nextVersion("沒有版號"), "v0.00");
});

test("targetDateTw：21:30 跑做明天；排程晚到隔天清晨也做當天，不整天跳過", async () => {
  const { targetDateTw } = await import("./daily.mjs");
  assert.equal(targetDateTw(Date.parse("2026-11-18T13:30:00Z")), "2026-11-19"); // 台灣 11/18 21:30
  assert.equal(targetDateTw(Date.parse("2026-11-18T21:30:00Z")), "2026-11-19"); // 台灣 11/19 05:30（11/18 那班晚 8 小時）
  assert.equal(targetDateTw(Date.parse("2026-11-18T16:30:00Z")), "2026-11-19"); // 台灣 11/19 00:30
});

test("publishTime：時間還沒到才排程，過了（或 20 分鐘內）直接公開", async () => {
  const { publishTime } = await import("./daily.mjs");
  const now = Date.parse("2026-11-19T01:00:00Z");
  assert.equal(publishTime("2026-11-19T04:00:00.000Z", now), "2026-11-19T04:00:00.000Z");
  assert.equal(publishTime("2026-11-19T01:00:00.000Z", now), null);
  assert.equal(publishTime("2026-11-19T01:10:00.000Z", now), null);
});

test("isOutOfCredit：Inworld 402、額度 429 要整班停；一般錯誤不停、題目編號裡的數字不算", async () => {
  const { isOutOfCredit } = await import("./daily.mjs");
  assert.ok(isOutOfCredit('Inworld TTS 失敗 402：{"message":"You have no credits remaining."}'));
  assert.ok(isOutOfCredit("HTTP 429 quotaExceeded"));
  assert.ok(!isOutOfCredit("go-105090311 不適合做（20 段）"));
  assert.ok(!isOutOfCredit("mob-1402000 找不到刷怪點"));
});

const ytError = (status, reason, main) => Object.assign(new Error(`YouTube 開始上傳 → HTTP ${status}：${reason}`), { status, reason, main });
const runWith = async (jobs, errs, makeErrs = {}) => {
  const { runJobs } = await import("./daily.mjs");
  const tried = [];
  const r = await runJobs({
    jobs,
    done: new Set(),
    make: async (t) => { if (makeErrs[t.key]) throw makeErrs[t.key]; return { key: t.key }; },
    upload: async (res) => { tried.push(res.key); if (errs[res.key]) throw errs[res.key]; return { key: res.key }; },
    partial: (res, j, main) => ({ key: res.key, main, shorts: null }),
    log: () => {},
  });
  return { tried, made: r.made.map((v) => v.key), failed: r.failed.map((f) => f.key), raw: r };
};
const C = (...ks) => ks.map((key) => ({ key }));

test("runJobs：一支的說明被 YouTube 退，換同一時段的下一個題目，後面的照做，但記成失敗（整批紅燈）", async () => {
  const jobs = [{ cands: C("mob-1", "mob-2", "mob-3") }, { cands: C("mob-1", "mob-2", "mob-3") }, { cands: C("go-1") }];
  const r = await runWith(jobs, { "mob-1": ytError(400, "invalidDescription") });
  assert.deepEqual(r.tried, ["mob-1", "mob-2", "mob-3", "go-1"]);
  assert.deepEqual(r.made, ["mob-2", "mob-3", "go-1"]);
  assert.deepEqual(r.failed, ["mob-1"]);
});

test("runJobs：標題被退也是跳過那支", async () => {
  const r = await runWith([{ cands: C("a", "b") }], { a: ytError(400, "invalidTitle") });
  assert.deepEqual([r.made, r.failed], [["b"], ["a"]]);
});

test("runJobs：傳片上限、額度、登入失效換題目也沒用，整班停", async () => {
  for (const e of [ytError(400, "uploadLimitExceeded"), ytError(403, "quotaExceeded"), ytError(401, "authError"), new Error("fetch failed")]) {
    const r = await runWith([{ cands: C("a", "b") }, { cands: C("c") }], { a: e });
    assert.deepEqual([r.tried, r.made, r.failed], [["a"], [], ["a"]]);
  }
});

test("runJobs：正片傳上去、短影音被退：記下正片，不補題目，後面的時段照做", async () => {
  const r = await runWith([{ cands: C("a", "b") }, { cands: C("c") }], { a: ytError(400, "invalidTitle", "MAIN") });
  assert.deepEqual(r.tried, ["a", "c"]);
  assert.deepEqual(r.raw.made[0], { key: "a", main: "MAIN", shorts: null });
  assert.deepEqual([r.made, r.failed], [["a", "c"], ["a"]]);
});

test("runJobs：做片不適合的換下一個不算失敗；配音點數用完整班停、算失敗", async () => {
  const a = await runWith([{ cands: C("a", "b") }], {}, { a: new Error("a 不適合做（20 段）") });
  assert.deepEqual([a.made, a.failed], [["b"], []]);
  const b = await runWith([{ cands: C("a", "b") }, { cands: C("c") }], {}, { a: new Error("Inworld TTS 失敗 402") });
  assert.deepEqual([b.made, b.failed], [[], ["a"]]);
});
