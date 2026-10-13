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
