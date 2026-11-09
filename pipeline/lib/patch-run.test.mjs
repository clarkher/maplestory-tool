import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildPatchArgs, findCurrentAndPrevious, sinceDate } from "./patch-run.mjs";
import { versionTimeline } from "./upstream-history.mjs";

const dataJs = (v, rev) => `window.MS_DROP_DB = ${JSON.stringify({ metadata: { gameVersion: v }, monsters: [{ id: rev }] })};\n`;

/** 假上游：[版本, 日期] 一個 commit 一筆，作者跟 committer 日期都設成那天（--since 看 committer 日期）。 */
function fakeUpstream(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "patch-run-"));
  const git = (args, date) => execFileSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) },
  }).trim();
  git(["init", "-q"]);
  git(["config", "user.email", "t@example.com"]);
  git(["config", "user.name", "t"]);
  git(["config", "commit.gpgsign", "false"]);
  const commits = entries.map(([v, date], i) => {
    fs.writeFileSync(path.join(dir, "data.js"), dataJs(v, i));
    git(["add", "-A"]);
    git(["commit", "-q", "-m", `c${i}`], `${date}T12:00:00+08:00`);
    return git(["rev-parse", "HEAD"]);
  });
  return { dir, commits };
}

const NOW = new Date("2026-11-09T04:00:00Z");

test("sinceDate：往前推幾天的 YYYY-MM-DD；null 是不限", () => {
  assert.equal(sinceDate(NOW, 14), "2026-10-26");
  assert.equal(sinceDate(NOW, null), undefined);
});

test("versionTimeline 可以指定看到哪個 commit（ref），之後的不算", () => {
  const { dir, commits } = fakeUpstream([["1.0", "2026-10-01"], ["1.1", "2026-10-02"], ["1.2", "2026-10-03"]]);
  assert.deepEqual(versionTimeline(dir, { ref: commits[1] }).map(s => s.version), ["1.0", "1.1"]);
  assert.throws(() => versionTimeline(dir, { ref: "--all" }), /commit/);
});

test("findCurrentAndPrevious：最近的區間就找得到前一版就不再往前翻", () => {
  const { dir, commits } = fakeUpstream([["1.0", "2026-01-01"], ["1.1", "2026-11-01"], ["1.2", "2026-11-05"], ["1.2", "2026-11-06"]]);
  const r = findCurrentAndPrevious(dir, "1.2", { now: NOW });
  assert.equal(r.since, "2026-10-26");
  assert.equal(r.prev.version, "1.1");
  assert.equal(r.prev.last.commit, commits[1]);
  assert.equal(r.seg.first.commit, commits[2]);
  assert.equal(r.seg.last.commit, commits[3]);
  assert.equal(r.seg.first.date, "2026-11-05");
});

test("findCurrentAndPrevious：這一版拉很長，區間一路放大到找到前一版（這一版的第一個 commit、日期才是對的）", () => {
  const { dir, commits } = fakeUpstream([["1.0", "2026-03-01"], ["1.1", "2026-05-01"], ["1.1", "2026-11-01"]]);
  const r = findCurrentAndPrevious(dir, "1.1", { now: NOW });
  assert.equal(r.since, sinceDate(NOW, 480));
  assert.equal(r.prev.version, "1.0");
  assert.equal(r.seg.first.commit, commits[1]);
  assert.equal(r.seg.first.date, "2026-05-01");
});

test("findCurrentAndPrevious：整個歷史只有一版 → prev 是 null；最新版跟要找的不同 → mismatch", () => {
  const only = fakeUpstream([["1.0", "2026-11-01"], ["1.0", "2026-11-02"]]);
  const a = findCurrentAndPrevious(only.dir, "1.0", { now: NOW });
  assert.equal(a.prev, null);
  assert.equal(a.seg.version, "1.0");
  const b = findCurrentAndPrevious(only.dir, "2.0", { now: NOW });
  assert.equal(b.mismatch, "1.0");
  assert.equal(b.prev, null);
});

test("buildPatchArgs：前一版的最後 commit 當 base、這一版最後 commit 當 head、這一版第一個 commit 的日期", () => {
  const prev = { version: "1.0", first: { commit: "a1", date: "2026-01-01" }, last: { commit: "a2", date: "2026-01-02" } };
  const seg = { version: "1.1", first: { commit: "b1", date: "2026-02-01" }, last: { commit: "b2", date: "2026-02-03" } };
  assert.deepEqual(buildPatchArgs({ prev, seg, oldDir: "O", newDir: "N", out: "P" }), [
    "--old", "O", "--new", "N", "--out", "P",
    "--version", "1.1", "--prev", "1.0", "--base", "a2", "--head", "b2", "--date", "2026-02-01",
  ]);
});
