import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("goTopics：段數不到 2 或超過 8 的先濾掉（11/25 前 6 個全是 15～21 段，兩個時段都空）", async () => {
  const { goTopics } = await import("./series/topics.mjs");
  const graph = {};
  for (let i = 1; i < 12; i++) graph[i] = [[i + 1, "e"]];
  const ids = [12, 10, 9, 3, 2, 99];
  const training = ids.map((m, i) => ({ m, eff: 100 - i }));
  const nearest = Object.fromEntries(ids.map((m) => [m, [1, 0]]));
  assert.deepEqual(goTopics({ training, nearest, graph }).map((t) => t.key), ["go-9", "go-3"]); // 8 段、2 段；11、9、1 段跟走不到的不要
});

test("goTopics：站上真的資料，太長的不在清單、能做的還有很多", async () => {
  const { goTopics } = await import("./series/topics.mjs");
  const keys = goTopics().map((t) => t.key);
  for (const k of ["go-105090311", "go-105090000", "go-211041600"]) assert.ok(!keys.includes(k), k);
  assert.ok(keys.includes("go-211040000")); // 4 段，做過片
  assert.ok(keys.length > 100);
});

test("planDay：候選不設上限，排在後面的也挑得到", () => {
  const gos = Array.from({ length: 30 }, (_, i) => ({ key: `go-${i}` }));
  const p = planDay("2026-11-26", new Set(), { mobs: [], gos });
  assert.equal(p.full[0].cands.length, 30);
  assert.equal(p.shorts[1].cands.length, 30);
});

test("runJobs：時段空著要記成失敗（紅燈）", async () => {
  const r = await runWith([{ at: "2026-11-26T04:00:00.000Z", cands: C("a") }, { at: "2026-11-26T13:00:00.000Z", shortsOnly: true, cands: C("a") }], {});
  assert.deepEqual(r.made, ["a"]);
  assert.equal(r.raw.failed.length, 1);
  assert.match(r.raw.failed[0].key, /2026-11-26T13:00/);
  assert.match(r.raw.failed[0].why, /沒有題目可做/);
});

test("runJobs：不適合做的（skip）一路往後找", async () => {
  const ks = Array.from({ length: 20 }, (_, i) => `t${i}`);
  const skip = Object.fromEntries(ks.slice(0, 19).map((k) => [k, Object.assign(new Error("不適合做"), { skip: true })]));
  assert.deepEqual((await runWith([{ at: "x", cands: C(...ks) }], {}, skip)).made, ["t19"]);
});

test("runJobs：做片失敗（截不到、配音不過）6 個就放棄這個時段，網站掛了不要試 200 個", async () => {
  const ks = Array.from({ length: 20 }, (_, i) => `t${i}`);
  const r = await runWith([{ at: "x", cands: C(...ks) }], {}, Object.fromEntries(ks.slice(0, 6).map((k) => [k, new Error("截不到")])));
  assert.deepEqual(r.made, []);
  assert.equal(r.raw.failed.length, 1);
  const ok = await runWith([{ at: "x", cands: C(...ks) }], {}, Object.fromEntries(ks.slice(0, 5).map((k) => [k, new Error("截不到")])));
  assert.deepEqual(ok.made, ["t5"]);
});

const vid = (id, key, { title = "在哪打", status = {}, publishedAt = "2026-11-23T13:40:00Z" } = {}) => ({
  id,
  snippet: { title, description: `https://maplehelper.tw/x?utm_campaign=${key}`, publishedAt },
  status: { privacyStatus: "public", ...status },
});
const SCHED = (publishAt) => ({ privacyStatus: "private", publishAt });
const A = (hhmm) => twIso("2026-11-24", hhmm);

test("filledSlots：第一班排好的（還沒公開看 publishAt）認得出來，第二班只補缺的", async () => {
  const { filledSlots, missingJobs } = await import("./daily.mjs");
  const videos = [
    vid("M", "go-1", { title: "甲怎麼去？", status: SCHED("2026-11-24T04:00:00Z") }),
    vid("S", "go-1", { title: "甲怎麼去？ #Shorts", status: SCHED("2026-11-24T04:00:00Z") }),
    vid("S2", "mob-2", { title: "乙在哪打？ #Shorts", status: SCHED("2026-11-24T01:00:00Z") }),
  ];
  const filled = filledSlots("2026-11-24", videos);
  assert.deepEqual([...filled].sort(), [A("09:00"), A("12:00")].sort());
  const left = missingJobs(planDay("2026-11-24", new Set(), { mobs: [], gos: [] }), filled);
  assert.deepEqual(left.map((j) => [j.at, j.shortsOnly]), [[A("19:00"), false], [A("21:00"), true]]);
});

test("filledSlots：已經公開的看 publishedAt；時段過了才傳、直接公開的也算那一天那個時段", async () => {
  const { filledSlots } = await import("./daily.mjs");
  const f = filledSlots("2026-11-24", [
    vid("M", "mob-3", { title: "丙在哪打？", publishedAt: "2026-11-24T11:00:04Z" }),
    vid("S", "mob-3", { title: "丙在哪打？ #Shorts", publishedAt: "2026-11-24T11:00:04Z" }),
    vid("G", "go-9", { title: "丁怎麼去？ #Shorts", publishedAt: "2026-11-24T14:10:00Z" }),
  ]);
  assert.deepEqual([...f].sort(), [A("19:00"), A("21:00")].sort());
});

test("filledSlots：別天的、私人沒排程的、公告片不算；只有正片傳成的也算（不再補一支）", async () => {
  const { filledSlots } = await import("./daily.mjs");
  const f = filledSlots("2026-11-24", [
    vid("a", "go-1", { status: SCHED("2026-11-25T04:00:00Z") }),
    vid("b", "go-2", { status: { privacyStatus: "private" }, publishedAt: "2026-11-24T04:00:00Z" }),
    vid("c", "video-84077", { status: SCHED("2026-11-24T04:00:00Z") }),
    vid("d", "mob-4", { title: "只有正片", status: SCHED("2026-11-24T11:00:00Z") }),
    vid("e", "go-5", { title: "前一天台灣時間 23:59", publishedAt: "2026-11-23T15:59:00Z" }),
  ]);
  assert.deepEqual([...f], [A("19:00")]);
});

test("filledSlots：同一題正片前一天公開、短影音這天才排，不會誤認成只有短影音的時段", async () => {
  const { filledSlots } = await import("./daily.mjs");
  const f = filledSlots("2026-11-24", [
    vid("a", "go-1", { title: "甲", publishedAt: "2026-11-23T04:00:00Z" }),
    vid("b", "go-1", { title: "甲 #Shorts", status: SCHED("2026-11-24T04:00:00Z") }),
  ]);
  assert.deepEqual([...f], []);
});

test("channelVideos：上傳清單分頁讀完，再 50 支一批讀 status", async () => {
  const { channelVideos } = await import("./daily.mjs");
  const ids = Array.from({ length: 60 }, (_, i) => `v${i}`);
  const asked = [];
  const fetcher = async (url) => {
    const u = new URL(url);
    let body;
    if (u.pathname.endsWith("/channels")) body = { items: [{ contentDetails: { relatedPlaylists: { uploads: "UU" } } }] };
    else if (u.pathname.endsWith("/playlistItems")) {
      const p = Number(u.searchParams.get("pageToken") || 0);
      body = { items: ids.slice(p, p + 50).map((videoId) => ({ contentDetails: { videoId } })), ...(p + 50 < 60 ? { nextPageToken: String(p + 50) } : {}) };
    } else {
      const want = u.searchParams.get("id").split(",");
      asked.push(want.length);
      assert.match(u.searchParams.get("part"), /status/);
      body = { items: want.map((id) => ({ id, snippet: { description: id }, status: {} })) };
    }
    return { ok: true, json: async () => body };
  };
  assert.deepEqual((await channelVideos("t", fetcher)).map((v) => v.id), ids);
  assert.deepEqual(asked, [50, 10]);
});

test("channelVideos：上傳清單兩頁重疊、擠掉幾支（11/25 頻道 73 支只拿到 68 支）→ 換一頁幾支再讀，補齊、不重複", async () => {
  const { channelVideos } = await import("./daily.mjs");
  const ids = Array.from({ length: 73 }, (_, i) => `v${i}`);
  const asked = [];
  const fetcher = async (url) => {
    const u = new URL(url);
    let body;
    if (u.pathname.endsWith("/channels")) body = { items: [{ contentDetails: { relatedPlaylists: { uploads: "UU" } } }] };
    else if (u.pathname.endsWith("/playlistItems")) {
      const size = Number(u.searchParams.get("maxResults"));
      const p = Number(u.searchParams.get("pageToken") || 0);
      // 一頁 50 支時第 2 頁前 5 列是重複的，v50～v54 哪一頁都沒有
      const rows = size === 50 ? [...ids.slice(0, 50), ...ids.slice(10, 15), ...ids.slice(55)] : ids;
      asked.push(size);
      body = { pageInfo: { totalResults: 73 }, items: rows.slice(p, p + size).map((videoId) => ({ contentDetails: { videoId } })), ...(p + size < 73 ? { nextPageToken: String(p + size) } : {}) };
    } else body = { items: u.searchParams.get("id").split(",").map((id) => ({ id, snippet: {}, status: {} })) };
    return { ok: true, json: async () => body };
  };
  const got = (await channelVideos("t", fetcher)).map((v) => v.id);
  assert.deepEqual([...got].sort(), [...ids].sort());
  assert.ok(new Set(asked).size === 2, "補齊就不再換");
});

test("doneFromSite：官網影片區已經有的題目也算做過（頻道清單漏掉也不會重做），別的工具不算", async () => {
  const { doneFromSite } = await import("./daily.mjs");
  const src = [
    '    tool: { href: "/go?to=103000202&from=103000000", text: "地圖導航" },',
    '    tool: { href: "/db/monsters/1110101", text: "黑木妖資料" },',
    '    tool: { href: "/plan/damage", text: "算傷害" },',
  ].join("\n");
  assert.deepEqual([...doneFromSite(src)].sort(), ["go-103000202", "mob-1110101"]);
  const real = doneFromSite(readFileSync(join(import.meta.dirname, "../../src/lib/videos.ts"), "utf8"));
  for (const k of ["go-103000202", "mob-1110101", "mob-2110200"]) assert.ok(real.has(k), k);
});

// 官網影片區：真的 git（本機裸倉庫當 origin），gh 跟 ffmpeg 換成假的
const sitePlayground = () => {
  const root = mkdtempSync(join(tmpdir(), "addsite-"));
  const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const origin = join(root, "origin.git");
  const repo = join(root, "repo");
  g(root, "init", "-q", "--bare", origin);
  g(root, "clone", "-q", origin, repo);
  for (const [k, v] of [["user.name", "t"], ["user.email", "t@t"], ["commit.gpgsign", "false"], ["core.autocrlf", "false"]]) g(repo, "config", k, v);
  mkdirSync(join(repo, "src/lib"), { recursive: true });
  mkdirSync(join(repo, "public/videos"), { recursive: true });
  writeFileSync(join(repo, "public/videos/.keep"), "");
  writeFileSync(join(repo, "src/lib/videos.ts"), "export const EPISODES = [\n];\n");
  g(repo, "checkout", "-q", "-b", "dev");
  g(repo, "add", ".");
  g(repo, "commit", "-q", "-m", "v2.64: 起頭");
  g(repo, "push", "-q", "-u", "origin", "dev");
  const calls = [];
  let open = null; // 開著的 PR
  const gh = (args) => {
    calls.push(args);
    if (args[1] === "list") return args.includes("--head") ? JSON.stringify(open ? [open] : []) : "";
    if (args[1] === "create") {
      if (open) throw new Error("a pull request already exists");
      open = { number: 7, url: "https://x/pull/7", title: args[args.indexOf("--title") + 1], body: args[args.indexOf("--body") + 1] };
      return open.url;
    }
    return "";
  };
  const make = (key, at) => {
    const out = join(root, key);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "site.json"), JSON.stringify({ title: `${key} 怎麼去？`, summary: "s", tool: { href: "/go", text: "地圖導航" } }));
    return { key, title: `${key} 怎麼去？`, at, main: `M${key}`, shorts: `S${key}`, out };
  };
  const run = async (made, date = "2026-11-24") => {
    const { addToSite } = await import("./daily.mjs");
    return addToSite(made, { date, log: () => {}, repo, gh, cover: (_, out) => writeFileSync(out, "webp") });
  };
  const show = (f) => g(origin, "show", `feat/daily-videos-2026-11-24:${f}`);
  return { root, repo, origin, g, calls, make, run, show, close: () => { open = null; } };
};

test("addToSite：第二班在同一條分支上加，不蓋掉第一班的；PR 已經開著就不重開", async () => {
  const p = sitePlayground();
  const url1 = await p.run([p.make("a", A("12:00"))]);
  const url2 = await p.run([p.make("b", A("19:00"))]);
  assert.equal(url1, url2);
  const ts = p.show("src/lib/videos.ts");
  assert.match(ts, /"Sa"/);
  assert.match(ts, /"Sb"/);
  for (const id of ["Ma", "Sa", "Mb", "Sb"]) assert.equal(p.show(`public/videos/${id}.webp`), "webp");
  assert.equal(p.calls.filter((c) => c[1] === "create").length, 1);
  // PR 說明補上第二班的，第一班的留著
  const patch = p.calls.find((c) => c[0] === "api").join(" ");
  assert.match(patch, /a 怎麼去/);
  assert.match(patch, /b 怎麼去/);
  rmSync(p.root, { recursive: true, force: true });
});

test("addToSite：分支已經合進 dev、之後又補一支：從 dev 開，另開 PR", async () => {
  const p = sitePlayground();
  await p.run([p.make("a", A("12:00"))]);
  p.g(p.repo, "fetch", "-q", "origin");
  p.g(p.repo, "merge", "-q", "--no-ff", "-m", "Merge", "origin/feat/daily-videos-2026-11-24");
  writeFileSync(join(p.repo, "new.txt"), "dev 後來的東西");
  p.g(p.repo, "add", ".");
  p.g(p.repo, "commit", "-q", "-m", "v2.70: 別的");
  p.g(p.repo, "push", "-q", "origin", "dev");
  p.close();
  await p.run([p.make("b", A("19:00"))]);
  assert.match(p.show("new.txt"), /後來/);
  assert.equal(p.show("src/lib/videos.ts").match(/"Sa"/g).length, 1);
  assert.match(p.show("src/lib/videos.ts"), /"Sb"/);
  assert.equal(p.calls.filter((c) => c[1] === "create").length, 2);
  rmSync(p.root, { recursive: true, force: true });
});

test("addToSite：全部都在影片區了就不開空的 commit", async () => {
  const p = sitePlayground();
  await p.run([p.make("a", A("12:00"))]);
  const head = p.g(p.origin, "rev-parse", "feat/daily-videos-2026-11-24");
  assert.equal(await p.run([p.make("a", A("12:00"))]), null);
  assert.equal(p.g(p.origin, "rev-parse", "feat/daily-videos-2026-11-24"), head);
  rmSync(p.root, { recursive: true, force: true });
});

test("exitProblems：時段都排好了（第二班沒事做）是綠燈；有失敗、或有時段要做卻一支都沒有是紅燈", async () => {
  const { exitProblems } = await import("./daily.mjs");
  assert.deepEqual(exitProblems({ jobs: 0, made: [], failed: [] }), []);
  assert.equal(exitProblems({ jobs: 2, made: [], failed: [] }).length, 1);
  assert.deepEqual(exitProblems({ jobs: 2, made: [], failed: [], dryRun: true }), []);
  assert.match(exitProblems({ jobs: 2, made: [{}], failed: [{ key: "a", why: "w" }] })[0], /a（w）/);
});
