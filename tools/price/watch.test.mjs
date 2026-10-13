import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { watchShots } from "./watch.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));

test("新的 png 寫完才通知一次；開工前就在的、不是 png 的不算", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "price-watch-"));
  fs.writeFileSync(path.join(dir, "old.png"), "x");
  const got = [];
  const close = watchShots(dir, f => got.push(path.basename(f)), { stableMs: 150 });
  t.after(() => { close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const file = path.join(dir, "new.png");
  fs.writeFileSync(file, "part1");
  await sleep(50);
  fs.appendFileSync(file, "part2");
  fs.writeFileSync(path.join(dir, "note.txt"), "x");
  fs.appendFileSync(path.join(dir, "old.png"), "y");
  await sleep(600);
  assert.deepEqual(got, ["new.png"]);
});

test("append 在第一次檢查後但穩定週期內：仍然恰好一次回呼", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "price-watch-append-"));
  const got = [];
  const close = watchShots(dir, f => got.push(path.basename(f)), { stableMs: 150 });
  t.after(() => { close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const file = path.join(dir, "test.png");
  fs.writeFileSync(file, "part1");
  await sleep(250); // 等超過一次的穩定檢查，但在 150ms 穩定前 append
  fs.appendFileSync(file, "part2");
  await sleep(300); // 等穩定
  assert.equal(got.length, 1, "恰好一次");
  assert.equal(got[0], "test.png");
});

test("dir 不存在時建立它", async t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "price-watch-mkdir-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const dir = path.join(base, "shots");
  assert.equal(fs.existsSync(dir), false, "初始不存在");
  const got = [];
  const close = watchShots(dir, f => got.push(path.basename(f)), { stableMs: 100 });
  t.after(() => close());
  assert.ok(fs.existsSync(dir), "建立了");
  const file = path.join(dir, "test.png");
  fs.writeFileSync(file, "x");
  await sleep(200);
  assert.deepEqual(got, ["test.png"]);
});
