import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// PR 自動測試（.github/workflows/test.yml）直接讀原文檢查：進 dev 的 PR 一定有跑、跑的是完整的 npm test、
// 失敗就是紅燈，而且 PR 的程式碼拿不到寫入權限
const FILE = path.join(import.meta.dirname, "../../.github/workflows/test.yml");
const WORKFLOW = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8").replace(/\r\n/g, "\n") : "";
// 拿掉註解、行尾空白、空行再查：說明文字裡寫「不用 pull_request_target」不算，行尾加註解、中間插一行註解也不影響
const CODE = WORKFLOW.replace(/(^|[ \t])#.*$/gm, "").replace(/[ \t]+$/gm, "").replace(/^\n/gm, "");

/** on: 底下某個事件的 branches（[a, b] 寫法）。 */
function branchesOf(event) {
  const on = CODE.slice(CODE.indexOf("\non:\n"));
  const list = on.match(new RegExp(`\\n  ${event}:\\n    branches: \\[([^\\]]*)\\]`))?.[1];
  return list?.split(",").map(name => name.trim()) ?? [];
}

test("PR 進 dev 或 main 都會跑，合進 dev 之後也跑一次", () => {
  assert.ok(WORKFLOW, ".github/workflows/test.yml 要存在");
  assert.deepEqual(branchesOf("pull_request").sort(), ["dev", "main"]);
  assert.deepEqual(branchesOf("push"), ["dev"]);
});

test("不用 pull_request_target：那個觸發用的是目標分支的權限跟 secrets，跑 PR 的程式碼等於把寫入權限交出去", () => {
  assert.ok(WORKFLOW, ".github/workflows/test.yml 要存在");
  assert.doesNotMatch(CODE, /pull_request_target/);
});

test("權限只有 contents: read，job 不能自己再加；checkout 不把 token 留在 .git 裡", () => {
  assert.match(CODE, /^permissions:\n  contents: read\n(?! )/m, "workflow 開頭的 permissions 只有 contents: read");
  assert.equal(CODE.match(/^\s*permissions:/gm)?.length, 1, "只有開頭那一個 permissions");
  assert.doesNotMatch(CODE, /\bwrite\b/);
  // 一個 checkout 步驟＝「- uses: actions/checkout@…」加上後面縮排 8 格以上的行（with: 底下的設定）
  const checkouts = CODE.match(/uses: actions\/checkout@.*(?:\n {8}.*)*/g) ?? [];
  assert.ok(checkouts.length > 0);
  for (const checkout of checkouts) assert.match(checkout, /persist-credentials: false/);
});

test("跑的是完整的 npm test（pipeline 的 node:test＋src 的 vitest），先 npm ci，失敗不能被當成通過", () => {
  const install = CODE.indexOf("run: npm ci\n");
  const run = CODE.search(/run: npm test\n/);
  assert.notEqual(install, -1, "要先 npm ci");
  assert.notEqual(run, -1, "要跑 npm test");
  assert.ok(install < run);
  assert.doesNotMatch(CODE, /continue-on-error/, "continue-on-error 會讓失敗變綠燈");
});
