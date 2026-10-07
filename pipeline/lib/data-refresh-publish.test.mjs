import test, { after, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";

// 把 data-refresh.yml「開 PR 並自動合併」那一步的 bash 拿出來真的跑：origin 是暫存資料夾裡的 bare repo，
// gh 換成只記參數的假指令（GH_HOST 指到不存在的主機，萬一叫到真的 gh 也連不出去）。
// 這一步在整支 workflow 唯一有寫入權限的 publish job 裡，會 --admin 合進 main（正式機）；它收的 artifact 是 refresh 產的
// （那邊跑過 npm、讀過第三方上游的資料），所以用真的 bash、git 確認：壞掉的 artifact 不會被執行、不會被推上去。
const WORKFLOW = fs.readFileSync(path.join(import.meta.dirname, "../../.github/workflows/data-refresh.yml"), "utf8").replace(/\r\n/g, "\n");
const execFileAsync = promisify(execFile);

/** 「開 PR 並自動合併」的 run: | 底下那段（去掉 10 格縮排）。 */
function publishScript() {
  const lines = WORKFLOW.split("\n");
  const start = lines.indexOf("      - name: 開 PR 並自動合併");
  const run = lines.findIndex((line, i) => start !== -1 && i > start && line === "        run: |");
  if (run === -1) return null;
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
const CAN_RUN = Boolean(BASH) && spawnSync(BASH, ["-c", "git --version"]).status === 0;
// CI 的 ubuntu 一定有 bash、git：那裡少了算失敗，本機（Windows 沒裝 Git）才跳過
const SKIP = CAN_RUN || process.env.CI ? false : "這台沒有 bash 或 git（CI 會跑）";
const SCRIPT = publishScript();

const STAMP = "2026-10-08T10:00:00+08:00";
const BRANCH = "data/refresh-20261008100000";
// 網站目前的檔（public/ 以外也有東西：artifact 不該動到它們）
const SITE = {
  "public/data/meta.json": JSON.stringify({ gameVersion: "1.15.2", dataGeneratedAt: "2026-09-24T11:25:10+08:00" }),
  "public/data/items.json": "[1]",
  "public/assets/items/1.png": "png-1",
  "src/app.ts": "export {};",
};
// 重建好的：meta 改版、多一個任務檔、items.json 不見了（上游拿掉）、多一張圖、舊圖沒變
const FRESH = {
  "data/meta.json": JSON.stringify({ gameVersion: "1.15.3", dataGeneratedAt: STAMP }),
  "data/quests.json": "[2]",
  "assets/items/1.png": "png-1",
  "assets/items/2.png": "png-2",
};
// 被執行到就留下記號檔
const EVIL_JS = 'require("fs").writeFileSync(process.env.PWNED_MARKER, "pwned"); module.exports = { gameVersion: "1.15.3" };';
const without = (files, name) => Object.fromEntries(Object.entries(files).filter(([file]) => file !== name));

const posix = file => file.replace(/\\/g, "/");

function writeTree(root, files) {
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
}

/** 不吃這台電腦的 git 設定（autocrlf、hooks、預設分支名）。 */
function gitEnv(root) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  return { ...env, PATH: process.env.PATH, GIT_CONFIG_GLOBAL: path.join(root, "gitconfig"), GIT_CONFIG_NOSYSTEM: "1" };
}

const gitIn = root => (cwd, ...args) => execFileAsync("git", args, { cwd, env: gitEnv(root) });

/** 網站 repo（main 已推到 remote.git）只建一次，每個測試複製一份（Windows 開程序慢）。 */
let template;
function siteTemplate() {
  template ??= (async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "publish-site-"));
    fs.writeFileSync(path.join(root, "gitconfig"), "");
    const git = gitIn(root);
    const work = path.join(root, "work");
    // 不帶 hooks 範本：每個測試都要複製一份，檔案越少越快
    await git(root, "init", "-q", "--template=", "--bare", "remote.git");
    writeTree(work, SITE);
    await git(work, "init", "-q", "--template=", "-b", "main");
    await git(work, "add", "-A");
    await git(work, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "site");
    await git(work, "remote", "add", "origin", posix(path.join(root, "remote.git")));
    await git(work, "push", "-q", "origin", "main");
    return root;
  })();
  return template;
}

/**
 * 複製一份網站 repo＋ bare remote、放好 artifact，跑那一步，回傳結束碼、輸出、遠端分支、推上去的內容、gh 收到的指令。
 * staleBranch：遠端先有一條同名、內容不同的資料分支（上一輪推了分支卻在開 PR 時失敗）。
 * prepare(artifactDir)：額外動 artifact（例如放捷徑）。
 */
async function publish({ artifact = FRESH, env = {}, staleBranch = false, prepare } = {}) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "publish-step-"));
  try {
    const source = await siteTemplate();
    const root = path.join(parent, "case");
    fs.cpSync(source, root, { recursive: true });
    const work = path.join(root, "work");
    const remote = path.join(root, "remote.git");
    // origin 改指這一份的 remote.git
    const config = path.join(work, ".git", "config");
    fs.writeFileSync(config, fs.readFileSync(config, "utf8").replaceAll(posix(path.join(source, "remote.git")), posix(remote)));
    const git = gitIn(root);
    if (staleBranch) {
      await git(work, "checkout", "-q", "-b", BRANCH);
      await git(work, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "上一輪推上去的");
      await git(work, "push", "-q", "origin", BRANCH);
      await git(work, "checkout", "-q", "main");
      await git(work, "branch", "-q", "-D", BRANCH);
    }

    // artifact：跟 upload-artifact 從 public/ 開始存一樣，最上層是 data、assets
    const artifactDir = path.join(root, "runner-temp", "refresh-data");
    fs.mkdirSync(artifactDir, { recursive: true });
    writeTree(artifactDir, artifact);
    prepare?.(artifactDir);

    const bin = path.join(root, "bin");
    const marker = path.join(root, "pwned");
    const ghLog = path.join(root, "gh.log");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "gh"), `#!/usr/bin/env bash\nprintf '%s\\n' "gh $*" >> "${posix(ghLog)}"\n`);
    fs.chmodSync(path.join(bin, "gh"), 0o755);
    fs.writeFileSync(path.join(root, "step.sh"), SCRIPT);

    let code = 0;
    let out = "";
    try {
      const result = await execFileAsync(BASH, ["-e", posix(path.join(root, "step.sh"))], {
        cwd: work,
        env: {
          ...gitEnv(root),
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          RUNNER_TEMP: posix(path.join(root, "runner-temp")),
          GH_TOKEN: "fake",
          GH_HOST: "gh-stub.invalid",
          DRY_RUN: "false",
          STAMP,
          PWNED_MARKER: posix(marker),
          ...env,
        },
      });
      out = result.stdout + result.stderr;
    } catch (error) {
      code = error.code;
      out = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    }

    const branches = (await git(root, "--git-dir", remote, "for-each-ref", "--format=%(refname:short)", "refs/heads")).stdout.trim().split("\n");
    const pushed = branches.includes(BRANCH);
    const files = pushed ? (await git(root, "--git-dir", remote, "diff", "--name-status", "main", BRANCH)).stdout.trim().split("\n").sort() : [];
    const message = pushed ? (await git(root, "--git-dir", remote, "log", "-1", "--format=%s", BRANCH)).stdout.trim() : "";
    const gh = fs.existsSync(ghLog) ? fs.readFileSync(ghLog, "utf8").trim().split("\n") : [];
    return { code, out, branches, files, message, gh, executed: fs.existsSync(marker), siteUntouched: fs.existsSync(path.join(work, "public/data/items.json")) };
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
}

// 各道檢查失敗時印的字
const BAD_ARTIFACT = /下載的資料檔不對/;
const BAD_STRING = /字串不對/;

/** 被 reason 那一道擋下：失敗、沒推、沒叫 gh、artifact 裡的程式沒被執行。 */
function assertRefused(result, reason) {
  assert.notEqual(result.code, 0, `這一步要失敗\n${result.out}`);
  assert.match(result.out, reason, `不是被預期的那一道擋下\n${result.out}`);
  assert.equal(result.executed, false, "artifact 裡的程式被執行了");
  assert.deepEqual(result.branches, ["main"], "不能推分支");
  assert.deepEqual(result.gh, [], "不能開 PR");
}

describe("publish 那一步真的跑一次（bash＋git，本機 bare repo 當 origin）", { skip: SKIP, concurrency: true, timeout: 120_000 }, () => {
  after(async () => {
    if (template) fs.rmSync(await template, { recursive: true, force: true });
  });

  test("正常：推資料分支（只動 public/data、public/assets，新增、修改、刪除都有）、開 PR、合併", async () => {
    assert.ok(SCRIPT, "找不到「開 PR 並自動合併」的 run");
    const result = await publish();
    assert.equal(result.code, 0, result.out);
    assert.deepEqual(result.branches.sort(), [BRANCH, "main"]);
    assert.deepEqual(result.files, ["A\tpublic/assets/items/2.png", "A\tpublic/data/quests.json", "D\tpublic/data/items.json", "M\tpublic/data/meta.json"]);
    assert.equal(result.message, `data: 同步遊戲版本 1.15.3（${STAMP}）`);
    assert.equal(result.gh.length, 2);
    assert.match(result.gh[0], new RegExp(`^gh pr create --title data: 同步遊戲版本 1\\.15\\.3（${STAMP.replace(/[+.]/g, "\\$&")}） --body .* --base main --head ${BRANCH}$`));
    assert.equal(result.gh[1], `gh pr merge ${BRANCH} --squash --delete-branch --admin`);
  });

  test("dry-run：一開始就結束，不動 public/、不推、不開 PR", async () => {
    const result = await publish({ env: { DRY_RUN: "true" } });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /dry-run/);
    assert.ok(result.siteUntouched);
    assert.deepEqual(result.branches, ["main"]);
    assert.deepEqual(result.gh, []);
  });

  test("artifact 裡放 meta.json.js、不放 meta.json：不能被當成程式執行（被動了手腳的 refresh 就能拿寫入權限跑任何指令）", async () => {
    const artifact = { ...without(FRESH, "data/meta.json"), "data/meta.json.js": EVIL_JS };
    assertRefused(await publish({ artifact }), BAD_ARTIFACT);
  });

  test("artifact 的 meta.json 是資料夾（package.json 指到裡面的 .png，白名單擋不到）：讀的時候直接失敗，不會載入裡面的程式", async () => {
    const artifact = { ...without(FRESH, "data/meta.json"), "data/meta.json/package.json": '{"main":"evil.png"}', "data/meta.json/evil.png": EVIL_JS };
    assertRefused(await publish({ artifact }), /EISDIR/);
  });

  // 放上正式機網域就是 stored XSS；.js 可能被當成程式載入
  for (const file of ["assets/items/x.html", "assets/npcs/x.svg", "data/x.js"]) {
    test(`artifact 裡有 png、json 以外的檔（${file}）：不收、不動 public/`, async () => {
      const result = await publish({ artifact: { ...FRESH, [file]: "<script>alert(1)</script>" } });
      assertRefused(result, BAD_ARTIFACT);
      assert.ok(result.siteUntouched, "public/ 被動到了");
    });
  }

  const layouts = {
    "多一個資料夾": { ...FRESH, "src/app.ts": "evil" },
    "最上層多一個檔": { ...FRESH, "evil.json": "{}" },
    "少了 assets": { "data/meta.json": FRESH["data/meta.json"] },
    "有隱藏資料夾 .git": { ...FRESH, "data/.git/config": "[core]\n\tfsmonitor = evil" },
    "有隱藏檔": { ...FRESH, "assets/items/.gitattributes": "* filter=x" },
    // 副檔名在白名單裡也不收：正常上傳的 artifact 不會有隱藏檔
    "有隱藏的 png": { ...FRESH, "assets/items/.x.png": "png-x" },
  };
  for (const [why, artifact] of Object.entries(layouts)) {
    test(`artifact ${why}：不收、不動 public/`, async () => {
      const result = await publish({ artifact });
      assertRefused(result, BAD_ARTIFACT);
      assert.ok(result.siteUntouched, "public/ 被動到了");
    });
  }

  test("artifact 裡有捷徑（symlink）：不收", async t => {
    let linked = true;
    const result = await publish({
      prepare: dir => {
        try {
          fs.symlinkSync(path.join(dir, "data", "quests.json"), path.join(dir, "assets", "items", "3.png"));
        } catch {
          linked = false; // Windows 沒開發人員模式建不了
        }
      },
    });
    if (!linked) return t.skip("這台建不了捷徑");
    assertRefused(result, BAD_ARTIFACT);
  });

  test("遊戲版本 301 字：開分支前就失敗，不推、不開 PR（太長開不了 PR，以前會留下孤兒分支）", async () => {
    const result = await publish({ artifact: { ...FRESH, "data/meta.json": JSON.stringify({ gameVersion: `${"1.".repeat(150)}2` }) } });
    assertRefused(result, BAD_STRING);
    assert.match(result.out, /長度 301/);
  });

  for (const stamp of [`${STAMP}\n::warning::x`, "2026-10-08 10:00", `2026-10-08T10:00:00.${"1".repeat(40)}+08:00`]) {
    test(`上游版本 ${JSON.stringify(stamp).slice(0, 40)}（換行、空白、太長）：開分支前就失敗，不推、不開 PR`, async () => {
      assertRefused(await publish({ env: { STAMP: stamp } }), BAD_STRING);
    });
  }

  test("上一輪推了分支卻在開 PR 時失敗（遠端已有同名分支）：先刪掉舊的再推，這一輪照樣開 PR、合併，不用人工清", async () => {
    const result = await publish({ staleBranch: true });
    assert.equal(result.code, 0, result.out);
    assert.equal(result.message, `data: 同步遊戲版本 1.15.3（${STAMP}）`, "遠端那條要換成這一輪的 commit");
    assert.equal(result.gh.length, 2);
  });

  test("重建出來的檔跟網站一模一樣：不推、不開 PR", async () => {
    const same = { "data/meta.json": SITE["public/data/meta.json"], "data/items.json": "[1]", "assets/items/1.png": "png-1" };
    const result = await publish({ artifact: same });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /其實沒變/);
    assert.deepEqual(result.branches, ["main"]);
    assert.deepEqual(result.gh, []);
  });
});
