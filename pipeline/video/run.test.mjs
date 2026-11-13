import test from "node:test";
import assert from "node:assert/strict";
import { run, shortReason } from "./run.mjs";
import { readVideoState } from "./lib/pick.mjs";

const REPO = "clarkher/maplestory-tool";
const NOW = Date.UTC(2026, 10, 13, 4); // 台北 11/13 中午
const ROWS = [
  { bullentinId: "84001", title: "【活動】楓葉商會開張", startDate: "2026/11/10" },
  { bullentinId: "84002", title: "【閃亮彗星】新外觀", startDate: "2026/11/11" },
  { bullentinId: "84003", title: "【活動】橘子週年慶", startDate: "2026/11/12" },
  { bullentinId: "84004", title: "11/13 例行維護", startDate: "2026/11/12" },
];

function deps({ body = "說明\n\n<!-- seen:84001,84002,84003 -->", makeFails = {}, env = {}, failComment = false } = {}) {
  const log = [];
  let issueBody = body;
  const made = [];
  const call = async (method, url, payload) => {
    log.push({ method, url, payload });
    if (method === "POST" && url.endsWith("/comments") && failComment) throw new Error("POST → HTTP 502：bad gateway");
    if (method === "GET" && url.includes("/issues?")) return [{ number: 313, body: issueBody }];
    if (method === "GET" && url.endsWith("/issues/313")) return { number: 313, body: issueBody + "\n<!-- fresh -->" };
    if (method === "POST" && url.endsWith("/comments")) return {};
    if (method === "PATCH") { issueBody = payload.body; return {}; }
    throw new Error(`沒想到的呼叫 ${method} ${url}`);
  };
  return {
    log, made,
    get body() { return issueBody; },
    opts: {
      env: { GITHUB_REPOSITORY: REPO, ...env },
      now: NOW,
      call,
      fetchBulletins: async () => ROWS,
      make: async (id) => {
        made.push(id);
        if (makeFails[id]) { const e = new Error(makeFails[id].msg); if (makeFails[id].permanent) e.permanent = true; throw e; }
        return { title: `片 ${id}`, files: [`/x/${id}/main.mp4`] };
      },
      releaseExists: async () => false,
      upsertRelease: async (id) => ({ htmlUrl: `https://github.com/${REPO}/releases/tag/video-${id}`, assetUrls: { "cover.png": `https://x/video-${id}/cover.png` } }),
      log: () => {},
    },
  };
}

test("run：三則中第二則失敗 → 一、三 done，第二則 n=1，每則做完各存一次＋最後一次，維護不做", async () => {
  const d = deps({ makeFails: { 84002: { msg: "配音不過" } } });
  await run(d.opts);
  assert.deepEqual(d.made, ["84001", "84002", "84003"]);
  const patches = d.log.filter((c) => c.method === "PATCH");
  assert.equal(patches.length, 4);
  const s = readVideoState(d.body);
  assert.deepEqual(s.get("84001"), { n: 0, done: true });
  assert.deepEqual(s.get("84003"), { n: 0, done: true });
  assert.deepEqual(s.get("84002"), { n: 1, done: false });
  // 成功的兩則留言、失敗第一次不留言
  const comments = d.log.filter((c) => c.method === "POST" && c.url.endsWith("/comments"));
  assert.equal(comments.length, 2);
  // PATCH 前重讀 issue，內文用最新的（announce-watch 可能剛改過 seen）
  assert.ok(d.body.includes("<!-- fresh -->"));
  assert.ok(d.body.includes("<!-- seen:84001,84002,84003 -->"));
});

test("run：第 3 次失敗才留言說沒做片", async () => {
  const d = deps({ body: "x\n\n<!-- video:84002=2 -->\n\n<!-- seen:1 -->", makeFails: { 84002: { msg: "配音不過" } } });
  await run(d.opts);
  const comments = d.log.filter((c) => c.method === "POST" && c.url.endsWith("/comments")).map((c) => c.payload.body);
  assert.ok(comments.some((b) => b.includes("沒做片") && b.includes("配音不過")));
  assert.deepEqual(readVideoState(d.body).get("84002"), { n: 3, done: false });
});

test("run：只有標題（permanent）第一次就記滿 3 次、留言", async () => {
  const d = deps({ makeFails: { 84001: { msg: "只有標題，沒有內文可以做片", permanent: true } } });
  await run(d.opts);
  assert.deepEqual(readVideoState(d.body).get("84001"), { n: 3, done: false });
  const comments = d.log.filter((c) => c.method === "POST" && c.url.endsWith("/comments")).map((c) => c.payload.body);
  assert.ok(comments.some((b) => b.includes("只有標題")));
});

test("run：DRY_RUN 只印，不做片、不留言、不 PATCH", async () => {
  const d = deps({ env: { DRY_RUN: "true" } });
  await run(d.opts);
  assert.deepEqual(d.made, []);
  assert.ok(!d.log.some((c) => c.method !== "GET"));
});

test("run：BULLETIN_ID 只做那則、建 release，不留言、不改 issue", async () => {
  const d = deps({ env: { BULLETIN_ID: "84192" } });
  let released = null;
  d.opts.upsertRelease = async (id, title) => { released = { id, title }; return { htmlUrl: "u", assetUrls: {} }; };
  await run(d.opts);
  assert.deepEqual(d.made, ["84192"]);
  assert.deepEqual(released, { id: "84192", title: "片 84192" });
  assert.ok(!d.log.some((c) => c.method !== "GET"));
});

test("run：BULLETIN_ID 失敗 → 丟錯（workflow 變紅）", async () => {
  const d = deps({ env: { BULLETIN_ID: "84192" }, makeFails: { 84192: { msg: "只有標題，沒有內文可以做片", permanent: true } } });
  await assert.rejects(() => run(d.opts), /只有標題/);
  assert.ok(!d.log.some((c) => c.method !== "GET"));
});

test("run：沒有要做的就不 PATCH", async () => {
  const d = deps({ body: "x\n\n<!-- video:84001=done,84002=done,84003=done -->" });
  await run(d.opts);
  assert.deepEqual(d.made, []);
  assert.ok(!d.log.some((c) => c.method === "PATCH"));
});

test("run：留言 POST 丟錯 → 照樣記狀態", async () => {
  const d = deps({ failComment: true, body: "x\n\n<!-- video:84002=2 -->", makeFails: { 84002: { msg: "配音不過" } } });
  await run(d.opts);
  assert.ok(d.log.filter((c) => c.method === "PATCH").length >= 1);
  const s = readVideoState(d.body);
  assert.deepEqual(s.get("84001"), { n: 0, done: true });
  assert.deepEqual(s.get("84002"), { n: 3, done: false });
  assert.deepEqual(s.get("84003"), { n: 0, done: true });
});

test("run：make 以外的錯（例如 release 失敗）也記次數；PATCH 本身在 finally", async () => {
  const d = deps();
  d.opts.upsertRelease = async () => { throw new Error("POST → HTTP 500"); };
  await run(d.opts);
  const s = readVideoState(d.body);
  assert.deepEqual([...s.values()].map((v) => v.n), [1, 1, 1]);
});

test("run：超過時間預算就不開新的一則，已做的照記", async () => {
  const d = deps();
  let t = 0;
  d.opts.clock = () => t;
  d.opts.budgetMs = 100;
  const make = d.opts.make;
  d.opts.make = async (id) => { t += 150; return make(id); };
  await run(d.opts);
  assert.deepEqual(d.made, ["84001"]);
  const s = readVideoState(d.body);
  assert.deepEqual(s.get("84001"), { n: 0, done: true });
  assert.equal(s.has("84002"), false);
});

test("run：BULLETIN_ID 不是數字就丟錯", async () => {
  const d = deps({ env: { BULLETIN_ID: "84140;rm" } });
  await assert.rejects(() => run(d.opts), /BULLETIN_ID/);
  assert.deepEqual(d.made, []);
});

test("shortReason：只留前 3 行、最多 500 字", () => {
  const e = new Error("Command failed: npx render\n\nline2\nline3\nline4 stderr 噪音");
  assert.equal(shortReason(e), "Command failed: npx render / line2 / line3");
  assert.equal(shortReason(new Error("x".repeat(900))).length, 500);
});

test("run：每則做完就存狀態（第二則做到一半被殺，第一則已記 done）", async () => {
  const d = deps();
  let patchesAtSecond = null;
  const make = d.opts.make;
  d.opts.make = async (id) => {
    if (id === "84002") patchesAtSecond = readVideoState(d.body).get("84001");
    return make(id);
  };
  await run(d.opts);
  assert.deepEqual(patchesAtSecond, { n: 0, done: true });
});

test("run：已經有完整發布頁 → 不重做、不留言，直接記 done", async () => {
  const d = deps();
  d.opts.releaseExists = async (tag) => tag === "video-84002";
  await run(d.opts);
  assert.deepEqual(d.made, ["84001", "84003"]);
  assert.deepEqual(readVideoState(d.body).get("84002"), { n: 0, done: true });
  const comments = d.log.filter((c) => c.method === "POST" && c.url.endsWith("/comments"));
  assert.equal(comments.length, 2);
});

test("run：額度／權限錯誤（401、403、429）→ 整班停下，這則不扣次數、後面的不做", async () => {
  for (const status of [401, 403, 429]) {
    const d = deps();
    const make = d.opts.make;
    d.opts.make = async (id) => {
      if (id === "84002") { const e = new Error(`Azure ${status}: quota`); e.status = status; throw e; }
      return make(id);
    };
    await run(d.opts);
    assert.deepEqual(d.made, ["84001"]);
    const s = readVideoState(d.body);
    assert.deepEqual(s.get("84001"), { n: 0, done: true });
    assert.equal(s.has("84002"), false);
    assert.equal(s.has("84003"), false);
  }
});
