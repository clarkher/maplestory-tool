import test from "node:test";
import assert from "node:assert/strict";
import { notifyIssue } from "./notify-issue.mjs";

const repo = "owner/repo";
const assignee = "testuser";
const reason = "測試失敗";
const runUrl = "https://github.com/owner/repo/actions/runs/123";
const now = new Date("2026-10-13T10:00:00Z");

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
    if (!response) throw new Error(`Unexpected call: ${key}`);
    if (response.error) throw new Error(response.message);
    return response;
  }
}

test("(a) open with no open issue → label POST then issue POST", async () => {
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

  assert.equal(result, "created");
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
  assert.match(recorder.requests[2].body.body, /最後一次：/);
});

test("(b) label POST HTTP 422 → still creates issue; HTTP 403 → rejects", async () => {
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

  assert.equal(result, "created");
  assert.equal(recorder.requests.length, 3, "should try label, get 422, then create issue");

  // Test 403 rejection
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

test("(c) open with existing issue → one PATCH with new line, no POST", async () => {
  const recorder = new FakeCallRecorder();
  const existingIssue = {
    number: 42,
    body: "舊的理由\n\n最後一次：2026-10-13T09:00:00Z，舊理由（https://example.com）\n\n資料分支：fx-data",
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

  assert.equal(result, "updated");
  assert.equal(recorder.requests.length, 2);
  assert.equal(recorder.requests[1].method, "PATCH");
  assert.match(recorder.requests[1].body.body, /最後一次：2026-10-13T10:00:00\.000Z/);
  assert.match(recorder.requests[1].body.body, /測試失敗/);
});

test("(d) existing body without 「最後一次：」 line → line appended", async () => {
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

  assert.equal(result, "updated");
  const patchedBody = recorder.requests[1].body.body;
  assert.match(patchedBody, /舊的內容沒有時間戳記/);
  assert.match(patchedBody, /最後一次：2026-10-13T10:00:00\.000Z/);
  assert.match(patchedBody, /其他資訊/);
  // Verify appended (not replaced)
  assert(patchedBody.includes("舊的內容沒有時間戳記\n\n其他資訊\n\n最後一次："));
});

test("(e) close with open issue → comment POST then PATCH {state:\"closed\"}", async () => {
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

  assert.equal(result, "closed");
  assert.equal(recorder.requests.length, 3);
  assert.equal(recorder.requests[1].method, "POST");
  assert.match(recorder.requests[1].url, /comments/);
  assert.match(recorder.requests[1].body.body, /恢復了/);
  assert.equal(recorder.requests[2].method, "PATCH");
  assert.equal(recorder.requests[2].body.state, "closed");
});

test("(f) close with none open → only the GET", async () => {
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

  assert.equal(result, "nothing");
  assert.equal(recorder.requests.length, 1);
  assert.equal(recorder.requests[0].method, "GET");
});
