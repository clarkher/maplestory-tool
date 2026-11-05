import assert from "node:assert/strict";
import { test } from "node:test";
import { staleDataVersion } from "./data-version.mjs";

test("改了 public/data 的資料、meta.json 沒改：要擋（舊訪客會一直吃快取）", () => {
  assert.deepEqual(staleDataVersion(["public/data/quests.json", "src/lib/data.ts"]), ["public/data/quests.json"]);
});

test("資料跟 meta.json 一起改：過", () => {
  assert.deepEqual(staleDataVersion(["public/data/quests.json", "public/data/meta.json"]), []);
});

test("只改 meta.json、只改程式：過", () => {
  assert.deepEqual(staleDataVersion(["public/data/meta.json"]), []);
  assert.deepEqual(staleDataVersion(["src/lib/data.ts", "README.md"]), []);
  assert.deepEqual(staleDataVersion([]), []);
});

test("攻略檔看的是 guides/common.json 的版本，不是 meta.json", () => {
  assert.deepEqual(staleDataVersion(["public/data/guides/121.json", "public/data/meta.json"]), ["public/data/guides/121.json"]);
  assert.deepEqual(staleDataVersion(["public/data/guides/121.json", "public/data/guides/common.json"]), []);
});

test("每次回伺服器確認的檔不靠版本號，單獨改不算", () => {
  for (const file of ["gear", "scroll-sim", "avatar", "speed-names", "guides/common"]) {
    assert.deepEqual(staleDataVersion([`public/data/${file}.json`]), [], file);
  }
});

test("圖片不走這個版本，不算", () => {
  assert.deepEqual(staleDataVersion(["public/data/monster_frames/100100.png"]), []);
});
