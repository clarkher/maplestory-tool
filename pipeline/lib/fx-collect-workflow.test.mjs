import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// 直接讀 workflow 原文：寫入權限只在 publish、run 裡不准 ${{ }}、別的分支手動跑預設不寫入、不准再連 8591（只讀參考站）
const FILE = path.join(import.meta.dirname, "../../.github/workflows/fx-collect.yml");
const WORKFLOW = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8").replace(/\r\n/g, "\n") : "";
const CODE = WORKFLOW.replace(/(^|[ \t])#.*$/gm, "").replace(/[ \t]+$/gm, "").replace(/^\n/gm, "");
const JOBS = CODE.slice(CODE.indexOf("\njobs:\n"));

function jobBlock(name) {
  const start = JOBS.indexOf(`\n  ${name}:\n`);
  if (start === -1) return "";
  const rest = JOBS.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[\w-]+:\n/);
  return next === -1 ? rest : rest.slice(0, next + 2);
}

/** 每個 run: 區塊的內容（單行或 | 底下縮排較深的行） */
function runBlocks() {
  const lines = CODE.split("\n");
  const blocks = [];
  lines.forEach((line, index) => {
    const match = line.match(/^(\s*)(?:- )?run: ?(.*)$/);
    if (!match) return;
    const indent = match[1].length;
    const body = [match[2]];
    for (let next = index + 1; next < lines.length && (lines[next].search(/\S/) > indent || lines[next].trim() === ""); next += 1) body.push(lines[next]);
    blocks.push(body.join("\n"));
  });
  return blocks;
}

const WRITE_CONDITION = "github.ref == 'refs/heads/main' || github.ref == 'refs/heads/dev' || inputs.write";

test("每 2 小時跑一次（台灣 00:55 起），可以手動跑，合進 dev 時改到收集程式也跑一次", () => {
  assert.ok(WORKFLOW, ".github/workflows/fx-collect.yml 要存在");
  assert.match(CODE, /\n {2}schedule:\n {4}- cron: "55 \*\/2 \* \* \*"\n/);
  assert.match(CODE, /\n {2}workflow_dispatch:\n/);
  assert.match(CODE, /\n {2}push:\n {4}branches: \[dev\]\n {4}paths:\n/);
  assert.doesNotMatch(CODE, /pull_request/);
});

test("同時只跑一個，不取消排隊中的（兩個一起推 fx-data 會互撞）", () => {
  assert.match(CODE, /\nconcurrency:\n {2}group: fx-collect\n {2}cancel-in-progress: false\n/);
});

test("collect 只能讀、checkout 不留 token；寫入（contents: write）只在 publish", () => {
  const collect = jobBlock("collect");
  assert.match(collect, /permissions:\n {6}contents: read\n/);
  assert.doesNotMatch(collect, /write/);
  for (const checkout of CODE.match(/uses: actions\/checkout@.*(?:\n {8}.*)*/g) ?? []) assert.match(checkout, /persist-credentials: false/);
  assert.equal(CODE.match(/contents: write/g)?.length, 1);
  assert.match(jobBlock("publish"), /contents: write/);
});

test("publish 只在 collect 成功、而且是 main／dev 或手動勾了 write 才跑；推之前先過 publish.mjs 的檢查", () => {
  const publish = jobBlock("publish");
  assert.ok(publish.includes(`if: needs.collect.result == 'success' && (${WRITE_CONDITION})`));
  const pushStep = publish.slice(publish.indexOf("publish.mjs"));
  assert.ok(publish.includes("node repo/pipeline/fx/publish.mjs"), "要先跑 publish.mjs 檢查");
  assert.match(pushStep, /\bgit (?:-C \S+ )?push\b/, "git push 要在 publish.mjs 之後");
  assert.doesNotMatch(publish.slice(0, publish.indexOf("publish.mjs")), /\bgit (?:-C \S+ )?push\b/, "publish.mjs 之前不准推");
  const mask = publish.indexOf('echo "::add-mask::$AUTH"');
  assert.ok(mask !== -1 && mask < publish.indexOf("extraheader"), "AUTH 要先遮掉再寫進 git 設定");
});

test("notify 有 issues: write、沒有 contents: write，成功失敗都跑", () => {
  const notify = jobBlock("notify");
  assert.match(notify, /issues: write/);
  assert.doesNotMatch(notify, /contents: write/);
  assert.match(notify, /if: \$\{\{ !cancelled\(\) \}\}/);
  assert.match(notify, /node pipeline\/fx\/notify\.mjs/);
  assert.match(notify, /AGE_HOURS: \$\{\{ needs\.collect\.outputs\.ageHours \}\}/);
  assert.doesNotMatch(CODE, /OK_8591|FAIL_8591|8591\.com\.tw/);
});

test("run 裡不准有 ${{ }}（上游、外站的字串會被當指令執行），一律用 env 傳", () => {
  const blocks = runBlocks();
  assert.ok(blocks.length >= 3);
  for (const block of blocks) assert.doesNotMatch(block, /\$\{\{/, block);
});

test("寫入條件只定義在 env.WRITE 與 publish 的 if，兩處一樣", () => {
  assert.ok(CODE.includes(`WRITE: \${{ (${WRITE_CONDITION}) && 'true' || 'false' }}`));
});

test("手動跑的 write 預設 false；上傳、下載的 artifact 名稱一樣", () => {
  assert.match(CODE, /\n {6}write:\n(?: {8}.*\n)* {8}default: false\n/);
  const names = [...CODE.matchAll(/\n {10}name: (fx-[\w-]+)\n/g)].map(match => match[1]);
  assert.deepEqual(names, ["fx-out", "fx-out"]);
});

test("fx-data 分支「真的不存在」才從空的開始：ls-remote --exit-code 0＝有、2＝沒有、其他（網路錯）整個失敗；publish 的 ls-remote 在 token header 設好之後", () => {
  const collect = jobBlock("collect");
  const publish = jobBlock("publish");
  for (const block of [collect, publish]) {
    assert.match(block, /ls-remote --exit-code --heads/);
    assert.match(block, /FOUND=\$\?/);
    assert.match(block, /\[ "\$FOUND" = 2 \]/);
    assert.match(block, /else\n\s+echo "查 fx-data 失敗（ls-remote 結束碼 \$FOUND）"\n\s+exit 1\n/);
  }
  // 舊寫法是 if 直接接指令：任何失敗（包括網路錯）都會被當成「沒有分支」
  assert.doesNotMatch(CODE, /if git (?:-C "\$WORK" )?(?:ls-remote|fetch)/);
  assert.ok(publish.indexOf("ls-remote") > publish.indexOf("extraheader"), "publish 的 ls-remote 要在 extraheader 設好之後");
});

test("沒有新的市價就不推：只有 latest.json、daily.json 變了（抓取時間）不算有變", () => {
  const publish = jobBlock("publish");
  assert.ok(publish.includes(`git -C "$WORK" diff --cached --quiet -- . ':!fx/scania/latest.json' ':!fx/scania/daily.json'`));
  assert.ok(publish.indexOf("diff --cached --quiet") < publish.indexOf("git -C \"$WORK\" commit"), "要先判斷再 commit");
});
