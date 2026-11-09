import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { INDEXNOW_HOST, INDEXNOW_KEY } from "../../scripts/indexnow-key.mjs";
import { BATCH, DEPLOY_CHECK, chunk, keepOwnUrls, main, parseLocs, payload, submit, waitForDeploy } from "../../scripts/indexnow.mjs";

// IndexNow（v1.90）：main 合併、正式機部署完之後把網址通知 Bing。這裡鎖住：只送正式網域、dry-run 一筆都不送、
// 金鑰檔跟常數一致、沒等到部署成功不送、workflow 只在 main 觸發
const ROOT = path.join(import.meta.dirname, "../..");
const quiet = () => {};

/** 假的 fetch：記下每次呼叫，照網址回應 */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET", body: init.body });
    for (const [match, respond] of routes) if (String(url).includes(match)) return respond(String(url), init);
    return new Response("not found", { status: 404 });
  };
  fn.calls = calls;
  return fn;
}

const sitemap = urls => `<?xml version="1.0"?><urlset>${urls.map(u => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;

test("金鑰：32 位英數，public/<金鑰>.txt 內容就是金鑰（不換行）", () => {
  assert.match(INDEXNOW_KEY, /^[A-Za-z0-9]{32}$/);
  const file = path.join(ROOT, "public", `${INDEXNOW_KEY}.txt`);
  assert.ok(fs.existsSync(file), `public/${INDEXNOW_KEY}.txt 要存在`);
  assert.equal(fs.readFileSync(file, "utf8"), INDEXNOW_KEY);
});

test("正式網域跟 SITE_URL 一致", () => {
  const seo = fs.readFileSync(path.join(ROOT, "src/lib/seo.ts"), "utf8");
  assert.match(seo, new RegExp(`SITE_URL = "https://${INDEXNOW_HOST.replace(".", "\\.")}"`));
});

test("sitemap 解析：還原 &amp;，只留 https://maplehelper.tw，去重", () => {
  const locs = parseLocs(sitemap(["https://maplehelper.tw/a?x=1&amp;y=2", "https://maplehelper.tw/b"]));
  assert.deepEqual(locs, ["https://maplehelper.tw/a?x=1&y=2", "https://maplehelper.tw/b"]);
  const kept = keepOwnUrls([
    "https://maplehelper.tw/a",
    "https://maplehelper.tw/a",
    "http://maplehelper.tw/c",
    "https://maplehelper-dev.pipicards.workers.dev/a",
    "https://www.maplehelper.tw/a",
    "https://maplehelper.tw.evil.example/a",
    "不是網址",
  ]);
  assert.deepEqual(kept, ["https://maplehelper.tw/a"]);
});

test("一批最多 10,000 筆", () => {
  assert.equal(BATCH, 10_000);
  const parts = chunk(Array.from({ length: 23_456 }, (_, i) => i));
  assert.deepEqual(parts.map(p => p.length), [10_000, 10_000, 3_456]);
  const body = payload(["https://maplehelper.tw/"]);
  assert.deepEqual(body, { host: "maplehelper.tw", key: INDEXNOW_KEY, keyLocation: `https://maplehelper.tw/${INDEXNOW_KEY}.txt`, urlList: ["https://maplehelper.tw/"] });
});

test("--dry-run 只讀 sitemap 跟金鑰檔狀態，絕不 POST", async () => {
  const fetch = fakeFetch([
    ["/sitemap.xml", () => new Response(sitemap(["https://maplehelper.tw/", "https://maplehelper.tw/plan/boss", "https://example.com/x"]))],
    [`/${INDEXNOW_KEY}.txt`, () => new Response("not found", { status: 404 })],
  ]);
  const result = await main(["--dry-run"], { fetch, log: quiet, env: {} });
  assert.deepEqual(result, { count: 2, batches: 1, sent: 0 });
  assert.equal(fetch.calls.filter(c => c.method === "POST").length, 0);
  assert.equal(fetch.calls.some(c => c.url.includes("indexnow.org")), false);
});

test("真送：金鑰檔不是 200 就不送（還沒上正式機會被拒）", async () => {
  const fetch = fakeFetch([
    ["/sitemap.xml", () => new Response(sitemap(["https://maplehelper.tw/"]))],
    [`/${INDEXNOW_KEY}.txt`, () => new Response("not found", { status: 404 })],
  ]);
  await assert.rejects(main([], { fetch, log: quiet, sleep: async () => {}, env: {} }), /金鑰檔/);
  assert.equal(fetch.calls.filter(c => c.method === "POST").length, 0);
});

test("真送：金鑰檔對了才 POST 到 api.indexnow.org，帶 host／key／keyLocation／urlList", async () => {
  const fetch = fakeFetch([
    ["/sitemap.xml", () => new Response(sitemap(["https://maplehelper.tw/", "https://maplehelper.tw/plan/boss"]))],
    [`/${INDEXNOW_KEY}.txt`, () => new Response(INDEXNOW_KEY)],
    ["api.indexnow.org", () => new Response("", { status: 202 })],
  ]);
  const result = await main([], { fetch, log: quiet, env: {} });
  assert.equal(result.sent, 2);
  const posts = fetch.calls.filter(c => c.method === "POST");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, "https://api.indexnow.org/indexnow");
  assert.deepEqual(JSON.parse(posts[0].body).urlList, ["https://maplehelper.tw/", "https://maplehelper.tw/plan/boss"]);
});

test("sitemap 裡沒有正式網域的網址就失敗、不送", async () => {
  const fetch = fakeFetch([["/sitemap.xml", () => new Response(sitemap(["https://maplehelper-dev.pipicards.workers.dev/"]))]]);
  await assert.rejects(main(["--dry-run"], { fetch, log: quiet, env: {} }), /沒有 maplehelper\.tw/);
});

test("IndexNow 回 403／422／429 算失敗", async () => {
  for (const status of [403, 422, 429]) {
    const fetch = fakeFetch([["api.indexnow.org", () => new Response("no", { status })]]);
    await assert.rejects(submit(["https://maplehelper.tw/"], { dryRun: false, fetch, log: quiet }), new RegExp(`HTTP ${status}`));
  }
});

test("等部署：check-run 還沒出現／進行中就等，成功才往下；失敗、逾時丟錯", async () => {
  const sha = "1592991b".padEnd(40, "0");
  const seq = [{ check_runs: [] }, { check_runs: [{ status: "in_progress" }] }, { check_runs: [{ status: "completed", conclusion: "success" }] }];
  const fetch = fakeFetch([["check-runs", () => Response.json(seq.shift())]]);
  let slept = 0;
  assert.equal(await waitForDeploy({ sha, repo: "clarkher/maplestory-tool", token: "t", fetch, sleep: async () => slept++, log: quiet }), true);
  assert.equal(slept, 2);
  assert.ok(fetch.calls[0].url.includes(`check_name=${encodeURIComponent(DEPLOY_CHECK)}`));
  assert.equal(DEPLOY_CHECK, "Workers Builds: maplehelper");

  const failed = fakeFetch([["check-runs", () => Response.json({ check_runs: [{ status: "completed", conclusion: "failure" }] })]]);
  await assert.rejects(waitForDeploy({ sha, repo: "r/r", fetch: failed, sleep: async () => {}, log: quiet }), /沒成功/);

  const stuck = fakeFetch([["check-runs", () => Response.json({ check_runs: [{ status: "queued" }] })]]);
  await assert.rejects(waitForDeploy({ sha, repo: "r/r", fetch: stuck, sleep: async () => {}, intervalMs: 1, timeoutMs: 3, log: quiet }), /還沒結束/);

  await assert.rejects(waitForDeploy({ sha: "$(whoami)", repo: "r/r", fetch, sleep: async () => {}, log: quiet }), /格式不對/);
});

test("--wait-deploy：部署失敗就整個停，不讀 sitemap、不送", async () => {
  const fetch = fakeFetch([["check-runs", () => Response.json({ check_runs: [{ status: "completed", conclusion: "cancelled" }] })]]);
  await assert.rejects(main(["--wait-deploy", "a".repeat(40)], { fetch, log: quiet, sleep: async () => {}, env: { GITHUB_TOKEN: "t" } }));
  assert.equal(fetch.calls.some(c => c.url.includes("sitemap") || c.method === "POST"), false);
});

test("workflow：只在 main 推送（或手動）觸發、權限只讀、等部署再送、不是 dry-run", () => {
  const raw = fs.readFileSync(path.join(ROOT, ".github/workflows/indexnow.yml"), "utf8").replace(/\r\n/g, "\n");
  const code = raw.replace(/(^|[ \t])#.*$/gm, "").replace(/[ \t]+$/gm, "").replace(/^\n/gm, "");
  assert.match(code, /\non:\n  push:\n    branches: \[main\]\n  workflow_dispatch:\n/);
  assert.doesNotMatch(code, /\bdev\b/);
  assert.doesNotMatch(code, /pull_request/);
  assert.match(code, /\npermissions:\n  contents: read\n  checks: read\n(?! )/);
  assert.doesNotMatch(code, /\bwrite\b/);
  assert.match(code, /persist-credentials: false/);
  assert.match(code, /run: node scripts\/indexnow\.mjs --wait-deploy "\$SHA"/);
  assert.doesNotMatch(code, /--dry-run/);
});
