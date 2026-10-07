import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// 直接讀 workflow 原文檢查：dry-run 一路跑到底也不能動到正式機、寫入權限只在最後開 PR 合併的 publish，
// notify 拿得到它要的值
const WORKFLOWS_DIR = path.join(import.meta.dirname, "../../.github/workflows");
const readWorkflow = file => fs.readFileSync(path.join(WORKFLOWS_DIR, file), "utf8").replace(/\r\n/g, "\n");
const WORKFLOW = readWorkflow("data-refresh.yml");
const JOBS = WORKFLOW.slice(WORKFLOW.indexOf("\njobs:\n"));

/** jobs: 底下每個 job 的名稱（縮排兩格的「名稱:」）。 */
const JOB_NAMES = [...JOBS.matchAll(/\n {2}([\w-]+):\n/g)].map(match => match[1]);

/** 某個 job 從「  名稱:」到下一個 job 之前的整段；沒有這個 job 是空字串（第一個測試會抓）。 */
function jobBlock(name) {
  const start = JOBS.indexOf(`\n  ${name}:\n`);
  if (start === -1) return "";
  const rest = JOBS.slice(start + 1);
  const next = rest.search(/\n {2}[\w-]+:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

// refresh：唯讀建置（取上游、重建、檢查、next build，存成 artifact）；publish：拿 artifact 開 PR、合進 main；notify：失敗通知
const REFRESH = jobBlock("refresh");
const PUBLISH = jobBlock("publish");
const NOTIFY = jobBlock("notify");

// dry-run 只在 workflow 的 env 定義一次：勾了 dry_run、只勾 simulate_failure（測試用的失敗不該順便跑一次正式更新），
// 或不是從 main 觸發（在功能分支上手動跑忘了勾 dry_run，會把整條分支沒審過的程式一起合進正式機）
const DRY_RUN = "inputs.dry_run || inputs.simulate_failure || github.ref != 'refs/heads/main'";
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// 步驟條件最外層是「… && env.DRY_RUN != 'true'」；前面那段有 || 就得整段包括號，不然 && 先算、dry-run 照樣過
const SKIP_IF_DRY_RUN = /^\s*if: (?:\(.*\)|[^|]*) && env\.DRY_RUN != 'true'\s*$/m;
// job 的 if 讀不到 env，條件照抄同一個：最外層是「… && !(dry-run 的條件)」
const JOB_SKIP_IF_DRY_RUN = new RegExp(`^ {4}if: (?:\\(.*\\)|[^|]*) && !\\(${escapeRegExp(DRY_RUN)}\\)\\s*$`, "m");
const GUARD = 'if [ "$DRY_RUN" = "true" ]; then';
// 會寫進 repo 的指令：推分支、開／合 PR、用 API 寫入
const WRITES = /git push|gh pr |gh api [^\n]*(?:-X|--method) ?(?:POST|PATCH|PUT|DELETE)/;

/** 某一步（- name: 名稱）到下一步或下一個 job 之前的整段。 */
function stepBlock(name) {
  const start = WORKFLOW.indexOf(`- name: ${name}\n`);
  assert.notEqual(start, -1, `workflow 裡要有「${name}」這一步`);
  const rest = WORKFLOW.slice(start + 1);
  const next = rest.search(/\n\s*- (name|uses): |\n  [a-z]+:\n/);
  return next === -1 ? rest : rest.slice(0, next);
}

/** 某個 job 每一步的整段。 */
function stepsOf(job) {
  return job.split(/\n(?= {6}- )/).filter(block => /^ {6}- /.test(block));
}

const stepName = block => block.match(/- name: (.*)/)?.[1] ?? block.trim().slice(0, 40);

/** job 的 if（沒寫是 undefined）。 */
const jobIf = job => job.match(/^ {4}if: (.*)$/m)?.[1];

/** job 的 permissions（{ 權限: 等級 }，行尾註解不算）；沒寫就是 null。 */
function permissionsOf(job) {
  const block = job.match(/\n {4}permissions:\n((?: {6}.*\n?)*)/)?.[1];
  if (block === undefined) return null;
  const lines = block.split("\n").map(line => line.replace(/\s+#.*$/, "").trim()).filter(Boolean);
  return Object.fromEntries(lines.map(line => line.split(/:\s*/)));
}

/** 拿掉註解（# 開頭、行尾的 # …）再查：說明文字裡提到的不算。 */
const withoutComments = text => text.replace(/(^|[ \t])#.*$/gm, "$1");

/** 每個 run 的指令：同一行的 `run: 指令`，或 `run: |` 底下比 run 縮排深的每一行。 */
function runScripts(text) {
  const lines = text.split("\n");
  const scripts = [];
  lines.forEach((line, i) => {
    const match = line.match(/^( *)(-\s+)?run:(.*)$/);
    if (!match) return;
    // 值是空的、下一行又是「鍵: 值」：那是名字叫 run 的 job（v002-open.yml 就是），不是步驟的 run
    const nextLine = lines.slice(i + 1).find(text => text.trim()) ?? "";
    if (!match[3].trim() && /^\s*[\w-]+:(\s|$)/.test(nextLine)) return;
    const indent = match[1].length + (match[2]?.length ?? 0);
    const body = [match[3]];
    for (const next of lines.slice(i + 1)) {
      if (next.trim() && next.search(/\S/) <= indent) break;
      body.push(next);
    }
    scripts.push(body.join("\n"));
  });
  return scripts;
}

test("拆成三個 job：refresh（唯讀建置）→ publish（開 PR 合併）→ notify（通知）", () => {
  assert.deepEqual(JOB_NAMES, ["refresh", "publish", "notify"]);
});

test("dry-run 的定義寫在 workflow 開頭的 env，只寫一次", () => {
  assert.ok(WORKFLOW.includes(`\nenv:\n`), "workflow 要有 env");
  assert.ok(WORKFLOW.includes(`  DRY_RUN: \${{ ${DRY_RUN} }}\n`));
});

test("寫入權限只給 publish：每個 job 都寫明權限，contents: write、pull-requests: write 只有 publish 有，refresh 只能讀", () => {
  // 沒寫 permissions 的 job 拿的是 repo 的預設權限（舊的 repo 預設可以寫）
  const head = WORKFLOW.slice(0, WORKFLOW.indexOf("\njobs:\n"));
  assert.doesNotMatch(withoutComments(head), /\bwrite\b/, "workflow 開頭的 permissions 不能給寫入");
  for (const name of JOB_NAMES) {
    const permissions = permissionsOf(jobBlock(name));
    assert.ok(permissions, `${name} 要寫 permissions`);
    if (name === "publish") continue;
    assert.notEqual(permissions.contents, "write", `${name} 不能有 contents: write`);
    assert.notEqual(permissions["pull-requests"], "write", `${name} 不能有 pull-requests: write`);
  }
  // refresh 跑 npm ci、next build、讀第三方上游的資料：只給讀 repo
  assert.deepEqual(permissionsOf(REFRESH), { contents: "read" });
  assert.deepEqual(permissionsOf(PUBLISH), { contents: "write", "pull-requests": "write" });
});

test("refresh 的 checkout 不把 token 留在 .git 裡：後面跑 npm、next build、讀第三方上游的資料", () => {
  // 一個 checkout 步驟＝「- uses: actions/checkout@…」加上後面縮排 8 格以上的行（with: 底下的設定）
  const checkouts = REFRESH.match(/uses: actions\/checkout@.*(?:\n {8}.*)*/g) ?? [];
  assert.ok(checkouts.length > 0);
  for (const checkout of checkouts) assert.match(checkout, /\n {10}persist-credentials: false\n?/);
});

test("publish 不跑 npm、不跑 pipeline 的程式、不還原快取：有寫入權限的 job 只把 refresh 的產出當資料收", () => {
  assert.ok(PUBLISH.includes("- name: 開 PR 並自動合併\n"), "要有 publish 這個 job");
  assert.doesNotMatch(withoutComments(PUBLISH), /\bnpm\b|\bnpx\b|\bpipeline\/|\bcache:|actions\/cache/);
});

test("publish 拿得到 refresh 建好的資料檔：refresh 有重建就把 public/data、public/assets 存成 artifact，publish 下載同一個", () => {
  const upload = stepBlock("存下重建好的資料檔");
  assert.match(upload, /\n {8}uses: actions\/upload-artifact@v\d+\n/);
  assert.match(upload, /^\s*if: steps\.check\.outputs\.changed == 'true'\s*$/m);
  assert.match(upload, /\n {10}path: \|\n {12}public\/data\n {12}public\/assets\n/);
  const name = upload.match(/\n {10}name: (\S+)\n/)?.[1];
  assert.ok(name, "artifact 要有名字");
  assert.ok(REFRESH.includes(upload), "存 artifact 在 refresh 裡");

  const download = stepBlock("下載重建好的資料檔");
  assert.match(download, /\n {8}uses: actions\/download-artifact@v\d+\n/);
  assert.equal(download.match(/\n {10}name: (\S+)\n/)?.[1], name, "publish 要下載 refresh 存的那一個");
  assert.ok(PUBLISH.indexOf("- name: 下載重建好的資料檔\n") < PUBLISH.indexOf("- name: 開 PR 並自動合併\n"));
});

test("publish 等 refresh 全部成功、真的重建了才跑：不能加 always() 這類條件，不然檢查沒過的資料也會合進去", () => {
  assert.match(PUBLISH, /^ {4}needs: refresh$/m);
  const condition = jobIf(PUBLISH);
  assert.ok(condition, "publish 要有 if");
  assert.match(condition, /needs\.refresh\.outputs\.changed == 'true'/);
  assert.doesNotMatch(condition, /always\(\)|cancelled\(\)|failure\(\)|success\(\)/);
  assert.match(REFRESH, /^ {6}changed: \$\{\{ steps\.check\.outputs\.changed \}\}$/m);
});

test("dry-run 絕不能開 PR、合併（那一步會 --admin 直接合進 main＝正式機）：publish 整個 job 不跑、步驟條件再擋、步驟裡面在開分支與 push 之前再擋一次", () => {
  assert.match(PUBLISH, JOB_SKIP_IF_DRY_RUN);
  const block = stepBlock("開 PR 並自動合併");
  assert.ok(PUBLISH.includes(block), "開 PR 那步要在 publish 裡");
  assert.match(block, SKIP_IF_DRY_RUN);
  const guard = block.indexOf(GUARD);
  assert.notEqual(guard, -1, "步驟裡要再擋一次");
  for (const command of ["git checkout -b", "git commit", "git push", "gh pr create", "gh pr merge"]) {
    assert.ok(guard < block.indexOf(command), `要擋在 ${command} 之前`);
  }
});

test("不管以後加了哪一步：只要會 git push、gh pr、gh api 寫入，都只能放在 publish，而且步驟條件跟步驟裡面都擋 dry-run", () => {
  for (const name of JOB_NAMES.filter(name => name !== "publish")) {
    assert.deepEqual(stepsOf(jobBlock(name)).filter(block => WRITES.test(block)).map(stepName), [], `${name} 不能寫 repo`);
  }
  const writers = stepsOf(PUBLISH).filter(block => WRITES.test(block));
  assert.ok(writers.length > 0);
  for (const block of writers) {
    assert.match(block, SKIP_IF_DRY_RUN, `「${stepName(block)}」的 if 要在最外層擋 dry-run`);
    assert.ok(block.includes(GUARD), `「${stepName(block)}」裡面要再擋一次`);
  }
});

test("步驟條件、job 條件的檢查本身會抓到寫錯的條件（|| 沒包括號、沒擋 dry-run）", () => {
  assert.doesNotMatch("        if: a == 'x' || b == 'y' && env.DRY_RUN != 'true'", SKIP_IF_DRY_RUN);
  assert.doesNotMatch("        if: steps.check.outputs.changed == 'true'", SKIP_IF_DRY_RUN);
  assert.match("        if: (a == 'x' || b == 'y') && env.DRY_RUN != 'true'", SKIP_IF_DRY_RUN);
  assert.doesNotMatch(`    if: a == 'x' || b == 'y' && !(${DRY_RUN})`, JOB_SKIP_IF_DRY_RUN);
  assert.doesNotMatch(`    if: a == 'x' && !(inputs.dry_run || inputs.simulate_failure)`, JOB_SKIP_IF_DRY_RUN);
  assert.doesNotMatch("    if: needs.refresh.outputs.changed == 'true'", JOB_SKIP_IF_DRY_RUN);
  assert.match(`    if: needs.refresh.outputs.changed == 'true' && !(${DRY_RUN})`, JOB_SKIP_IF_DRY_RUN);
  assert.ok(WRITES.test("gh api repos/x/issues -X POST -f title=t"));
  assert.ok(!WRITES.test("gh api repos/x/issues"));
});

test("publish 先檢查下載的 artifact、版本字串，才動 public/、開分支、推：artifact 是 refresh 產的，那邊跑過 npm 跟上游的資料", () => {
  const block = stepBlock("開 PR 並自動合併");
  const at = text => {
    const index = block.indexOf(text);
    assert.notEqual(index, -1, `開 PR 那步要有 ${text}`);
    return index;
  };
  // 只能有 data、assets 兩個資料夾，裡面只能是一般檔案（隱藏檔、連結一律不收）
  assert.ok(at("find ") < at("rm -rf public/data public/assets"), "先檢查 artifact 再換掉 public/ 的資料");
  // 版本字串太長，開 PR 會被 GitHub 拒（標題上限 256 字），那時資料分支已經推上去了
  for (const name of ["VERSION", "STAMP"]) {
    assert.ok(at(`[[ "$${name}" =~ `) < at("git checkout -b"), `${name} 要在開分支前檢查`);
  }
});

test("每個 workflow 的 run 指令裡都不准直接寫 ${{ }}：上游的版本字串、手動觸發的輸入一律用 env 傳，指令裡寫 \"$變數\"", () => {
  // ${{ }} 是在 bash 跑之前把字串原樣貼進指令：上游的 generatedAt 寫成 `"; 指令; echo "` 就會在帶寫入權限的 CI 裡執行，
  // 這支最後一步還會 --admin 合進 main（正式機）。用 env 傳，字串只是變數的值，不會被當成程式碼
  assert.ok(runScripts(WORKFLOW).length >= 10, `data-refresh.yml 只找到 ${runScripts(WORKFLOW).length} 個 run，檢查本身可能壞了`);
  const files = fs.readdirSync(WORKFLOWS_DIR).filter(file => /\.ya?ml$/.test(file));
  assert.ok(files.includes("data-refresh.yml"));
  for (const file of files) {
    for (const script of runScripts(readWorkflow(file))) {
      const line = script.split("\n").find(text => text.includes("${{"));
      assert.equal(line, undefined, `${file} 的 run 裡有 \${{ }}：${line?.trim()}`);
    }
  }
});

test("run 指令的檢查本身抓得到 ${{ }}（多行、中間有空行、單行、> 摺疊、- run 都算），env 裡的不算", () => {
  const sample = [
    "      - name: a",
    "        env:",
    "          STAMP: ${{ steps.check.outputs.stamp }}",
    "        run: |",
    '          echo "$STAMP"',
    "      - name: b",
    "        run: |",
    "          set -e",
    "",
    '          STAMP="${{ steps.check.outputs.stamp }}"',
    "        timeout-minutes: 1",
    "      - name: c",
    '        run: echo "${{ inputs.force }}"',
    "      - name: d",
    "        run: >-",
    '          echo "${{ github.ref }}"',
    '      -   run: echo "${{ github.ref }}"',
    "          name: e",
  ].join("\n");
  assert.deepEqual(runScripts(sample).map(script => script.includes("${{")), [false, true, true, true, true]);

  // 名字叫 run 的 job 不是步驟的 run，底下 env 的 ${{ }} 不算；run: 後面換行才寫指令的照樣抓
  const job = ["jobs:", "  run:", "    runs-on: ubuntu-latest", "    steps:", "      - env:", "          TOKEN: ${{ github.token }}", "        run: node x.mjs"];
  assert.deepEqual(runScripts(job.join("\n")).map(script => script.includes("${{")), [false]);
  const plain = ["      - name: f", "        run:", '          echo "${{ github.ref }}"'];
  assert.deepEqual(runScripts(plain.join("\n")).map(script => script.includes("${{")), [true]);
});

test("上游版本字串改從 env 傳進要用的步驟：比對版本拿得到網站目前的版本與 force，開 PR 那步拿得到 refresh 的上游版本（漏接會變空字串）", () => {
  const check = stepBlock("比對版本");
  assert.match(check, /\n {10}BEFORE: \$\{\{ steps\.before\.outputs\.stamp \}\}\n/);
  assert.match(check, /\n {10}FORCE: \$\{\{ inputs\.force \}\}\n/);
  assert.match(check, /"\$BEFORE"/);
  assert.match(check, /"\$FORCE"/);
  const merge = stepBlock("開 PR 並自動合併");
  assert.match(merge, /\n {10}STAMP: \$\{\{ needs\.refresh\.outputs\.stamp \}\}\n/);
  assert.match(merge, /"\$STAMP"/);
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
  assert.ok(WORKFLOW.includes(`  group: data-refresh\${{ (${DRY_RUN}) && '-dry-run' || '' }}\n`));
});

test("refresh、publish 都有時間上限：卡住不會一直佔著到 6 小時，被中止也會通知", () => {
  for (const [name, job] of [["refresh", REFRESH], ["publish", PUBLISH]]) {
    const minutes = Number(job.match(/^ {4}timeout-minutes: (\d+)/m)?.[1]);
    assert.ok(minutes >= 5 && minutes <= 60, `${name} 的 timeout-minutes 是 ${minutes}`);
  }
});

test("首頁真資料檢查用預設的輸出格式：不加 GitHub 標註，失敗時錯誤訊息最後幾行才看得到測試名與摘要", () => {
  assert.match(stepBlock("首頁每個組合跑一次真資料檢查"), /npx vitest run --reporter=default /);
});

test("notify 接在 refresh、publish 後面、成功失敗都跑，拿得到兩個 job 的結果與兩個版本號，有開 issue 與讀 log 的權限", () => {
  assert.match(NOTIFY, /needs: \[refresh, publish\]\n/);
  assert.match(NOTIFY, /if: \$\{\{ !cancelled\(\) \}\}\n/);
  assert.match(NOTIFY, /issues: write/);
  assert.match(NOTIFY, /actions: read/);
  assert.match(NOTIFY, /REFRESH_RESULT: \$\{\{ needs\.refresh\.result \}\}/);
  assert.match(NOTIFY, /PUBLISH_RESULT: \$\{\{ needs\.publish\.result \}\}/);
  assert.match(NOTIFY, /UPSTREAM_STAMP: \$\{\{ needs\.refresh\.outputs\.stamp \}\}/);
  assert.match(NOTIFY, /SITE_STAMP: \$\{\{ needs\.refresh\.outputs\.before \}\}/);
  assert.doesNotMatch(NOTIFY, /DRY_RUN:/, "DRY_RUN 用 workflow 開頭那一個，不要在這裡另外定義");
  assert.match(NOTIFY, /run: node pipeline\/notify-refresh\.mjs/);

  assert.match(REFRESH, /stamp: \$\{\{ steps\.check\.outputs\.stamp \}\}/);
  assert.match(REFRESH, /before: \$\{\{ steps\.before\.outputs\.stamp \}\}/);
});
