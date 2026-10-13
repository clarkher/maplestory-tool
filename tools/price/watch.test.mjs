import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { watchShots } from "./watch.mjs";
import { sleep, waitFor } from "./test-helpers.mjs";

// 「有通知」一律用 waitFor 等到出現（慢的機器也不會誤判）；
// 「不該再通知」只能多等一小段看有沒有第二次，這段只會讓壞掉的程式被抓到，不會讓好的程式變紅。
const QUIET_MS = 500;

test("新的 png 寫完才通知一次；開工前就在的、不是 png 的不算", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "price-watch-"));
  fs.writeFileSync(path.join(dir, "old.png"), "x");
  const got = [];
  const close = watchShots(dir, f => got.push(path.basename(f)), { stableMs: 150 });
  t.after(() => { close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const file = path.join(dir, "new.png");
  fs.writeFileSync(file, "part1");
  await sleep(50); // 讓第一段先被看到，接著再補第二段（模擬還在寫）
  fs.appendFileSync(file, "part2");
  fs.writeFileSync(path.join(dir, "note.txt"), "x");
  fs.appendFileSync(path.join(dir, "old.png"), "y");
  await waitFor(() => got.length >= 1, 3000, "new.png 的通知");
  await sleep(QUIET_MS);
  assert.deepEqual(got, ["new.png"]);
});

test("append 在第一次檢查後但穩定週期內：仍然恰好一次回呼", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "price-watch-append-"));
  const got = [];
  const close = watchShots(dir, f => got.push(path.basename(f)), { stableMs: 400 });
  t.after(() => { close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const file = path.join(dir, "test.png");
  fs.writeFileSync(file, "part1");
  await sleep(600); // 超過第一次穩定檢查（400），在第二次（800）之前補一段
  fs.appendFileSync(file, "part2");
  await waitFor(() => got.length >= 1, 3000, "test.png 的通知");
  await sleep(QUIET_MS * 2);
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
  await waitFor(() => got.length >= 1, 3000, "test.png 的通知");
  await sleep(QUIET_MS);
  assert.deepEqual(got, ["test.png"]);
});
