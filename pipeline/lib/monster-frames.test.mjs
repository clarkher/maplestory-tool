import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { copyMissingFrames, frameFileOf, missingFrames, planFrameCopies } from "./monster-frames.mjs";

const quiet = { log() {} };

/** 這個測試自己的暫存資料夾（跑完刪掉）。 */
function scratchDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maplebook-frames-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("frameFileOf：只認 assets/monster_frames 底下單層的 png 檔名", () => {
  assert.equal(frameFileOf("./assets/monster_frames/6300000.png"), "6300000.png");
  assert.equal(frameFileOf("assets/monster_frames/6300000.png"), "6300000.png");
  assert.equal(frameFileOf("/assets/monster_frames/6300000.png"), "6300000.png");
  // 上游是第三方資料，圖片欄位是路徑：跳出資料夾、換資料夾、別的副檔名、空值都不能當成檔名
  assert.equal(frameFileOf("./assets/monster_frames/../../.git/config"), null);
  assert.equal(frameFileOf("./assets/monster_frames/../items/1.png"), null);
  assert.equal(frameFileOf("./assets/monster_frames/a/b.png"), null);
  assert.equal(frameFileOf("./assets/monster_frames/a\b.png"), null);
  assert.equal(frameFileOf("./assets/items/1.png"), null);
  assert.equal(frameFileOf("./assets/monster_frames/1.svg"), null);
  assert.equal(frameFileOf(""), null);
  assert.equal(frameFileOf(undefined), null);
  assert.equal(frameFileOf(6300000), null);
});

test("planFrameCopies：檔名跟 id 不同、<id>.png 不在、上游指的那張在 → 要複製", () => {
  const plan = planFrameCopies(
    [{ id: 6300001, image: "./assets/monster_frames/6300000.png" }],
    ["6300000.png"],
  );
  assert.deepEqual(plan.copies, [{ id: 6300001, from: "6300000.png", to: "6300001.png" }]);
  assert.deepEqual(plan.unresolved, []);
});

test("planFrameCopies：<id>.png 已經在 → 不複製，也不回報（就算上游指的是別張）", () => {
  const plan = planFrameCopies(
    [
      { id: 9300058, image: "./assets/monster_frames/1210100.png" },
      { id: 100100, image: "./assets/monster_frames/100100.png" },
    ],
    ["9300058.png", "1210100.png", "100100.png"],
  );
  assert.deepEqual(plan.copies, []);
  assert.deepEqual(plan.unresolved, []);
});

test("planFrameCopies：上游指的那張也不存在 → 不複製，回報", () => {
  const plan = planFrameCopies(
    [{ id: 6300001, image: "./assets/monster_frames/6300000.png" }],
    ["100100.png"],
  );
  assert.deepEqual(plan.copies, []);
  assert.equal(plan.unresolved.length, 1);
  assert.equal(plan.unresolved[0].id, 6300001);
  assert.match(plan.unresolved[0].reason, /6300000\.png/);
});

test("planFrameCopies：圖檔名就是 <id>.png 但檔案不在 → 回報（沒有別張可借）", () => {
  const plan = planFrameCopies([{ id: 5, image: "./assets/monster_frames/5.png" }], []);
  assert.deepEqual(plan.copies, []);
  assert.equal(plan.unresolved[0].id, 5);
});

test("planFrameCopies：沒有圖片欄位或看不懂的路徑 → 回報，不去碰任何檔案", () => {
  const plan = planFrameCopies(
    [
      { id: 1 },
      { id: 2, image: "./assets/monster_frames/../../.git/config" },
    ],
    ["config", "9.png"],
  );
  assert.deepEqual(plan.copies, []);
  assert.deepEqual(plan.unresolved.map(entry => entry.id), [1, 2]);
});

test("planFrameCopies：兩隻怪借同一張圖，各複製一份", () => {
  const plan = planFrameCopies(
    [
      { id: 9300058, image: "./assets/monster_frames/1210100.png" },
      { id: 9300059, image: "./assets/monster_frames/1210100.png" },
    ],
    ["1210100.png"],
  );
  assert.deepEqual(plan.copies.map(copy => [copy.id, copy.from]), [[9300058, "1210100.png"], [9300059, "1210100.png"]]);
});

test("missingFrames：列出沒有 <id>.png 的怪（id 與名字）", () => {
  const missing = missingFrames(
    [{ id: 100100, n: "綠水靈" }, { id: 6300001, n: "變形雪吉拉" }],
    new Set(["100100.png", "6300000.png"]),
  );
  assert.deepEqual(missing, [{ id: 6300001, n: "變形雪吉拉" }]);
  assert.deepEqual(missingFrames([{ id: 100100, n: "綠水靈" }], ["100100.png"]), []);
});

test("copyMissingFrames：真的把借來的圖複製成 <id>.png，印一行，原圖不動；再跑一次不再複製", t => {
  const dir = scratchDir(t);
  fs.writeFileSync(path.join(dir, "6300000.png"), "snow-yeti");
  fs.writeFileSync(path.join(dir, "100100.png"), "slime");
  const lines = [];
  const monsters = [
    { id: 6300001, image: "./assets/monster_frames/6300000.png" },
    { id: 100100, image: "./assets/monster_frames/100100.png" },
  ];

  const first = copyMissingFrames(dir, monsters, { log: line => lines.push(line) });
  assert.deepEqual(first.copies, [{ id: 6300001, from: "6300000.png", to: "6300001.png" }]);
  assert.equal(fs.readFileSync(path.join(dir, "6300001.png"), "utf8"), "snow-yeti");
  assert.equal(fs.readFileSync(path.join(dir, "6300000.png"), "utf8"), "snow-yeti");
  assert.deepEqual(lines, ["[monsters] 圖檔名跟 id 不同，複製一份：6300001 ← 6300000.png"]);

  const second = copyMissingFrames(dir, monsters, quiet);
  assert.deepEqual(second.copies, []);
  assert.deepEqual(second.unresolved, []);
});

test("copyMissingFrames：不覆蓋已經存在的 <id>.png", t => {
  const dir = scratchDir(t);
  fs.writeFileSync(path.join(dir, "1210100.png"), "ribbon-pig-source");
  fs.writeFileSync(path.join(dir, "9300058.png"), "its-own-art");
  copyMissingFrames(dir, [{ id: 9300058, image: "./assets/monster_frames/1210100.png" }], quiet);
  assert.equal(fs.readFileSync(path.join(dir, "9300058.png"), "utf8"), "its-own-art");
});

test("copyMissingFrames：上游指的圖不在 → 不建檔，回報並印警告", t => {
  const dir = scratchDir(t);
  const lines = [];
  const result = copyMissingFrames(dir, [{ id: 6300001, image: "./assets/monster_frames/6300000.png" }], { log: line => lines.push(line) });
  assert.deepEqual(result.copies, []);
  assert.equal(result.unresolved.length, 1);
  assert.deepEqual(fs.readdirSync(dir), []);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[monsters\] 沒有圖可用：6300001/);
});

test("copyMissingFrames：圖片資料夾本身不在也不會炸（回報全部沒圖）", t => {
  const dir = path.join(scratchDir(t), "nope");
  const result = copyMissingFrames(dir, [{ id: 1, image: "./assets/monster_frames/2.png" }], quiet);
  assert.deepEqual(result.copies, []);
  assert.equal(result.unresolved.length, 1);
});
