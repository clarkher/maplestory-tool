import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// 直接讀 workflow 原文檢查：dry-run 一路跑到底也不能動到正式機，notify 拿得到它要的值
const WORKFLOW = fs.readFileSync(path.join(import.meta.dirname, "../../.github/workflows/data-refresh.yml"), "utf8").replace(/\r\n/g, "\n");
const REFRESH = WORKFLOW.slice(WORKFLOW.indexOf("\n  refresh:\n"), WORKFLOW.indexOf("\n  notify:\n"));
const NOTIFY = WORKFLOW.slice(WORKFLOW.indexOf("\n  notify:\n"));

// 勾了 dry_run，或只勾 simulate_failure（測試用的失敗不該順便跑一次正式更新），都算 dry-run
const DRY_RUN = "(inputs.dry_run || inputs.simulate_failure)";
const SKIP_IF_DRY_RUN = new RegExp(`^\\s*if: .*&& !\\(inputs\\.dry_run \\|\\| inputs\\.simulate_failure\\)\\s*$`, "m");
const GUARD = 'if [ "${{ inputs.dry_run || inputs.simulate_failure }}" = "true" ]; then';

/** 某一步（- name: 名稱）到下一步或下一個 job 之前的整段。 */
function stepBlock(name) {
  const start = WORKFLOW.indexOf(`- name: ${name}\n`);
  assert.notEqual(start, -1, `workflow 裡要有「${name}」這一步`);
  const rest = WORKFLOW.slice(start + 1);
  const next = rest.search(/\n\s*- (name|uses): |\n  [a-z]+:\n/);
  return next === -1 ? rest : rest.slice(0, next);
}

/** refresh job 每一步的整段。 */
function refreshSteps() {
  return REFRESH.split(/\n(?= {6}- )/).filter(block => /^ {6}- /.test(block));
}

test("dry-run 絕不能開 PR、合併（那一步會 --admin 直接合進 main＝正式機）：步驟條件擋一次、步驟裡面在開分支與 push 之前再擋一次", () => {
  const block = stepBlock("開 PR 並自動合併");
  assert.match(block, SKIP_IF_DRY_RUN);
  const guard = block.indexOf(GUARD);
  assert.notEqual(guard, -1, "步驟裡要再擋一次");
  for (const command of ["git checkout -b", "git commit", "git push", "gh pr create", "gh pr merge"]) {
    assert.ok(guard < block.indexOf(command), `要擋在 ${command} 之前`);
  }
});

test("不管以後加了哪一步：只要會 git push、gh pr，都要在步驟條件跟步驟裡面擋 dry-run", () => {
  const writers = refreshSteps().filter(block => /git push|gh pr /.test(block));
  assert.ok(writers.length > 0);
  for (const block of writers) {
    const name = block.match(/- name: (.*)/)?.[1] ?? block.slice(0, 40);
    assert.match(block, SKIP_IF_DRY_RUN, `「${name}」的 if 要擋 dry-run`);
    assert.ok(block.includes(GUARD), `「${name}」裡面要再擋一次`);
  }
});

test("故意失敗那一步只在勾了 simulate_failure 時跑，放在比對版本之後（issue 才有上游版本），兩行輸出照順序", () => {
  const block = stepBlock("（測試）故意失敗");
  assert.match(block, /^\s*if: inputs\.simulate_failure\s*$/m);
  assert.doesNotMatch(block, />&2/, "stdout、stderr 混著印，runner 收到的順序會亂");
  const at = name => WORKFLOW.indexOf(`- name: ${name}\n`);
  assert.ok(at("比對版本") < at("（測試）故意失敗"));
  assert.ok(at("（測試）故意失敗") < at("安裝相依套件"));
});

test("dry-run 自己排一列：同一群組只留一個排隊中的，不能把正式排程擠掉", () => {
  assert.ok(WORKFLOW.includes(`  group: data-refresh\${{ ${DRY_RUN} && '-dry-run' || '' }}\n`));
});

test("refresh 有時間上限：卡住不會一直佔著到 6 小時，被中止也會通知", () => {
  const minutes = Number(REFRESH.match(/^ {4}timeout-minutes: (\d+)/m)?.[1]);
  assert.ok(minutes >= 20 && minutes <= 60, `refresh 的 timeout-minutes 是 ${minutes}`);
});

test("notify 接在 refresh 後面、成功失敗都跑，拿得到 refresh 的結果與兩個版本號，有開 issue 與讀 log 的權限", () => {
  assert.match(NOTIFY, /needs: refresh\n/);
  assert.match(NOTIFY, /if: \$\{\{ !cancelled\(\) \}\}\n/);
  assert.match(NOTIFY, /issues: write/);
  assert.match(NOTIFY, /actions: read/);
  assert.match(NOTIFY, /REFRESH_RESULT: \$\{\{ needs\.refresh\.result \}\}/);
  assert.match(NOTIFY, /UPSTREAM_STAMP: \$\{\{ needs\.refresh\.outputs\.stamp \}\}/);
  assert.match(NOTIFY, /SITE_STAMP: \$\{\{ needs\.refresh\.outputs\.before \}\}/);
  assert.ok(NOTIFY.includes(`DRY_RUN: \${{ ${DRY_RUN} == true }}`));
  assert.match(NOTIFY, /run: node pipeline\/notify-refresh\.mjs/);

  assert.match(REFRESH, /stamp: \$\{\{ steps\.check\.outputs\.stamp \}\}/);
  assert.match(REFRESH, /before: \$\{\{ steps\.before\.outputs\.stamp \}\}/);
});
