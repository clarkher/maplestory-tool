import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// 直接讀 workflow 原文檢查：dry-run 一路跑到底也不能動到正式機，notify 拿得到它要的值
const WORKFLOW = fs.readFileSync(path.join(import.meta.dirname, "../../.github/workflows/data-refresh.yml"), "utf8").replace(/\r\n/g, "\n");

/** 某一步（- name: 名稱）到下一步或下一個 job 之前的整段。 */
function stepBlock(name) {
  const start = WORKFLOW.indexOf(`- name: ${name}\n`);
  assert.notEqual(start, -1, `workflow 裡要有「${name}」這一步`);
  const rest = WORKFLOW.slice(start + 1);
  const next = rest.search(/\n\s*- (name|uses): |\n  [a-z]+:\n/);
  return next === -1 ? rest : rest.slice(0, next);
}

test("dry-run 絕不能開 PR、合併（那一步會 --admin 直接合進 main＝正式機）：步驟條件擋一次、步驟裡面在 push 之前再擋一次", () => {
  const block = stepBlock("開 PR 並自動合併");
  assert.match(block, /^\s*if: .*&& !inputs\.dry_run\s*$/m);
  const guard = block.indexOf('if [ "${{ inputs.dry_run }}" = "true" ]; then');
  assert.notEqual(guard, -1, "步驟裡要再擋一次");
  assert.ok(guard < block.indexOf("git push"), "要擋在 git push 之前");
  assert.ok(guard < block.indexOf("gh pr merge"), "要擋在合併之前");
});

test("故意失敗那一步只在 dry_run 而且勾了 simulate_failure 時跑，放在比對版本之後（issue 才有上游版本）", () => {
  assert.match(stepBlock("（測試）故意失敗"), /^\s*if: inputs\.dry_run && inputs\.simulate_failure\s*$/m);
  const at = name => WORKFLOW.indexOf(`- name: ${name}\n`);
  assert.ok(at("比對版本") < at("（測試）故意失敗"));
  assert.ok(at("（測試）故意失敗") < at("安裝相依套件"));
});

test("dry-run 自己排一列：同一群組只留一個排隊中的，不能把正式排程擠掉", () => {
  assert.match(WORKFLOW, /^ {2}group: data-refresh\$\{\{ inputs\.dry_run && '-dry-run' \|\| '' \}\}$/m);
});

test("notify 接在 refresh 後面、成功失敗都跑，拿得到 refresh 的結果與兩個版本號，有開 issue 與讀 log 的權限", () => {
  const notify = WORKFLOW.slice(WORKFLOW.indexOf("\n  notify:\n"));
  assert.match(notify, /needs: refresh\n/);
  assert.match(notify, /if: \$\{\{ !cancelled\(\) \}\}\n/);
  assert.match(notify, /issues: write/);
  assert.match(notify, /actions: read/);
  assert.match(notify, /REFRESH_RESULT: \$\{\{ needs\.refresh\.result \}\}/);
  assert.match(notify, /UPSTREAM_STAMP: \$\{\{ needs\.refresh\.outputs\.stamp \}\}/);
  assert.match(notify, /SITE_STAMP: \$\{\{ needs\.refresh\.outputs\.before \}\}/);
  assert.match(notify, /run: node pipeline\/notify-refresh\.mjs/);

  const refresh = WORKFLOW.slice(WORKFLOW.indexOf("\n  refresh:\n"), WORKFLOW.indexOf("\n  notify:\n"));
  assert.match(refresh, /stamp: \$\{\{ steps\.check\.outputs\.stamp \}\}/);
  assert.match(refresh, /before: \$\{\{ steps\.before\.outputs\.stamp \}\}/);
});
