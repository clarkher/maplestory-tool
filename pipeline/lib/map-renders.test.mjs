import test from "node:test";
import assert from "node:assert/strict";
import { renderPlan } from "./map-renders.mjs";

const plan = args => renderPlan({ atlasIds: [], upstreamVersions: {}, have: {}, cacheHas: () => false, ...args });

test("有快取、版本變了 → convert", () => {
  const r = plan({ atlasIds: [1], upstreamVersions: { 1: "b" }, have: { 1: "a" }, cacheHas: () => true });
  assert.deepEqual(r, { convert: [1], keep: [], missing: [] });
});

test("有快取、還沒轉過 → convert", () => {
  const r = plan({ atlasIds: [1], upstreamVersions: { 1: "a" }, have: {}, cacheHas: () => true });
  assert.deepEqual(r.convert, [1]);
});

test("版本一樣、檔在 → keep（不重轉）", () => {
  const r = plan({ atlasIds: [1], upstreamVersions: { 1: "a" }, have: { 1: "a" }, cacheHas: () => true });
  assert.deepEqual(r, { convert: [], keep: [1], missing: [] });
});

test("沒快取、檔在 → keep", () => {
  const r = plan({ atlasIds: [1], upstreamVersions: { 1: "b" }, have: { 1: "a" }, cacheHas: () => false });
  assert.deepEqual(r, { convert: [], keep: [1], missing: [] });
});

test("沒快取、檔不在 → missing", () => {
  const r = plan({ atlasIds: [1], upstreamVersions: { 1: "a" }, have: {}, cacheHas: () => false });
  assert.deepEqual(r, { convert: [], keep: [], missing: [1] });
});

test("不在 atlas 的既有檔不出現在任何清單（永遠不刪）", () => {
  const r = plan({ atlasIds: [1], upstreamVersions: { 1: "a", 2: "x" }, have: { 1: "a", 2: "x" }, cacheHas: () => true });
  const all = [...r.convert, ...r.keep, ...r.missing];
  assert.deepEqual(all, [1]);
});
