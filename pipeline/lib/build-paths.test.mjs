import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildPaths } from "./build-paths.mjs";

const root = path.resolve("/repo");

test("沒設環境變數：照舊讀寫 repo 內的位置，也寫圖檔", () => {
  const paths = buildPaths({}, root);
  assert.equal(paths.artaleFile, path.join(root, "data", "raw", "artale.json"));
  assert.equal(paths.rawDir, path.join(root, "data", "raw"));
  assert.equal(paths.outDir, path.join(root, "public", "data"));
  assert.equal(paths.writeAssets, true);
});

test("設 MAPLE_DATA_OUT：輸出改到指定資料夾，且不准寫 public/assets", () => {
  const paths = buildPaths({ MAPLE_DATA_OUT: "/tmp/x" }, root);
  assert.equal(paths.outDir, path.resolve("/tmp/x"));
  assert.equal(paths.writeAssets, false);
  assert.equal(paths.artaleFile, path.join(root, "data", "raw", "artale.json"));
});

test("設 MAPLE_ARTALE_FILE：只換 artale.json，rawDir 不變", () => {
  const paths = buildPaths({ MAPLE_ARTALE_FILE: "/tmp/a.json" }, root);
  assert.equal(paths.artaleFile, path.resolve("/tmp/a.json"));
  assert.equal(paths.rawDir, path.join(root, "data", "raw"));
  assert.equal(paths.outDir, path.join(root, "public", "data"));
  assert.equal(paths.writeAssets, true);
});

test("空字串視為沒設", () => {
  const paths = buildPaths({ MAPLE_DATA_OUT: "", MAPLE_ARTALE_FILE: "" }, root);
  assert.equal(paths.outDir, path.join(root, "public", "data"));
  assert.equal(paths.writeAssets, true);
});
