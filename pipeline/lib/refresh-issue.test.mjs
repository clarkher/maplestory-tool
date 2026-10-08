import test from "node:test";
import assert from "node:assert/strict";
import {
  errorTail, failedStepName, planAction, issueKeys, failureBody, recoveredBody, notifyRefresh,
  taipeiTime, readFailureMark, markFailure, overallResult,
} from "./refresh-issue.mjs";

const ESC = "\x1b";
const BOM = String.fromCharCode(0xfeff);

/**
 * 組出 GitHub Actions 下載回來的 job log 的樣子：開頭有 BOM、每行前面有時間戳、CRLF 換行、
 * 步驟標頭的指令有顏色碼。
 */
function actionsLog(lines) {
  return BOM + lines.map((line, i) => `2026-10-03T05:27:${String(i % 60).padStart(2, "0")}.1234567Z ${line}`).join("\r\n");
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
  assert.ok(!tail.includes(BOM));
  assert.ok(!tail.includes("\r"));
  for (const noise of ["shell: /usr/bin/bash", "##[", "Process completed", "Post job cleanup", "git version", "Node.js 20 is deprecated", "Syncing repository"]) {
    assert.ok(!tail.includes(noise), `不該有「${noise}」`);
  }
});

test("git 的進度條（Updating files: 82%…100%, done.）只留最後一行；數字不同但不是進度的訊息照樣全留", () => {
  const tail = errorTail(FETCH_FAILURE);
  assert.deepEqual(tail.filter(line => line.startsWith("Updating files:")), ["Updating files: 100% (16277/16277), done."]);

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

test("只合併 git 格式的進度條：一般訊息就算帶百分比、連著兩行也全留", () => {
  const log = actionsLog([
    "##[group]Run node pipeline/verify.mjs",
    "##[endgroup]",
    "FAIL 職業 1 覆蓋率 80%",
    "FAIL 職業 2 覆蓋率 75%",
    "Receiving objects:  45% (100/222)",
    "Receiving objects: 100% (222/222), 1.20 MiB | 3.00 MiB/s, done.",
    "##[error]Process completed with exit code 1.",
  ]);
  assert.deepEqual(errorTail(log), [
    "FAIL 職業 1 覆蓋率 80%",
    "FAIL 職業 2 覆蓋率 75%",
    "Receiving objects: 100% (222/222), 1.20 MiB | 3.00 MiB/s, done.",
  ]);
});

test("前面成功的步驟自己印過 ##[error] 標註也不會抓錯：抓的是最後真正失敗的那一步", () => {
  const log = actionsLog([
    "##[group]Run node pipeline/build.mjs",
    "##[endgroup]",
    "##[error]某個成功的步驟自己印的錯誤標註",
    "重建完成",
    "##[group]Run node pipeline/verify.mjs",
    "##[endgroup]",
    "  FAIL 怪物有屬性抗性資料 — 0 隻",
    "1 項檢查未通過，資料不要上線。",
    "##[error]Process completed with exit code 1.",
    "Post job cleanup.",
  ]);
  assert.deepEqual(errorTail(log), ["  FAIL 怪物有屬性抗性資料 — 0 隻", "1 項檢查未通過，資料不要上線。"]);
});

// 2026-10-07 實測（run 37581142501，job 上限臨時設 2 分鐘）：跑超過時間上限被 GitHub 中止，
// 沒有 Process completed，只有一行 The operation was canceled.，接著就是收尾
const TIMED_OUT_LOG = actionsLog([
  "##[group]Run node pipeline/fetch-artale.mjs",
  "shell: /usr/bin/bash -e {0}",
  "##[endgroup]",
  "[artale] 使用上游資料：遊戲版本 1.15.2，2026-09-24 11:25:10 GMT+8",
  '##[group]Run echo "dry-run 測試：勾了 simulate_failure，故意在這裡失敗，看失敗通知有沒有開出來"',
  `${ESC}[36;1mecho "臨時：睡 5 分鐘讓 job 逾時"${ESC}[0m`,
  `${ESC}[36;1msleep 300${ESC}[0m`,
  "shell: /usr/bin/bash -e {0}",
  "##[endgroup]",
  "dry-run 測試：勾了 simulate_failure，故意在這裡失敗，看失敗通知有沒有開出來",
  "臨時：睡 5 分鐘讓 job 逾時",
  "##[error]The operation was canceled.",
  "Post job cleanup.",
  "[command]/usr/bin/git version",
  "git version 2.55.0",
  "Cleaning up orphan processes",
]);

test("跑太久被中止（10/07 實測）：抓到被中止那一步的輸出，最後一行是 The operation was canceled.", () => {
  assert.deepEqual(errorTail(TIMED_OUT_LOG), [
    "dry-run 測試：勾了 simulate_failure，故意在這裡失敗，看失敗通知有沒有開出來",
    "臨時：睡 5 分鐘讓 job 逾時",
    "The operation was canceled.",
  ]);
});

test("超過 maxLines 只留最後幾行", () => {
  assert.deepEqual(errorTail(FETCH_FAILURE, { maxLines: 3 }), [
    "    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:117:5)",
    "",
    "Node.js v22.23.3",
  ]);
});

// 首頁真資料檢查用 --reporter=default 跑（vitest 5 在 GitHub Actions 上預設會在摘要「之後」再印一串
// ::error 標註，失敗一多最後 30 行就只剩標註；10/07 本機用 GITHUB_ACTIONS=true 實測過）。
// 輸出順序照實測：失敗的測試名、錯誤、程式碼位置，最後是摘要（裝飾用的框線符號拿掉）
test("首頁真資料檢查（--reporter=default）：失敗的測試名、錯誤、摘要都在最後幾行", () => {
  const log = actionsLog([
    "##[group]Run npx vitest run --reporter=default src/lib/__tests__/now-plan-realdata.test.ts",
    `${ESC}[36;1mnpx vitest run --reporter=default src/lib/__tests__/now-plan-realdata.test.ts${ESC}[0m`,
    "shell: /usr/bin/bash -e {0}",
    "##[endgroup]",
    " RUN  v5.0.3 /home/runner/work/maplestory-tool/maplestory-tool",
    " FAIL  src/lib/__tests__/now-plan-realdata.test.ts > 劍士 30 等主推都有",
    "AssertionError: expected undefined to be truthy",
    "",
    " Test Files  1 failed (1)",
    "      Tests  1 failed | 40 passed (41)",
    "##[error]Process completed with exit code 1.",
  ]);
  assert.deepEqual(errorTail(log).slice(-5), [
    " FAIL  src/lib/__tests__/now-plan-realdata.test.ts > 劍士 30 等主推都有",
    "AssertionError: expected undefined to be truthy",
    "",
    " Test Files  1 failed (1)",
    "      Tests  1 failed | 40 passed (41)",
  ]);
});

test("收尾步驟（post）後來又印了錯誤或 Process completed，也不會搶走失敗點", () => {
  const log = actionsLog([
    "##[group]Run node pipeline/verify.mjs",
    "##[endgroup]",
    "  FAIL 怪物有屬性抗性資料 — 0 隻",
    "##[error]Process completed with exit code 1.",
    "Post job cleanup.",
    "##[error]post 步驟自己的錯誤",
    "##[error]Process completed with exit code 2.",
  ]);
  assert.deepEqual(errorTail(log), ["  FAIL 怪物有屬性抗性資料 — 0 隻"]);
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
  html_url: "https://github.com/clarkher/maplestory-tool/actions/runs/37099846007/job/111137077969",
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

test("沒有哪一步標成失敗或被中止就回 null", () => {
  assert.equal(failedStepName({ steps: [{ name: "Set up job", conclusion: "success" }] }), null);
  assert.equal(failedStepName({}), null);
  assert.equal(failedStepName(undefined), null);
});

// jobs API 回的 refresh job（2026-10-07 run 37581142501）：跑超過時間上限被中止，job 跟當時在跑的那一步都是 cancelled
const TIMED_OUT_JOB = {
  id: 112660848558,
  name: "refresh",
  conclusion: "cancelled",
  html_url: "https://github.com/clarkher/maplestory-tool/actions/runs/37581142501/job/112660848558",
  steps: [
    { number: 1, name: "Set up job", conclusion: "success" },
    { number: 6, name: "比對版本", conclusion: "success" },
    { number: 7, name: "（測試）故意失敗", conclusion: "cancelled" },
    { number: 8, name: "安裝相依套件", conclusion: "skipped" },
    { number: 30, name: "Post Run actions/checkout@v4", conclusion: "success" },
    { number: 31, name: "Complete job", conclusion: "success" },
  ],
};

test("跑超過時間上限被中止：回當時在跑的那一步，並註明是被中止的", () => {
  assert.equal(failedStepName(TIMED_OUT_JOB), "（測試）故意失敗（被中止，多半是跑超過時間上限）");
});

// 主要步驟都跑完（資料可能已經合進去了），只有收尾步驟卡住被中止
const ONLY_POST_STOPPED = {
  ...TIMED_OUT_JOB,
  steps: [
    { number: 15, name: "開 PR 並自動合併", conclusion: "success" },
    { number: 29, name: "Post Run actions/setup-node@v4", conclusion: "cancelled" },
    { number: 31, name: "Complete job", conclusion: "success" },
  ],
};

test("只有收尾步驟（Post Run …）被中止：不算資料更新失敗，回 null", () => {
  assert.equal(failedStepName(ONLY_POST_STOPPED), null);
});

test("失敗：沒有開著的 issue 就開新的，有就在那張留言；成功：有開著的就關掉", () => {
  assert.equal(planAction("failure", false), "create");
  assert.equal(planAction("failure", true), "comment");
  assert.equal(planAction("success", true), "close");
  assert.equal(planAction("success", false), "none");
});

test("refresh（建置）跟 publish（開 PR 合併）的結果併成一個：refresh 沒成功看 refresh，refresh 成功就看 publish 有沒有失敗或被中止", () => {
  // refresh 沒成功時 publish 不會跑（skipped）
  assert.deepEqual(overallResult({ refresh: "failure", publish: "skipped" }), { result: "failure", job: "refresh" });
  assert.deepEqual(overallResult({ refresh: "cancelled", publish: "skipped" }), { result: "cancelled", job: "refresh" });
  // 開 PR、合併失敗或卡住：資料沒上線，也要通知，步驟與 log 看 publish
  assert.deepEqual(overallResult({ refresh: "success", publish: "failure" }), { result: "failure", job: "publish" });
  assert.deepEqual(overallResult({ refresh: "success", publish: "cancelled" }), { result: "cancelled", job: "publish" });
  // publish 合併成功，或沒跑（dry-run、上游版本沒變）：成功，不用看哪個 job
  assert.deepEqual(overallResult({ refresh: "success", publish: "success" }), { result: "success", job: null });
  assert.deepEqual(overallResult({ refresh: "success", publish: "skipped" }), { result: "success", job: null });
  // 本機預覽拆 job 之前的舊執行：沒有 publish 的結果
  assert.deepEqual(overallResult({ refresh: "success", publish: undefined }), { result: "success", job: null });
  assert.deepEqual(overallResult({ refresh: "failure", publish: "" }), { result: "failure", job: "refresh" });
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
  at: "2026-10-07 13:56",
};

test("issue 內容：哪一步失敗、上游版本、網站目前的資料版本、執行紀錄連結、錯誤最後幾行包在程式碼區塊", () => {
  const body = failureBody(VERIFY_FAILED);
  assert.ok(body.includes(`最後一次失敗：2026-10-07 13:56（台灣時間）卡在「確認產出沒有壞掉」，連續第 1 次，[執行紀錄](${RUN_URL})`));
  assert.match(body, /失敗的步驟：確認產出沒有壞掉/);
  assert.match(body, /上游版本：`2026-10-05T10:00:00\+08:00`/);
  assert.match(body, /網站目前的資料版本：`2026-09-24T11:25:10\+08:00`/);
  assert.ok(body.includes(`執行紀錄：${RUN_URL}`));
  assert.ok(body.includes("錯誤訊息（最後 2 行）"));
  assert.ok(body.includes("```\n  FAIL 怪物有屬性抗性資料 — 0 隻\n1 項檢查未通過，資料不要上線。\n```"));
});

test("新開的 issue 寫清楚之後會怎樣：一樣的失敗只更新那一行不通知，有變才留言，成功一次自動關", () => {
  const body = failureBody(VERIFY_FAILED);
  assert.match(body, /同樣的失敗只會更新上面「最後一次失敗」那行，不另外通知/);
  assert.match(body, /失敗的步驟或上游版本變了，才會在這裡留言/);
  assert.match(body, /自動留言並關掉/);
});

test("內文藏著這次失敗的步驟、上游版本、次數（看不到的註解），下次拿來比是不是同樣的失敗", () => {
  const body = failureBody(VERIFY_FAILED);
  assert.match(body, /<!-- data-refresh-failure .* -->$/);
  assert.deepEqual(readFailureMark(body), { step: "確認產出沒有壞掉", upstream: "2026-10-05T10:00:00+08:00", count: 1 });
  assert.equal(readFailureMark("別人手動開的 issue"), null);
  assert.equal(readFailureMark("<!-- data-refresh-failure {壞掉的 -->"), null);
  assert.equal(readFailureMark("<!-- data-refresh-failure %E0%A4%A -->"), null);
});

test("內文裡不小心有兩個藏著的註解：讀最後一個，更新時只留一個", () => {
  const body = `${failureBody({ ...VERIFY_FAILED, stepName: "舊的" })}\n${failureBody(VERIFY_FAILED).split("\n").at(-1)}`;
  assert.equal(readFailureMark(body).step, "確認產出沒有壞掉");
  const after = markFailure(body, { stepName: "x", upstreamStamp: "", count: 5, at: "2026-10-08 08:21", runUrl: RUN_URL });
  assert.equal(after.match(/<!-- data-refresh-failure /g).length, 1);
  assert.equal(readFailureMark(after).count, 5);
});

test("同樣的失敗：換掉「最後一次失敗」那行（寫最新卡在哪一步）與藏著的次數，其他內容不動", () => {
  const before = failureBody(VERIFY_FAILED);
  const runUrl = "https://github.com/clarkher/maplestory-tool/actions/runs/456?$&";
  const after = markFailure(before, { stepName: "確認產出沒有壞掉", upstreamStamp: "2026-10-05T10:00:00+08:00", count: 3, at: "2026-10-08 08:21", runUrl });
  assert.ok(after.includes(`最後一次失敗：2026-10-08 08:21（台灣時間）卡在「確認產出沒有壞掉」，連續第 3 次，[執行紀錄](${runUrl})`));
  assert.doesNotMatch(after, /2026-10-07 13:56/);
  assert.equal(readFailureMark(after).count, 3);
  const strip = text => text.replace(/^最後一次失敗：.*$/m, "").replace(/<!-- data-refresh-failure .* -->/, "");
  assert.equal(strip(after), strip(before));
});

test("沒有那一行、沒有藏註解的內文（別人改過）：補在最後", () => {
  const after = markFailure("手動寫的內容", { stepName: "取得 Artale 資料", upstreamStamp: "", count: 2, at: "2026-10-08 08:21", runUrl: RUN_URL });
  assert.match(after, /^手動寫的內容\n\n最後一次失敗：2026-10-08 08:21（台灣時間）卡在「取得 Artale 資料」，連續第 2 次/);
  assert.deepEqual(readFailureMark(after), { step: "取得 Artale 資料", upstream: "", count: 2 });
});

test("沒有步驟名時，「最後一次失敗」那行就不寫卡在哪", () => {
  const after = markFailure("x", { stepName: null, upstreamStamp: "", count: 2, at: "2026-10-08 08:21", runUrl: RUN_URL });
  assert.ok(after.includes(`最後一次失敗：2026-10-08 08:21（台灣時間），連續第 2 次，[執行紀錄](${RUN_URL})`));
});

test("步驟名裡有 --> 之類的字也不會把藏著的註解提早結束", () => {
  const stepName = "（讀不到：GET x → HTTP 500：<html>--></html>）";
  const after = markFailure("x", { stepName, upstreamStamp: "", count: 1, at: "2026-10-08 08:21", runUrl: RUN_URL });
  assert.equal(readFailureMark(after).step, stepName);
  // 註解那一行裡沒有任何 < >，只有結尾那一個 -->
  assert.match(after.split("\n").at(-1), /^<!-- data-refresh-failure [^<>]* -->$/);
});

test("步驟名裡有段落分隔字元（U+2028）也讀得回來，註解不會越疊越多", () => {
  const stepName = `奇怪的步驟${String.fromCharCode(0x2028)}第二行`;
  const once = markFailure("x", { stepName, upstreamStamp: "", count: 1, at: "2026-10-08 08:21", runUrl: RUN_URL });
  const twice = markFailure(once, { stepName, upstreamStamp: "", count: 2, at: "2026-10-08 20:21", runUrl: RUN_URL });
  assert.deepEqual(readFailureMark(twice), { step: stepName, upstream: "", count: 2 });
  assert.equal(twice.match(/<!-- data-refresh-failure /g).length, 1);
});

test("時間用台灣時間，跨午夜也對", () => {
  assert.equal(taipeiTime(new Date("2026-10-07T05:56:17Z")), "2026-10-07 13:56");
  assert.equal(taipeiTime(new Date("2026-10-07T16:30:00Z")), "2026-10-08 00:30");
});

test("取上游那步就失敗、沒有上游版本：寫明沒取到，不留空白", () => {
  const body = failureBody({ ...VERIFY_FAILED, stepName: "取得 Artale 資料", upstreamStamp: "" });
  assert.match(body, /上游版本：（沒取到/);
  assert.doesNotMatch(body, /上游版本：`/, "不該出現空的 code");
});

test("沒有哪一步標成失敗（逾時已經會寫出步驟名）：寫可能是執行的機器出問題", () => {
  const body = failureBody({ ...VERIFY_FAILED, stepName: null });
  assert.match(body, /失敗的步驟：（沒有哪一步標成失敗，可能是執行的機器出問題）/);
  assert.doesNotMatch(body, /逾時/);
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

test("失敗有變的留言：開頭寫連續第幾次、內容一樣齊，不再重講之後會怎樣，也不帶那一行與藏著的註解", () => {
  const body = failureBody({ ...VERIFY_FAILED, repeat: true, count: 2 });
  assert.match(body, /^又失敗了（連續第 2 次）/);
  assert.match(body, /失敗的步驟：確認產出沒有壞掉/);
  assert.ok(body.includes(`執行紀錄：${RUN_URL}`));
  assert.ok(!body.includes("不另外通知"));
  assert.ok(!body.includes("最後一次失敗："));
  assert.equal(readFailureMark(body), null);
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
    writes: () => calls.filter(([name]) => ["ensureLabel", "createIssue", "comment", "updateIssue", "close"].includes(name)),
    async findOpenIssue(label) { calls.push(["findOpenIssue", label]); return open; },
    async job(name) { calls.push(["job", name]); if (jobError) throw jobError; return job; },
    async jobLog(id) { calls.push(["jobLog", id]); if (logError) throw logError; return log; },
    async ensureLabel(label) { calls.push(["ensureLabel", label]); },
    async createIssue(issue) { calls.push(["createIssue", issue]); return { number: 7, html_url: "https://github.com/clarkher/maplestory-tool/issues/7" }; },
    async comment(number, body) { calls.push(["comment", number, body]); },
    async updateIssue(number, body) { calls.push(["updateIssue", number, body]); },
    async close(number) { calls.push(["close", number]); },
  };
}

const FAILED = {
  result: "failure", dryRun: false, upstreamStamp: "", siteStamp: "2026-09-24T11:25:10+08:00", runUrl: RUN_URL, assignee: "clarkher",
  now: new Date("2026-10-07T05:56:17Z"),
};
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
  assert.match(issue.body, /最後一次失敗：2026-10-07 13:56（台灣時間）卡在「取得 Artale 資料」，連續第 1 次/);
  assert.deepEqual(readFailureMark(issue.body), { step: "取得 Artale 資料", upstream: "", count: 1 });
  assert.deepEqual(github.calls.find(([name]) => name === "jobLog"), ["jobLog", 111137077969]);
  // 執行紀錄直接連到失敗的那個 job，點了就是那段 log
  assert.ok(issue.body.includes(`執行紀錄：${FAILED_JOB.html_url}`));
  assert.ok(issue.body.includes(`連續第 1 次，[執行紀錄](${FAILED_JOB.html_url})`));
});

/** 上一次通知開出來的那張（取得 Artale 資料失敗、沒有上游版本）。 */
function openedBy(details) {
  return { ...OPEN_ISSUE, body: failureBody({ runUrl: RUN_URL, siteStamp: "x", at: "2026-10-07 01:56", ...details }) };
}

test("失敗、已經有開著的、而且跟上次一樣（同一步、同一個上游版本）：只更新內文那一行，不留言、不另開", async () => {
  const github = fakeGitHub({ open: openedBy({ stepName: "取得 Artale 資料", upstreamStamp: "" }) });
  const outcome = await notifyRefresh(FAILED, github);
  assert.equal(outcome.action, "update");
  assert.equal(outcome.issue.number, 5);
  const writes = github.writes();
  assert.deepEqual(writes.map(([name, number]) => [name, number]), [["updateIssue", 5]]);
  assert.match(writes[0][2], /最後一次失敗：2026-10-07 13:56（台灣時間）卡在「取得 Artale 資料」，連續第 2 次/);
  assert.equal(readFailureMark(writes[0][2]).count, 2);
});

test("藏著的註解不見了、但那一行還寫著連續第 7 次：次數接著算（第 8 次）", async () => {
  const body = "手動整理過的內容\n最後一次失敗：2026-10-07 01:56（台灣時間），連續第 7 次，[執行紀錄](x)";
  const github = fakeGitHub({ open: { ...OPEN_ISSUE, body } });
  await notifyRefresh(FAILED, github);
  const [, , updated] = github.writes().find(([name]) => name === "updateIssue");
  assert.match(updated, /連續第 8 次/);
  assert.equal(readFailureMark(updated).count, 8);
});

test("失敗有變之後，內文那一行寫的是最新卡在哪一步（不會停在第一次的步驟）", async () => {
  const github = fakeGitHub({ open: openedBy({ stepName: "（測試）故意失敗（被中止，多半是跑超過時間上限）", upstreamStamp: "" }) });
  await notifyRefresh(FAILED, github);
  const [, , updated] = github.writes().find(([name]) => name === "updateIssue");
  assert.match(updated, /最後一次失敗：.*卡在「取得 Artale 資料」/);
});

test("失敗、已經有開著的、但失敗的步驟不一樣：先留言（會通知），再更新內文那一行", async () => {
  const github = fakeGitHub({ open: openedBy({ stepName: "確認產出沒有壞掉", upstreamStamp: "" }) });
  const outcome = await notifyRefresh(FAILED, github);
  assert.equal(outcome.action, "comment");
  const writes = github.writes();
  assert.deepEqual(writes.map(([name, number]) => [name, number]), [["comment", 5], ["updateIssue", 5]]);
  assert.match(writes[0][2], /^又失敗了（連續第 2 次）/);
  assert.match(writes[0][2], /失敗的步驟：取得 Artale 資料/);
  assert.match(writes[0][2], /Error: 上游 repo 沒有 drops\.json/);
  assert.deepEqual(readFailureMark(writes[1][2]), { step: "取得 Artale 資料", upstream: "", count: 2 });
});

test("失敗、已經有開著的、同一步但上游出了新版本：也留言", async () => {
  const github = fakeGitHub({ open: openedBy({ stepName: "取得 Artale 資料", upstreamStamp: "2026-09-24T11:25:10+08:00" }) });
  assert.equal((await notifyRefresh({ ...FAILED, upstreamStamp: "2026-10-05T10:00:00+08:00" }, github)).action, "comment");
  assert.deepEqual(github.writes().map(([name]) => name), ["comment", "updateIssue"]);
});

test("開著的那張沒有藏註解（手動開的、內文被改過）：當成不一樣，留言並補上", async () => {
  const github = fakeGitHub({ open: OPEN_ISSUE });
  const outcome = await notifyRefresh(FAILED, github);
  assert.equal(outcome.action, "comment");
  const writes = github.writes();
  assert.deepEqual(writes.map(([name, number]) => [name, number]), [["comment", 5], ["updateIssue", 5]]);
  assert.deepEqual(readFailureMark(writes[1][2]), { step: "取得 Artale 資料", upstream: "", count: 2 });
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

test("被取消、一步都沒跑（GitHub 沒派到機器，10/05 那次）：不通知，也不查 issue", async () => {
  const github = fakeGitHub({ open: OPEN_ISSUE, job: { id: 111966673830, name: "refresh", conclusion: "cancelled", steps: [] } });
  assert.equal((await notifyRefresh({ ...FAILED, result: "cancelled" }, github)).action, "none");
  assert.deepEqual(github.calls, [["job", "refresh"]]);
});

test("被取消、但有一步被中止（跑超過時間上限）：當成失敗開 issue，寫哪一步被中止與中止前的輸出", async () => {
  const github = fakeGitHub({ job: TIMED_OUT_JOB, log: TIMED_OUT_LOG });
  const outcome = await notifyRefresh({ ...FAILED, result: "cancelled" }, github);
  assert.equal(outcome.action, "create");
  const [, issue] = github.writes()[1];
  assert.match(issue.body, /失敗的步驟：（測試）故意失敗（被中止，多半是跑超過時間上限）/);
  assert.match(issue.body, /The operation was canceled\./);
  assert.equal(github.calls.filter(([name]) => name === "job").length, 1, "步驟只讀一次");
});

// jobs API 回的 publish job：開 PR 那一步失敗（例如標題太長，GitHub 回 422）
const PUBLISH_FAILED_JOB = {
  id: 112700000001,
  name: "publish",
  conclusion: "failure",
  html_url: "https://github.com/clarkher/maplestory-tool/actions/runs/37600000000/job/112700000001",
  steps: [
    { number: 1, name: "Set up job", conclusion: "success" },
    { number: 2, name: "Run actions/checkout@v4", conclusion: "success" },
    { number: 3, name: "下載重建好的資料檔", conclusion: "success" },
    { number: 4, name: "開 PR 並自動合併", conclusion: "failure" },
    { number: 8, name: "Post Run actions/checkout@v4", conclusion: "success" },
    { number: 9, name: "Complete job", conclusion: "success" },
  ],
};
const PUBLISH_FAILURE_LOG = actionsLog([
  "##[group]Run # 這一步會用 --admin 直接合進 main（正式機），dry-run 絕不能走到這裡",
  "shell: /usr/bin/bash -e {0}",
  "##[endgroup]",
  "To https://github.com/clarkher/maplestory-tool",
  " * [new branch]      data/refresh-20261008100000 -> data/refresh-20261008100000",
  "pull request create failed: GraphQL: Title is too long (maximum is 256 characters) (createPullRequest)",
  "##[error]Process completed with exit code 1.",
]);

test("refresh 成功、publish（開 PR、合併）失敗：讀 publish 那個 job，issue 寫它失敗的那一步、連到它的 log", async () => {
  const github = fakeGitHub({ job: PUBLISH_FAILED_JOB, log: PUBLISH_FAILURE_LOG });
  const outcome = await notifyRefresh({ ...FAILED, job: "publish", upstreamStamp: "2026-10-08T10:00:00+08:00" }, github);
  assert.equal(outcome.action, "create");
  assert.deepEqual(github.calls.find(([name]) => name === "job"), ["job", "publish"]);
  assert.deepEqual(github.calls.find(([name]) => name === "jobLog"), ["jobLog", 112700000001]);
  const [, issue] = github.writes()[1];
  assert.match(issue.body, /失敗的步驟：開 PR 並自動合併/);
  assert.match(issue.body, /Title is too long/);
  assert.ok(issue.body.includes(`執行紀錄：${PUBLISH_FAILED_JOB.html_url}`));
  assert.deepEqual(readFailureMark(issue.body), { step: "開 PR 並自動合併", upstream: "2026-10-08T10:00:00+08:00", count: 1 });
});

test("publish 跑超過時間上限被中止：讀 publish 的步驟，有一步被中止就當失敗開 issue", async () => {
  const stuck = {
    ...PUBLISH_FAILED_JOB,
    conclusion: "cancelled",
    steps: PUBLISH_FAILED_JOB.steps.map(step => (step.name === "開 PR 並自動合併" ? { ...step, conclusion: "cancelled" } : step)),
  };
  const github = fakeGitHub({ job: stuck, log: TIMED_OUT_LOG });
  const outcome = await notifyRefresh({ ...FAILED, result: "cancelled", job: "publish" }, github);
  assert.equal(outcome.action, "create");
  assert.deepEqual(github.calls[0], ["job", "publish"]);
  const [, issue] = github.writes()[1];
  assert.match(issue.body, /失敗的步驟：開 PR 並自動合併（被中止，多半是跑超過時間上限）/);
});

test("被取消、只有收尾步驟被中止（主要步驟都跑完了）：不通知", async () => {
  const github = fakeGitHub({ open: OPEN_ISSUE, job: ONLY_POST_STOPPED });
  assert.equal((await notifyRefresh({ ...FAILED, result: "cancelled" }, github)).action, "none");
  assert.deepEqual(github.writes(), []);
});

test("被取消、讀不到 refresh 這個 job：不通知，但把原因印出來", async () => {
  const github = fakeGitHub({ open: OPEN_ISSUE, jobError: new Error("HTTP 500") });
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    assert.equal((await notifyRefresh({ ...FAILED, result: "cancelled" }, github)).action, "none");
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(github.writes(), []);
  assert.ok(warnings.some(line => line.includes("HTTP 500")), "要印出讀不到的原因");
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
  assert.match(issue.body, /失敗的步驟：（讀不到這次執行的步驟）/);
  assert.match(issue.body, /錯誤訊息：讀不到這次執行的步驟（HTTP 500）/);
  assert.equal(github.calls.filter(([name]) => name === "jobLog").length, 0);
});

test("API 壞著、每次都讀不到步驟：藏著的步驟名每次一樣，不會每 12 小時留言一次", async () => {
  const first = fakeGitHub({ jobError: new Error("GET repos/x/actions/runs/111/jobs → HTTP 502") });
  await notifyRefresh(FAILED, first);
  const [, issue] = first.writes()[1];
  const second = fakeGitHub({ open: { ...OPEN_ISSUE, body: issue.body }, jobError: new Error("GET repos/x/actions/runs/222/jobs → HTTP 502") });
  assert.equal((await notifyRefresh(FAILED, second)).action, "update");
});

test("log 裡找不到錯誤：寫找不到，請人點執行紀錄", async () => {
  const github = fakeGitHub({ log: "2026-10-03T05:27:00.0000000Z hi" });
  await notifyRefresh(FAILED, github);
  const [, issue] = github.writes()[1];
  assert.match(issue.body, /錯誤訊息：log 裡找不到錯誤訊息，請點上面的執行紀錄看/);
});

test("有 README 網址時，「怎麼處理」寫成點得到的連結", () => {
  const readmeUrl = "https://github.com/clarkher/maplestory-tool/blob/main/README.md#%E8%87%AA%E5%8B%95%E6%9B%B4%E6%96%B0";
  assert.ok(failureBody({ ...VERIFY_FAILED, readmeUrl }).includes(`怎麼處理見 [README「自動更新」](${readmeUrl})。`));
  assert.ok(failureBody(VERIFY_FAILED).includes("怎麼處理見 README「自動更新」。"));
});
