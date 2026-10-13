import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ensureDataWorktree, publishData, DATA_BRANCH } from "./git-data.mjs";

// 測試用的 git 身分（CI 沒設 user.name）
Object.assign(process.env, { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" });
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

function setup(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "price-git-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true, maxRetries: 3 }));
  const remote = path.join(base, "remote.git");
  git(base, "init", "-q", "--bare", remote);
  const repo = path.join(base, "repo");
  const mk = dir => {
    fs.mkdirSync(dir);
    git(dir, "init", "-q", "-b", "main");
    git(dir, "config", "core.autocrlf", "false"); // 不受使用者全域設定影響（Windows 常是 true，會把檔案換成 CRLF）
    fs.writeFileSync(path.join(dir, "README.md"), "x\n");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "init");
    git(dir, "remote", "add", "origin", remote);
    return dir;
  };
  mk(repo);
  return { base, remote, repo, mk };
}

test("遠端沒有分支：開孤兒分支，第一個 commit 只有擋部署的 vercel.json", t => {
  const { repo } = setup(t);
  const dir = ensureDataWorktree(repo);
  assert.equal(dir, path.join(repo, ".price-data"));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "vercel.json"), "utf8")), { git: { deploymentEnabled: false } });
  assert.equal(git(dir, "rev-list", "--count", "HEAD"), "1");
  assert.equal(fs.existsSync(path.join(dir, "README.md")), false, "孤兒分支不帶主分支的檔案");
  assert.equal(git(dir, "branch", "--show-current"), DATA_BRANCH);
});

test("收工：commit＋push，遠端收到；沒變動不 commit", t => {
  const { repo, remote } = setup(t);
  const dir = ensureDataWorktree(repo);
  fs.mkdirSync(path.join(dir, "auction"));
  fs.writeFileSync(path.join(dir, "auction", "scania.json"), "{}\n");
  const r = publishData(dir, "資料：測試");
  assert.equal(r.committed, true);
  assert.equal(r.pushed, true);
  assert.equal(git(remote, "rev-parse", `refs/heads/${DATA_BRANCH}`), r.sha);
  assert.equal(publishData(dir, "資料：測試").committed, false);
});

test("另一台電腦（遠端已有分支）：接遠端的資料；再開一次直接用", t => {
  const { base, repo, mk } = setup(t);
  const dir = ensureDataWorktree(repo);
  fs.writeFileSync(path.join(dir, "a.json"), "1\n");
  publishData(dir, "資料：第一台");
  const repo2 = mk(path.join(base, "repo2"));
  const dir2 = ensureDataWorktree(repo2);
  assert.equal(fs.readFileSync(path.join(dir2, "a.json"), "utf8"), "1\n");
  assert.equal(ensureDataWorktree(repo2), dir2);
});

test("從 repo 的另一個 worktree 跑也接到主 checkout 底下同一個資料夾", t => {
  const { base, repo } = setup(t);
  const wt = path.join(base, "wt");
  git(repo, "worktree", "add", "-q", wt, "-b", "feat");
  assert.equal(ensureDataWorktree(wt), path.join(repo, ".price-data"));
});
