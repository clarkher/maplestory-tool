import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { versionAt, versionTimeline, buildAt } from "./upstream-history.mjs";

const git = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
const dataJs = (v, rev = 0) => `window.MS_DROP_DB = ${JSON.stringify({ metadata: { gameVersion: v, generatedAt: "2026-09-16T10:34:10+08:00" }, monsters: [{ id: rev }] })};
`;

/** 假上游：每個 commit 一個 data.js 版本（+ 可選的其他檔）。 */
function fakeUpstream(versions, { extra = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "up-hist-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  const commits = [];
  versions.forEach((v, i) => {
    fs.writeFileSync(path.join(dir, "data.js"), dataJs(v, i));
    if (extra && i === 0) fs.writeFileSync(path.join(dir, "other.txt"), "x");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", `c${i}`, "--date", `2026-10-0${i + 1}T12:00:00`);
    commits.push(git(dir, "rev-parse", "HEAD"));
  });
  return { dir, commits };
}

test("versionAt 只讀 data.js 的 gameVersion", () => {
  const { dir, commits } = fakeUpstream(["1.0", "1.1"]);
  assert.equal(versionAt(dir, commits[0]), "1.0");
  assert.equal(versionAt(dir, commits[1]), "1.1");
});

test("versionAt 拒絕不是 sha 的 commit", () => {
  const { dir } = fakeUpstream(["1.0"]);
  assert.throws(() => versionAt(dir, "--output=x"), /commit/);
});

test("versionTimeline 分段、舊到新", () => {
  const { dir, commits } = fakeUpstream(["1.0", "1.0", "1.1", "1.1", "1.1"]);
  const t = versionTimeline(dir);
  assert.deepEqual(t.map((e) => e.version), ["1.0", "1.1"]);
  assert.equal(t[0].first.commit, commits[0]);
  assert.equal(t[0].last.commit, commits[1]);
  assert.equal(t[1].first.commit, commits[2]);
  assert.equal(t[1].last.commit, commits[4]);
  assert.match(t[1].last.date, /^\d{4}-\d{2}-\d{2}$/);
});

test("同版修正：最新 commit 仍是 1.1，前一版仍是 1.0", () => {
  const { dir } = fakeUpstream(["1.0", "1.1", "1.1"]);
  const t = versionTimeline(dir);
  assert.equal(t.at(-1).version, "1.1");
  assert.equal(t.at(-2).version, "1.0");
});

test("buildAt 缺 items-data.js 丟出含 commit 前 8 碼的錯", () => {
  const { dir, commits } = fakeUpstream(["1.0"]);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "up-out-"));
  assert.throws(() => buildAt(dir, commits[0], out), (e) => e.message.startsWith(`上游 ${commits[0].slice(0, 8)} 重建失敗：`) && /items-data\.js/.test(e.message));
});
