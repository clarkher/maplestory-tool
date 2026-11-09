import test from "node:test";
import assert from "node:assert/strict";
import { upsertIndex, VERSION_RE } from "./patch-index.mjs";

const e = (version, date) => ({ version, prev: "x", base: "a", head: "b", date, counts: { items: 1 } });

test("upsertIndex 從空開始新增", () => {
  const idx = upsertIndex(undefined, e("1.0", "2026-01-01"));
  assert.deepEqual(idx.versions.map(v => v.version), ["1.0"]);
});
test("依日期新到舊", () => {
  let idx = upsertIndex({ versions: [] }, e("1.0", "2026-01-01"));
  idx = upsertIndex(idx, e("1.2", "2026-03-01"));
  idx = upsertIndex(idx, e("1.1", "2026-02-01"));
  assert.deepEqual(idx.versions.map(v => v.version), ["1.2", "1.1", "1.0"]);
});
test("同版本整筆換掉", () => {
  let idx = upsertIndex({ versions: [] }, e("1.0", "2026-01-01"));
  idx = upsertIndex(idx, { ...e("1.0", "2026-01-05"), head: "zzz" });
  assert.equal(idx.versions.length, 1);
  assert.equal(idx.versions[0].head, "zzz");
});
test("不改動傳入的物件", () => {
  const src = { versions: [e("1.0", "2026-01-01")] };
  upsertIndex(src, e("1.1", "2026-02-01"));
  assert.equal(src.versions.length, 1);
});
test("版本號規則", () => {
  assert.ok(VERSION_RE.test("2.0.0+beta-1"));
  assert.ok(!VERSION_RE.test("../x"));
  assert.ok(!VERSION_RE.test(""));
});
