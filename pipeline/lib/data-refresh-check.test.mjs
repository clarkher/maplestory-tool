import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// 把 data-refresh.yml refresh job 的「記下更新前的版本」「比對版本」兩步的 bash 拿出來真的跑（跟
// data-refresh-publish.test.mjs 對開 PR 那步做的事一樣）：暫存資料夾放假的 public/data/meta.json 跟 data/raw/artale.json，
// 看寫進 $GITHUB_OUTPUT 的 stamp／hash／changed 對不對。
//
// 比對規則（v1.11）：上游作者手動修資料不會改 generatedAt（2026-10-16、10-17、10-21 三次都是），
// 只比時間就一次都沒抓到，所以改成——
//   勾了 force                                  → 重建
//   兩邊都有雜湊（網站 dataHash、上游 contentHash） → 雜湊不同，或產生時間不同，都重建（時間照舊算，不會比以前少抓）
//   任一邊沒有雜湊（舊的 meta.json、本機抽檔）      → 照舊只比產生時間
const WORKFLOW = fs.readFileSync(path.join(import.meta.dirname, "../../.github/workflows/data-refresh.yml"), "utf8").replace(/\r\n/g, "\n");

/** 某一步（- name: 名稱）的 run: | 底下那段（去掉 10 格縮排）。 */
function stepScript(name) {
  const lines = WORKFLOW.split("\n");
  const start = lines.indexOf(`      - name: ${name}`);
  assert.notEqual(start, -1, `workflow 裡要有「${name}」這一步`);
  const run = lines.findIndex((line, i) => i > start && line === "        run: |");
  assert.notEqual(run, -1, `「${name}」要有 run: |`);
  const body = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() && !line.startsWith("          ")) break;
    body.push(line.slice(10));
  }
  return body.join("\n");
}

/** Windows 用 Git 附的 bash（PATH 上的 bash 可能是 WSL 的）；其他平台用 PATH 上的。 */
function findBash() {
  if (process.platform !== "win32") return "bash";
  const roots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], "C:/Program Files"].filter(Boolean);
  return roots.map(root => path.join(root, "Git", "bin", "bash.exe")).find(file => fs.existsSync(file)) ?? null;
}

const BASH = findBash();
const CAN_RUN = Boolean(BASH) && spawnSync(BASH, ["-c", "node --version"], { env: nodeEnv() }).status === 0;
// CI 的 ubuntu 一定有 bash、node：那裡少了算失敗，本機（Windows 沒裝 Git）才跳過
const SKIP = CAN_RUN || process.env.CI ? false : "這台沒有 bash 或 node（CI 會跑）";

/** 讓 bash 裡找得到跑這支測試的 node。 */
function nodeEnv(extra = {}) {
  // Windows 的環境變數名不分大小寫（Path），展開後再加一個 PATH 會變成兩個
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  return { ...env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`, ...extra };
}

const posix = file => file.replace(/\\/g, "/");

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const STAMP_OLD = "2026-10-15T22:04:30+08:00";
const STAMP_NEW = "2026-10-22T09:00:00+08:00";

/**
 * 在暫存資料夾跑某一步，回傳結束碼、輸出、寫進 $GITHUB_OUTPUT 的鍵值（同一個鍵出現兩次會被抓到）。
 * site：public/data/meta.json 的內容（null ＝ 沒有這個檔）；artale：data/raw/artale.json 的內容。
 */
function runStep(name, { site = null, artale = null, env = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-check-"));
  try {
    if (site !== null) {
      fs.mkdirSync(path.join(dir, "public/data"), { recursive: true });
      fs.writeFileSync(path.join(dir, "public/data/meta.json"), JSON.stringify(site));
    }
    if (artale !== null) {
      fs.mkdirSync(path.join(dir, "data/raw"), { recursive: true });
      fs.writeFileSync(path.join(dir, "data/raw/artale.json"), JSON.stringify(artale));
    }
    fs.writeFileSync(path.join(dir, "step.sh"), stepScript(name));
    const output = path.join(dir, "github-output");
    fs.writeFileSync(output, "");
    const result = spawnSync(BASH, ["-e", posix(path.join(dir, "step.sh"))], {
      cwd: dir,
      encoding: "utf8",
      env: nodeEnv({ GITHUB_OUTPUT: posix(output), BEFORE: "", BEFORE_HASH: "", FORCE: "", ...env }),
    });
    const lines = fs.readFileSync(output, "utf8").split("\n").filter(Boolean);
    const outputs = {};
    for (const line of lines) {
      const [key, ...rest] = line.split("=");
      assert.equal(key in outputs, false, `$GITHUB_OUTPUT 的 ${key} 寫了兩次：${lines.join(" | ")}`);
      outputs[key] = rest.join("=");
    }
    return { code: result.status, log: `${result.stdout}${result.stderr}`, outputs, lines };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** 比對版本：網站目前的 stamp／hash（BEFORE／BEFORE_HASH）對上 artale.json 的 generatedAt／contentHash。 */
function check({ before = STAMP_OLD, beforeHash = "", after = STAMP_OLD, afterHash, force = "" }) {
  const metadata = { generatedAt: after, ...(afterHash === undefined ? {} : { contentHash: afterHash }) };
  return runStep("比對版本", { artale: { metadata }, env: { BEFORE: before, BEFORE_HASH: beforeHash, FORCE: force } });
}

describe("refresh job 的兩步 bash 真的跑一次", { skip: SKIP, concurrency: true, timeout: 120_000 }, () => {
  test("兩邊都有雜湊、雜湊不同、產生時間一樣（上游手動修資料的情境）→ 要重建，紀錄寫是內容變了", () => {
    const result = check({ beforeHash: HASH_A, afterHash: HASH_B });
    assert.equal(result.code, 0, result.log);
    assert.equal(result.outputs.changed, "true");
    assert.equal(result.outputs.stamp, STAMP_OLD);
    assert.equal(result.outputs.hash, HASH_B);
    assert.match(result.log, /內容/);
    assert.match(result.log, new RegExp(`${HASH_A.slice(0, 8)}.*${HASH_B.slice(0, 8)}`), "紀錄寫前 8 碼");
    assert.doesNotMatch(result.log, new RegExp(HASH_A), "不用把整串 64 碼印出來");
  });

  test("兩邊都有雜湊、雜湊一樣、時間也一樣 → 不重建", () => {
    const result = check({ beforeHash: HASH_A, afterHash: HASH_A });
    assert.equal(result.code, 0, result.log);
    assert.equal(result.outputs.changed, "false");
    assert.equal(result.outputs.hash, HASH_A);
    assert.match(result.log, /沒變/);
  });

  test("兩邊都有雜湊、雜湊一樣、產生時間不同 → 還是重建（時間照舊算，不會比以前少抓），紀錄寫是產生時間變了", () => {
    const result = check({ beforeHash: HASH_A, afterHash: HASH_A, after: STAMP_NEW });
    assert.equal(result.code, 0, result.log);
    assert.equal(result.outputs.changed, "true");
    assert.equal(result.outputs.stamp, STAMP_NEW);
    assert.match(result.log, /產生時間/);
  });

  test("網站的 meta.json 還沒有雜湊（舊版）：照舊只比時間，時間一樣不重建（不會因為上游多了雜湊就白白重建）", () => {
    const same = check({ beforeHash: "", afterHash: HASH_A });
    assert.equal(same.outputs.changed, "false", same.log);
    assert.equal(same.outputs.hash, HASH_A, "雜湊還是輸出：重建後要寫進 meta.json");
    const later = check({ beforeHash: "", afterHash: HASH_A, after: STAMP_NEW });
    assert.equal(later.outputs.changed, "true", later.log);
  });

  test("上游這邊沒有雜湊（本機抽檔 artale.local.json）：照舊只比時間，輸出的 hash 是空的", () => {
    const same = check({ beforeHash: HASH_A, afterHash: undefined });
    assert.equal(same.code, 0, same.log);
    assert.equal(same.outputs.changed, "false");
    assert.equal(same.outputs.hash, "");
    assert.equal(check({ beforeHash: HASH_A, afterHash: undefined, after: STAMP_NEW }).outputs.changed, "true");
    assert.equal(check({ beforeHash: HASH_A, afterHash: null }).outputs.hash, "", "contentHash 是 null 也當沒有");
  });

  test("兩邊都沒有雜湊：跟以前一模一樣（只比 generatedAt）", () => {
    assert.equal(check({}).outputs.changed, "false");
    assert.equal(check({ after: STAMP_NEW }).outputs.changed, "true");
    assert.equal(check({ before: "" }).outputs.changed, "true", "網站還沒有版本（第一次）要重建");
  });

  test("勾了 force：什麼都一樣也重建", () => {
    const result = check({ beforeHash: HASH_A, afterHash: HASH_A, force: "true" });
    assert.equal(result.outputs.changed, "true");
    assert.match(result.log, /force/);
    assert.equal(check({ beforeHash: HASH_A, afterHash: HASH_A, force: "false" }).outputs.changed, "false");
  });

  test("雜湊格式不對（不是 64 位小寫 hex）：當成沒有，不寫進輸出——它會進分支名、PR 標題，換行還能多寫一行 $GITHUB_OUTPUT", () => {
    const bad = [
      "abc",
      HASH_A.toUpperCase(),
      `${HASH_A}0`,
      `${HASH_A.slice(1)}g`,
      `${HASH_A}\nchanged=false`,
      `${HASH_A}\n::warning::x`,
      '"; echo INJECTED; echo "',
      12345,
      { nested: HASH_A },
    ];
    for (const value of bad) {
      const result = check({ beforeHash: HASH_A, afterHash: value, after: STAMP_NEW });
      const label = JSON.stringify(value).slice(0, 40);
      assert.equal(result.code, 0, `${label}\n${result.log}`);
      assert.equal(result.outputs.hash, "", `${label} 不該被收下`);
      assert.deepEqual(result.lines.map(line => line.split("=")[0]).sort(), ["changed", "hash", "stamp"], `${label}：$GITHUB_OUTPUT 只能有這三行`);
      assert.equal(result.outputs.changed, "true", `${label}：時間不一樣，照舊算有變`);
      assert.doesNotMatch(result.log, /INJECTED/);
    }
    // 網站這邊傳進來的也一樣擋（BEFORE_HASH 格式不對就當舊版）
    const result = check({ beforeHash: `${HASH_A}\nchanged=false`, afterHash: HASH_B });
    assert.equal(result.outputs.changed, "false", "網站這邊的雜湊不可信，當成沒有：只比時間（一樣）");
    assert.deepEqual(result.lines.map(line => line.split("=")[0]).sort(), ["changed", "hash", "stamp"]);
  });

  test("記下更新前的版本：stamp 跟 hash 都記；舊版沒有 dataHash、格式不對、沒有 meta.json 都是空字串", () => {
    const run = site => runStep("記下更新前的版本", { site });
    const full = run({ dataGeneratedAt: STAMP_OLD, dataHash: HASH_A });
    assert.equal(full.code, 0, full.log);
    assert.deepEqual(full.outputs, { stamp: STAMP_OLD, hash: HASH_A });

    assert.deepEqual(run({ dataGeneratedAt: STAMP_OLD }).outputs, { stamp: STAMP_OLD, hash: "" });
    assert.deepEqual(run({ dataGeneratedAt: STAMP_OLD, dataHash: null }).outputs, { stamp: STAMP_OLD, hash: "" });
    assert.deepEqual(run({ dataGeneratedAt: STAMP_OLD, dataHash: `${HASH_A}\nx=1` }).outputs, { stamp: STAMP_OLD, hash: "" });
    assert.deepEqual(run({ dataGeneratedAt: STAMP_OLD, dataHash: "ABC" }).outputs, { stamp: STAMP_OLD, hash: "" });

    const none = run(null);
    assert.equal(none.code, 0, none.log);
    assert.deepEqual(none.outputs, { stamp: "", hash: "" });
  });
});
