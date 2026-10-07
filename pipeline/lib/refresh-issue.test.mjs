import test from "node:test";
import assert from "node:assert/strict";
import { errorTail, failedStepName, planAction, issueKeys, failureBody, recoveredBody, notifyRefresh } from "./refresh-issue.mjs";

const ESC = "\x1b";

/**
 * 組出 GitHub Actions 下載回來的 job log 的樣子：開頭有 BOM、每行前面有時間戳、CRLF 換行、
 * 步驟標頭的指令有顏色碼。
 */
function actionsLog(lines) {
  return "﻿" + lines.map((line, i) => `2026-10-03T05:27:${String(i % 60).padStart(2, "0")}.1234567Z ${line}`).join("\r\n");
}

// 2026-10-03 排程失敗那次（run 37099846007）的真實 log，掐頭去尾：取得 Artale 資料那一步丟錯
const FETCH_FAILURE = actionsLog([
  "##[group]Run actions/checkout@v4",
  "with:",
  "  repository: clarkher/maplestory-tool",
  "  token: ***",
  "##[endgroup]",
  "Syncing repository: clarkher/maplestory-tool",
  "##[group]Run node pipeline/fetch-artale.mjs",
  `${ESC}[36;1mnode pipeline/fetch-artale.mjs${ESC}[0m`,
  "shell: /usr/bin/bash -e {0}",
  "##[endgroup]",
  "[artale] 本機無抽檔資料，改用上游：https://github.com/morrisrrrrrrr-svg/morrisrrrrrrr-svg.github.io.git",
  "Cloning into '/home/runner/work/maplestory-tool/maplestory-tool/data/cache/upstream'...",
  "Updating files:  82% (13354/16277)",
  "Updating files:  83% (13510/16277)",
  "Updating files:  92% (14975/16277)",
  "Updating files:  99% (16115/16277)",
  "Updating files: 100% (16277/16277)",
  "Updating files: 100% (16277/16277), done.",
  "file:///home/runner/work/maplestory-tool/maplestory-tool/pipeline/fetch-artale.mjs:41",
  '  if (!fs.existsSync(dropsPath)) throw new Error("上游 repo 沒有 drops.json，格式可能改了");',
  "                                       ^",
  "",
  "Error: 上游 repo 沒有 drops.json，格式可能改了",
  "    at main (file:///home/runner/work/maplestory-tool/maplestory-tool/pipeline/fetch-artale.mjs:41:40)",
  "    at file:///home/runner/work/maplestory-tool/maplestory-tool/pipeline/fetch-artale.mjs:88:1",
  "    at ModuleJob.run (node:internal/modules/esm/module_job:343:25)",
  "    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:681:26)",
  "    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:117:5)",
  "",
  "Node.js v22.23.3",
  "##[error]Process completed with exit code 1.",
  "Post job cleanup.",
  "[command]/usr/bin/git version",
  "git version 2.55.0",
  "Cleaning up orphan processes",
  "##[warning]Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@v4, actions/setup-node@v4.",
]);

test("取得上游失敗那次（10/03 真實 log）：抓到的是失敗那一步自己的輸出，從第一行到 Node 版本那行", () => {
  const tail = errorTail(FETCH_FAILURE);
  assert.equal(tail[0], "[artale] 本機無抽檔資料，改用上游：https://github.com/morrisrrrrrrr-svg/morrisrrrrrrr-svg.github.io.git");
  assert.ok(tail.includes("Error: 上游 repo 沒有 drops.json，格式可能改了"));
  assert.equal(tail.at(-1), "Node.js v22.23.3");
});

test("不含時間戳、顏色碼、步驟標頭、Process completed 那行，也不含後面的收尾與警告", () => {
  const tail = errorTail(FETCH_FAILURE).join("\n");
  assert.ok(tail.includes("Error: 上游 repo 沒有 drops.json"), "要抓到錯誤本身");
  assert.doesNotMatch(tail, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  assert.ok(!tail.includes(ESC));
  assert.ok(!tail.includes("﻿"));
  assert.ok(!tail.includes("\r"));
  for (const noise of ["shell: /usr/bin/bash", "##[", "Process completed", "Post job cleanup", "git version", "Node.js 20 is deprecated", "Syncing repository"]) {
    assert.ok(!tail.includes(noise), `不該有「${noise}」`);
  }
});

test("進度條（Updating files: 82%…100%）只留最後一行；數字不同但不是進度的訊息照樣全留", () => {
  const tail = errorTail(FETCH_FAILURE);
  assert.deepEqual(
    tail.filter(line => line.startsWith("Updating files:")),
    ["Updating files: 100% (16277/16277)", "Updating files: 100% (16277/16277), done."],
  );

  const log = actionsLog([
    "##[group]Run node pipeline/verify.mjs",
    "shell: /usr/bin/bash -e {0}",
    "##[endgroup]",
    "  FAIL 怪物數量合理（僅已開放） — 96 隻",
    "  FAIL 道具數量合理 — 9821 個",
    "##[error]Process completed with exit code 1.",
  ]);
  assert.deepEqual(errorTail(log), ["  FAIL 怪物數量合理（僅已開放） — 96 隻", "  FAIL 道具數量合理 — 9821 個"]);
});

test("超過 maxLines 只留最後幾行", () => {
  assert.deepEqual(errorTail(FETCH_FAILURE, { maxLines: 3 }), [
    "    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:117:5)",
    "",
    "Node.js v22.23.3",
  ]);
});

test("首頁真資料檢查那種：中間有 ##[error] 標註、失敗摘要在後面，一樣抓到 Process completed 為止", () => {
  const log = actionsLog([
    "##[group]Run npx vitest run src/lib/__tests__/now-plan-realdata.test.ts",
    `${ESC}[36;1mnpx vitest run src/lib/__tests__/now-plan-realdata.test.ts${ESC}[0m`,
    "shell: /usr/bin/bash -e {0}",
    "##[endgroup]",
    " FAIL  src/lib/__tests__/now-plan-realdata.test.ts > 劍士 30 等主推都有",
    "##[error]AssertionError: expected undefined to be truthy",
    " Test Files  1 failed (1)",
    "      Tests  1 failed | 40 passed (41)",
    "##[error]Process completed with exit code 1.",
  ]);
  assert.deepEqual(errorTail(log), [
    " FAIL  src/lib/__tests__/now-plan-realdata.test.ts > 劍士 30 等主推都有",
    "AssertionError: expected undefined to be truthy",
    " Test Files  1 failed (1)",
    "      Tests  1 failed | 40 passed (41)",
  ]);
});

test("action 步驟（checkout）失敗沒有 Process completed 那行：抓到這一步最後一個錯誤為止，不含後面的收尾", () => {
  const log = actionsLog([
    "##[group]Run actions/checkout@v4",
    "with:",
    "  repository: clarkher/maplestory-tool",
    "##[endgroup]",
    "Syncing repository: clarkher/maplestory-tool",
    "##[group]Getting Git version info",
    "git version 2.55.0",
    "##[endgroup]",
    "##[error]fatal: unable to access 'https://github.com/clarkher/maplestory-tool/': The requested URL returned error: 500",
    "##[error]The process '/usr/bin/git' failed with exit code 128",
    "Post job cleanup.",
    "[command]/usr/bin/git version",
  ]);
  assert.deepEqual(errorTail(log), [
    "Syncing repository: clarkher/maplestory-tool",
    "Getting Git version info",
    "git version 2.55.0",
    "fatal: unable to access 'https://github.com/clarkher/maplestory-tool/': The requested URL returned error: 500",
    "The process '/usr/bin/git' failed with exit code 128",
  ]);
});

test("log 裡沒有錯誤就回空陣列", () => {
  assert.deepEqual(errorTail(actionsLog(["##[group]Run echo hi", "##[endgroup]", "hi"])), []);
  assert.deepEqual(errorTail(""), []);
});

test("太長的一行截斷，不讓 issue 被一行壓縮過的程式碼塞爆", () => {
  const log = actionsLog([
    "##[group]Run npm run build",
    "##[endgroup]",
    "x".repeat(1000),
    "##[error]Process completed with exit code 1.",
  ]);
  const [line] = errorTail(log, { maxLineLength: 300 });
  assert.equal(line, "x".repeat(300) + "…");
});

// jobs API 回的 refresh job（2026-10-03 run 37099846007，取得 Artale 資料那步失敗）
const FAILED_JOB = {
  id: 111137077969,
  name: "refresh",
  conclusion: "failure",
  steps: [
    { number: 1, name: "Set up job", conclusion: "success" },
    { number: 2, name: "Run actions/checkout@v4", conclusion: "success" },
    { number: 4, name: "記下更新前的版本", conclusion: "success" },
    { number: 5, name: "取得 Artale 資料", conclusion: "failure" },
    { number: 6, name: "比對版本", conclusion: "skipped" },
    { number: 22, name: "Post Run actions/checkout@v4", conclusion: "success" },
    { number: 23, name: "Complete job", conclusion: "success" },
  ],
};

test("失敗的步驟名照 Actions 頁面上的名字", () => {
  assert.equal(failedStepName(FAILED_JOB), "取得 Artale 資料");
});

test("沒有哪一步標成失敗（逾時、機器出問題）就回 null", () => {
  assert.equal(failedStepName({ steps: [{ name: "Set up job", conclusion: "success" }] }), null);
  assert.equal(failedStepName({}), null);
  assert.equal(failedStepName(undefined), null);
});

test("失敗：沒有開著的 issue 就開新的，有就在那張留言；成功：有開著的就關掉", () => {
  assert.equal(planAction("failure", false), "create");
  assert.equal(planAction("failure", true), "comment");
  assert.equal(planAction("success", true), "close");
  assert.equal(planAction("success", false), "none");
});

test("被取消（含 GitHub 沒派到機器）不通知、也不關", () => {
  assert.equal(planAction("cancelled", false), "none");
  assert.equal(planAction("cancelled", true), "none");
  assert.equal(planAction("skipped", true), "none");
});

test("dry-run 寫到另一個 label 與標題，不會碰到真的那張", () => {
  assert.deepEqual(issueKeys(false), { label: "資料更新失敗", title: "資料自動更新失敗" });
  const dryRun = issueKeys(true);
  assert.notEqual(dryRun.label, issueKeys(false).label);
  assert.notEqual(dryRun.title, issueKeys(false).title);
  assert.match(dryRun.label, /測試/);
  assert.match(dryRun.title, /測試/);
});

const RUN_URL = "https://github.com/clarkher/maplestory-tool/actions/runs/123";
const VERIFY_FAILED = {
  stepName: "確認產出沒有壞掉",
  upstreamStamp: "2026-10-05T10:00:00+08:00",
  siteStamp: "2026-09-24T11:25:10+08:00",
  runUrl: RUN_URL,
  tail: ["  FAIL 怪物有屬性抗性資料 — 0 隻", "1 項檢查未通過，資料不要上線。"],
};

test("issue 內容：哪一步失敗、上游版本、網站目前的資料版本、執行紀錄連結、錯誤最後幾行包在程式碼區塊", () => {
  const body = failureBody(VERIFY_FAILED);
  assert.match(body, /失敗的步驟：確認產出沒有壞掉/);
  assert.match(body, /上游版本：`2026-10-05T10:00:00\+08:00`/);
  assert.match(body, /網站目前的資料版本：`2026-09-24T11:25:10\+08:00`/);
  assert.ok(body.includes(`執行紀錄：${RUN_URL}`));
  assert.ok(body.includes("錯誤訊息（最後 2 行）"));
  assert.ok(body.includes("```\n  FAIL 怪物有屬性抗性資料 — 0 隻\n1 項檢查未通過，資料不要上線。\n```"));
});

test("新開的 issue 寫清楚之後會怎樣：再失敗留言在這張、不另開，成功一次自動關", () => {
  const body = failureBody(VERIFY_FAILED);
  assert.match(body, /不會另開新的/);
  assert.match(body, /自動留言並關掉/);
});

test("取上游那步就失敗、沒有上游版本：寫明沒取到，不留空白", () => {
  const body = failureBody({ ...VERIFY_FAILED, stepName: "取得 Artale 資料", upstreamStamp: "" });
  assert.match(body, /上游版本：（沒取到/);
  assert.doesNotMatch(body, /上游版本：`/, "不該出現空的 code");
});

test("沒有哪一步標成失敗：寫可能是逾時或機器出問題", () => {
  assert.match(failureBody({ ...VERIFY_FAILED, stepName: null }), /失敗的步驟：（.*逾時/);
});

test("錯誤訊息抓不到：寫原因、請人點執行紀錄，不放空的程式碼區塊", () => {
  const body = failureBody({ ...VERIFY_FAILED, tail: [], tailNote: "抓不到 log（HTTP 404）" });
  assert.match(body, /錯誤訊息：抓不到 log（HTTP 404），請點上面的執行紀錄看/);
  assert.ok(!body.includes("```"));
});

test("錯誤訊息裡本來就有 ``` 時，外框加長，不會提早結束程式碼區塊", () => {
  const body = failureBody({ ...VERIFY_FAILED, tail: ["```js", "throw x", "```"] });
  assert.ok(body.includes("````\n```js\nthrow x\n```\n````"));
});

test("又失敗的留言：開頭不同、內容一樣齊，不再重講之後會怎樣", () => {
  const body = failureBody({ ...VERIFY_FAILED, repeat: true });
  assert.match(body, /^又失敗一次/);
  assert.match(body, /失敗的步驟：確認產出沒有壞掉/);
  assert.ok(body.includes(`執行紀錄：${RUN_URL}`));
  assert.ok(!body.includes("不會另開新的"));
});

test("dry-run 的內容第一行就標明是測試、不會開 PR 不會合併", () => {
  assert.match(failureBody({ ...VERIFY_FAILED, dryRun: true }).split("\n")[0], /dry-run.*不開 PR、不合併/);
  assert.doesNotMatch(failureBody(VERIFY_FAILED), /dry-run/);
});

test("恢復的留言：說恢復了、這次的上游版本與執行紀錄", () => {
  const body = recoveredBody({ upstreamStamp: "2026-10-05T10:00:00+08:00", runUrl: RUN_URL });
  assert.match(body, /^恢復了/);
  assert.match(body, /上游版本：`2026-10-05T10:00:00\+08:00`/);
  assert.ok(body.includes(`執行紀錄：${RUN_URL}`));
  assert.match(recoveredBody({ upstreamStamp: "x", runUrl: RUN_URL, dryRun: true }).split("\n")[0], /dry-run/);
});

/** 假的 GitHub：記下每個動作，回傳設定好的結果。 */
function fakeGitHub({ open = null, job = FAILED_JOB, log = FETCH_FAILURE, jobError, logError } = {}) {
  const calls = [];
  return {
    calls,
    writes: () => calls.filter(([name]) => ["ensureLabel", "createIssue", "comment", "close"].includes(name)),
    async findOpenIssue(label) { calls.push(["findOpenIssue", label]); return open; },
    async refreshJob() { calls.push(["refreshJob"]); if (jobError) throw jobError; return job; },
    async jobLog(id) { calls.push(["jobLog", id]); if (logError) throw logError; return log; },
    async ensureLabel(label) { calls.push(["ensureLabel", label]); },
    async createIssue(issue) { calls.push(["createIssue", issue]); return { number: 7, html_url: "https://github.com/clarkher/maplestory-tool/issues/7" }; },
    async comment(number, body) { calls.push(["comment", number, body]); },
    async close(number) { calls.push(["close", number]); },
  };
}

const FAILED = { result: "failure", dryRun: false, upstreamStamp: "", siteStamp: "2026-09-24T11:25:10+08:00", runUrl: RUN_URL, assignee: "clarkher" };
const OPEN_ISSUE = { number: 5, html_url: "https://github.com/clarkher/maplestory-tool/issues/5" };

test("失敗、沒有開著的：先確保 label 在，再開一張指派給擁有者的 issue，寫失敗那一步與錯誤最後幾行", async () => {
  const github = fakeGitHub();
  const outcome = await notifyRefresh(FAILED, github);
  assert.equal(outcome.action, "create");
  assert.equal(outcome.issue.number, 7);
  const writes = github.writes();
  assert.deepEqual(writes.map(([name]) => name), ["ensureLabel", "createIssue"]);
  assert.equal(writes[0][1], "資料更新失敗");
  const issue = writes[1][1];
  assert.equal(issue.title, "資料自動更新失敗");
  assert.equal(issue.label, "資料更新失敗");
  assert.equal(issue.assignee, "clarkher");
  assert.match(issue.body, /失敗的步驟：取得 Artale 資料/);
  assert.match(issue.body, /Error: 上游 repo 沒有 drops\.json/);
  assert.match(issue.body, /上游版本：（沒取到/);
  assert.deepEqual(github.calls.find(([name]) => name === "jobLog"), ["jobLog", 111137077969]);
});

test("失敗、已經有開著的：在那張留言，不開新的", async () => {
  const github = fakeGitHub({ open: OPEN_ISSUE });
  const outcome = await notifyRefresh(FAILED, github);
  assert.equal(outcome.action, "comment");
  assert.equal(outcome.issue.number, 5);
  const writes = github.writes();
  assert.deepEqual(writes.map(([name, number]) => [name, number]), [["comment", 5]]);
  assert.match(writes[0][2], /^又失敗一次/);
  assert.match(writes[0][2], /Error: 上游 repo 沒有 drops\.json/);
});

test("成功、有開著的：先留言說恢復了，再關掉", async () => {
  const github = fakeGitHub({ open: OPEN_ISSUE });
  const outcome = await notifyRefresh({ ...FAILED, result: "success", upstreamStamp: "2026-10-05T10:00:00+08:00" }, github);
  assert.equal(outcome.action, "close");
  const writes = github.writes();
  assert.deepEqual(writes.map(([name, number]) => [name, number]), [["comment", 5], ["close", 5]]);
  assert.match(writes[0][2], /^恢復了/);
  assert.match(writes[0][2], /2026-10-05T10:00:00\+08:00/);
});

test("成功、沒有開著的：只查一下，什麼都不寫", async () => {
  const github = fakeGitHub();
  assert.equal((await notifyRefresh({ ...FAILED, result: "success" }, github)).action, "none");
  assert.deepEqual(github.calls, [["findOpenIssue", "資料更新失敗"]]);
});

test("被取消：連查都不查", async () => {
  const github = fakeGitHub({ open: OPEN_ISSUE });
  assert.equal((await notifyRefresh({ ...FAILED, result: "cancelled" }, github)).action, "none");
  assert.deepEqual(github.calls, []);
});

test("dry-run：查、建 label、開 issue 都用測試那一組，內容第一行標明是測試", async () => {
  const github = fakeGitHub();
  await notifyRefresh({ ...FAILED, dryRun: true }, github);
  assert.deepEqual(github.calls[0], ["findOpenIssue", "資料更新失敗-測試"]);
  const [, label] = github.writes()[0];
  const [, issue] = github.writes()[1];
  assert.equal(label, "資料更新失敗-測試");
  assert.equal(issue.title, "（測試）資料自動更新失敗");
  assert.equal(issue.label, "資料更新失敗-測試");
  assert.match(issue.body.split("\n")[0], /dry-run/);
});

test("下載 log 失敗：issue 照開，步驟名照寫，錯誤訊息改寫抓不到的原因", async () => {
  const github = fakeGitHub({ logError: new Error("HTTP 404") });
  await notifyRefresh(FAILED, github);
  const [, issue] = github.writes()[1];
  assert.match(issue.body, /失敗的步驟：取得 Artale 資料/);
  assert.match(issue.body, /錯誤訊息：抓不到 log（HTTP 404）/);
});

test("讀不到這次執行的步驟：issue 照開，寫讀不到與原因", async () => {
  const github = fakeGitHub({ jobError: new Error("HTTP 500") });
  await notifyRefresh(FAILED, github);
  const [, issue] = github.writes()[1];
  assert.match(issue.body, /失敗的步驟：（讀不到：HTTP 500）/);
  assert.equal(github.calls.filter(([name]) => name === "jobLog").length, 0);
});

test("log 裡找不到錯誤：寫找不到，請人點執行紀錄", async () => {
  const github = fakeGitHub({ log: "2026-10-03T05:27:00.0000000Z hi" });
  await notifyRefresh(FAILED, github);
  const [, issue] = github.writes()[1];
  assert.match(issue.body, /錯誤訊息：log 裡找不到錯誤訊息，請點上面的執行紀錄看/);
});
