import test from "node:test";
import assert from "node:assert/strict";
import { notifyIssue } from "./notify-issue.mjs";

const repo = "owner/repo";
const assignee = "testuser";
const reason = "測試失敗";
const runUrl = "https://github.com/owner/repo/actions/runs/123";
const now = new Date("2026-10-13T10:00:00Z");
// 同一刻的台灣時間（UTC+8），「最後一次」那行寫這個格式
const STAMP = "2026-10-13T18:00:00+08:00";

class FakeCallRecorder {
  constructor() {
    this.requests = [];
    this.responses = {};
  }

  recordResponse(key, response) {
    this.responses[key] = response;
  }

  recordError(key, errorMessage) {
    this.responses[key] = { error: true, message: errorMessage };
  }

  async call(method, url, body) {
    this.requests.push({ method, url, body });
    const key = `${method} ${url}`;
    const response = this.responses[key];
    if (!response) throw new Error(`沒預期到的呼叫：${key}`);
    if (response.error) throw new Error(response.message);
    return response;
  }
}

test("(a) 要開 issue、目前沒有開著的：先建 label 再開新的 issue", async () => {
  const recorder = new FakeCallRecorder();
  recorder.recordResponse(`GET /repos/${repo}/issues?state=open&labels=${encodeURIComponent("匯率收集失敗")}&per_page=1`, []);
  recorder.recordResponse(`POST /repos/${repo}/labels`, {});
  recorder.recordResponse(`POST /repos/${repo}/issues`, { number: 42 });

  const result = await notifyIssue({
    action: "open",
    reason,
    call: recorder.call.bind(recorder),
    repo,
    runUrl,
    assignee,
    now,
  });

  assert.equal(result, "開了新的");
  assert.equal(recorder.requests.length, 3);
  assert.equal(recorder.requests[0].method, "GET");
  assert.equal(recorder.requests[1].method, "POST");
  assert.match(recorder.requests[1].url, /labels/);
  assert.equal(recorder.requests[2].method, "POST");
  assert.match(recorder.requests[2].url, /issues$/);
  assert.equal(recorder.requests[2].body.title, "楓幣匯率收集失敗");
  assert.deepEqual(recorder.requests[2].body.labels, ["匯率收集失敗"]);
  assert.deepEqual(recorder.requests[2].body.assignees, [assignee]);
  assert.match(recorder.requests[2].body.body, /測試失敗/);
  assert.ok(recorder.requests[2].body.body.includes(`最後一次：${STAMP}，${reason}（${runUrl}）`), "最後一次那行用台灣時間");
});

test("(b) 建 label 回 422（已存在）：照樣開 issue；回 403：丟錯", async () => {
  const recorder = new FakeCallRecorder();
  recorder.recordResponse(`GET /repos/${repo}/issues?state=open&labels=${encodeURIComponent("匯率收集失敗")}&per_page=1`, []);
  recorder.recordError(`POST /repos/${repo}/labels`, "POST /repos/owner/repo/labels → HTTP 422：already exists");
  recorder.recordResponse(`POST /repos/${repo}/issues`, { number: 42 });

  const result = await notifyIssue({
    action: "open",
    reason,
    call: recorder.call.bind(recorder),
    repo,
    runUrl,
    assignee,
    now,
  });

  assert.equal(result, "開了新的");
  assert.equal(recorder.requests.length, 3, "要先試建 label、拿到 422、再開 issue");

  // 403 要丟錯
  const recorder403 = new FakeCallRecorder();
  recorder403.recordResponse(`GET /repos/${repo}/issues?state=open&labels=${encodeURIComponent("匯率收集失敗")}&per_page=1`, []);
  recorder403.recordError(`POST /repos/${repo}/labels`, "POST /repos/owner/repo/labels → HTTP 403：forbidden");

  await assert.rejects(
    () =>
      notifyIssue({
        action: "open",
        reason,
        call: recorder403.call.bind(recorder403),
        repo,
        runUrl,
        assignee,
        now,
      }),
    /HTTP 403/
  );
});

test("(c) 要開 issue、已經有開著的：只送一次 PATCH 換掉「最後一次」那行，舊的其他行不動、不留言", async () => {
  const recorder = new FakeCallRecorder();
  const existingIssue = {
    number: 42,
    body: "舊的理由\n\n最後一次：2026-10-13T17:00:00+08:00，舊理由（https://example.com）\n\n資料分支：fx-data",
  };
  recorder.recordResponse(`GET /repos/${repo}/issues?state=open&labels=${encodeURIComponent("匯率收集失敗")}&per_page=1`, [existingIssue]);
  recorder.recordResponse(`PATCH /repos/${repo}/issues/42`, {});

  const result = await notifyIssue({
    action: "open",
    reason,
    call: recorder.call.bind(recorder),
    repo,
    runUrl,
    assignee,
    now,
  });

  assert.equal(result, "更新了");
  assert.equal(recorder.requests.length, 2);
  assert.equal(recorder.requests[1].method, "PATCH");
  const patchedBody = recorder.requests[1].body.body;
  assert.equal(patchedBody, `舊的理由\n\n最後一次：${STAMP}，${reason}（${runUrl}）\n\n資料分支：fx-data`);
  assert.ok(patchedBody.includes("舊的理由"), "舊的其他行還在");
  assert.ok(patchedBody.includes("資料分支：fx-data"), "舊的其他行還在");
  assert.ok(!patchedBody.includes("2026-10-13T17:00:00+08:00"), "舊的時間戳已經被換掉");
  assert.ok(!patchedBody.includes("舊理由"), "舊的那行整行被換掉");
});

test("(d) 已開的 issue 內文沒有「最後一次：」那行：補在最後面", async () => {
  const recorder = new FakeCallRecorder();
  const existingIssue = {
    number: 42,
    body: "舊的內容沒有時間戳記\n\n其他資訊",
  };
  recorder.recordResponse(`GET /repos/${repo}/issues?state=open&labels=${encodeURIComponent("匯率收集失敗")}&per_page=1`, [existingIssue]);
  recorder.recordResponse(`PATCH /repos/${repo}/issues/42`, {});

  const result = await notifyIssue({
    action: "open",
    reason,
    call: recorder.call.bind(recorder),
    repo,
    runUrl,
    assignee,
    now,
  });

  assert.equal(result, "更新了");
  const patchedBody = recorder.requests[1].body.body;
  assert.match(patchedBody, /舊的內容沒有時間戳記/);
  assert.ok(patchedBody.includes(`最後一次：${STAMP}`));
  assert.match(patchedBody, /其他資訊/);
  // 是補在後面，不是蓋掉
  assert.ok(patchedBody.includes("舊的內容沒有時間戳記\n\n其他資訊\n\n最後一次："));
});

test("(e) 要關 issue、有開著的：先留言「恢復了」再把狀態改成 closed", async () => {
  const recorder = new FakeCallRecorder();
  const existingIssue = { number: 42, body: "某個失敗" };
  recorder.recordResponse(`GET /repos/${repo}/issues?state=open&labels=${encodeURIComponent("匯率收集失敗")}&per_page=1`, [existingIssue]);
  recorder.recordResponse(`POST /repos/${repo}/issues/42/comments`, {});
  recorder.recordResponse(`PATCH /repos/${repo}/issues/42`, {});

  const result = await notifyIssue({
    action: "close",
    reason,
    call: recorder.call.bind(recorder),
    repo,
    runUrl,
    assignee,
    now,
  });

  assert.equal(result, "關掉了");
  assert.equal(recorder.requests.length, 3);
  assert.equal(recorder.requests[1].method, "POST");
  assert.match(recorder.requests[1].url, /comments/);
  assert.match(recorder.requests[1].body.body, /恢復了/);
  assert.equal(recorder.requests[2].method, "PATCH");
  assert.equal(recorder.requests[2].body.state, "closed");
});

test("(f) 要關 issue、沒有開著的：只查一次，什麼都不動", async () => {
  const recorder = new FakeCallRecorder();
  recorder.recordResponse(`GET /repos/${repo}/issues?state=open&labels=${encodeURIComponent("匯率收集失敗")}&per_page=1`, []);

  const result = await notifyIssue({
    action: "close",
    reason,
    call: recorder.call.bind(recorder),
    repo,
    runUrl,
    assignee,
    now,
  });

  assert.equal(result, "沒有要動的");
  assert.equal(recorder.requests.length, 1);
  assert.equal(recorder.requests[0].method, "GET");
});

test("(g) 「最後一次：」出現在句子中間、不是行首：不算有那一行，補在最後面（判斷跟替換用同一個規則）", async () => {
  const recorder = new FakeCallRecorder();
  const existingIssue = { number: 42, body: "有人手寫：上次的最後一次：昨天\n\n其他資訊" };
  recorder.recordResponse(`GET /repos/${repo}/issues?state=open&labels=${encodeURIComponent("匯率收集失敗")}&per_page=1`, [existingIssue]);
  recorder.recordResponse(`PATCH /repos/${repo}/issues/42`, {});

  await notifyIssue({
    action: "open",
    reason,
    call: recorder.call.bind(recorder),
    repo,
    runUrl,
    assignee,
    now,
  });

  assert.equal(recorder.requests[1].body.body, `有人手寫：上次的最後一次：昨天\n\n其他資訊\n\n最後一次：${STAMP}，${reason}（${runUrl}）`);
});
