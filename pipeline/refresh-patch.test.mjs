import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

// refresh-patch.mjs 算不出來不擋資料更新：任何錯都印 ::warning::、結束碼 0，--out 一個位元組都不動
const SCRIPT = path.join(import.meta.dirname, "refresh-patch.mjs");
const dataJs = v => `window.MS_DROP_DB = ${JSON.stringify({ metadata: { gameVersion: v }, monsters: [] })};\n`;

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-patch-"));
  const up = path.join(root, "up");
  fs.mkdirSync(up);
  const git = (...args) => execFileSync("git", ["-C", up, ...args], { encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  git("config", "commit.gpgsign", "false");
  // 只有 data.js：找得到前一版，但重建前一版會因為缺 items-data.js 失敗（中途失敗）
  for (const v of ["1.0", "1.1"]) {
    fs.writeFileSync(path.join(up, "data.js"), dataJs(v));
    git("add", "-A");
    git("commit", "-q", "-m", v);
  }
  const raw = path.join(root, "artale.json");
  fs.writeFileSync(raw, JSON.stringify({ metadata: { gameVersion: "1.1" } }));
  const out = path.join(root, "patches");
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, "index.json"), '{"versions":[]}');
  return { root, up, raw, out, head: git("rev-parse", "HEAD") };
}

const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
const snapshot = dir => Object.fromEntries(fs.readdirSync(dir).map(f => [f, fs.readFileSync(path.join(dir, f), "utf8")]));

test("重建前一版失敗（中途失敗）：印 ::warning::、結束碼 0、--out 不動", () => {
  const { root, up, raw, out, head } = setup();
  try {
    const before = snapshot(out);
    const r = run(["--upstream", up, "--head", head, "--raw", raw, "--out", out, "--new", root]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /前一版 1\.0/);
    assert.match(r.stdout, /^::warning::改版差異沒算（資料照常更新）：.*items-data\.js/m);
    assert.deepEqual(snapshot(out), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("上游資料夾壞掉、artale.json 讀不到：也只是 ::warning::、結束碼 0", () => {
  const { root, raw, out } = setup();
  try {
    const empty = fs.mkdtempSync(path.join(root, "empty-"));
    const a = run(["--upstream", empty, "--raw", raw, "--out", out]);
    assert.equal(a.status, 0, a.stderr);
    assert.match(a.stdout, /^::warning::/m);
    const b = run(["--upstream", empty, "--raw", path.join(root, "nope.json"), "--out", out]);
    assert.equal(b.status, 0, b.stderr);
    assert.match(b.stdout, /^::warning::/m);
    assert.deepEqual(snapshot(out), { "index.json": '{"versions":[]}' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("找不到前一版：印「改版差異跳過」一行，不是 warning", () => {
  const { root, up, raw, out, head } = setup();
  try {
    fs.writeFileSync(raw, JSON.stringify({ metadata: { gameVersion: "9.9" } }));
    const r = run(["--upstream", up, "--head", head, "--raw", raw, "--out", out]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^改版差異跳過：/m);
    assert.doesNotMatch(r.stdout, /::warning::/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
