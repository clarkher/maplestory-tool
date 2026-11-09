import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { diffPatch } from "./lib/patch-diff.mjs";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "build-patch.mjs");

function dataset(dir, items) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "items.json"), JSON.stringify(items));
  fs.writeFileSync(path.join(dir, "quests.json"), JSON.stringify([]));
  fs.writeFileSync(path.join(dir, "monsters.json"), JSON.stringify([]));
  fs.writeFileSync(path.join(dir, "maps.json"), JSON.stringify({}));
}
const it = (id, n) => ({ id, n, c: "消耗", s: "藥水" });
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

test("CLI 寫差異檔與索引，counts 等於 diffPatch", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bp-"));
  const oldD = path.join(root, "old"), newD = path.join(root, "new"), out = path.join(root, "out");
  dataset(oldD, [it(1, "A")]);
  dataset(newD, [it(1, "A"), it(2, "B")]);
  const args = ["--old", oldD, "--new", newD, "--out", out, "--version", "1.1", "--prev", "1.0", "--base", "aaa", "--head", "bbb", "--date", "2026-11-01"];
  const r = run(args);
  assert.equal(r.status, 0, r.stderr);
  const file = JSON.parse(fs.readFileSync(path.join(out, "1.1.json"), "utf8"));
  const expected = diffPatch({ items: [it(1, "A")], quests: [], monsters: [], maps: {} }, { items: [it(1, "A"), it(2, "B")], quests: [], monsters: [], maps: {} });
  assert.deepEqual(file.counts, expected.counts);
  assert.equal(file.version, "1.1");
  assert.equal(file.prev, "1.0");
  assert.equal(file.head, "bbb");
  assert.equal(file.added.items.length, 1);
  const idx = JSON.parse(fs.readFileSync(path.join(out, "index.json"), "utf8"));
  assert.equal(idx.versions[0].version, "1.1");
  assert.deepEqual(idx.versions[0].counts, expected.counts);
  // 再跑一次不重複
  assert.equal(run(args).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, "index.json"), "utf8")).versions.length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test("版本號 ../x 丟錯且沒寫檔", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bp-"));
  const oldD = path.join(root, "old"), newD = path.join(root, "new"), out = path.join(root, "out");
  dataset(oldD, []); dataset(newD, []);
  const r = run(["--old", oldD, "--new", newD, "--out", out, "--version", "../x", "--prev", "1.0", "--base", "a", "--head", "b", "--date", "2026-11-01"]);
  assert.notEqual(r.status, 0);
  assert.ok(!fs.existsSync(out));
  assert.ok(!fs.existsSync(path.join(root, "x.json")));
  fs.rmSync(root, { recursive: true, force: true });
});
