import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkArtifact, installArtifact } from "./artifact.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "fx-artifact-"));
function write(dir, files) {
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}
const OLD_LINE = '{"t":"2026-10-13T12:40:00+08:00","ask100":310}\n';
const good = () => ({
  "fx/scania/ref-samples.jsonl": `${OLD_LINE}{"t":"2026-10-13T14:40:59+08:00","ask100":300,"listings":82}\n`,
  "fx/scania/latest.json": '{"t":"2026-10-13T14:40:59+08:00","ask100":300}',
  "fx/scania/daily.json": '{"server":"雪吉拉","days":[]}',
});

test("三個檔都在、都讀得懂、舊的 jsonl 原封不動接上新的一行：通過", () => {
  const branch = write(tmp(), { "fx/scania/ref-samples.jsonl": OLD_LINE });
  assert.doesNotThrow(() => checkArtifact(write(tmp(), good()), branch));
});

test("第一次（fx-data 還沒有這個檔）也通過", () => {
  assert.doesNotThrow(() => checkArtifact(write(tmp(), good()), tmp()));
});

test("多一個檔、少一個檔都不行", () => {
  assert.throws(() => checkArtifact(write(tmp(), { ...good(), "fx/scania/x.html": "<script>" }), tmp()), /檔案不對/);
  const missing = good();
  delete missing["fx/scania/daily.json"];
  assert.throws(() => checkArtifact(write(tmp(), missing), tmp()), /檔案不對/);
});

test("JSON 壞掉不行", () => {
  assert.throws(() => checkArtifact(write(tmp(), { ...good(), "fx/scania/latest.json": "{oops" }), tmp()), /latest\.json/);
  assert.throws(() => checkArtifact(write(tmp(), { ...good(), "fx/scania/ref-samples.jsonl": "{oops}\n" }), tmp()), /ref-samples\.jsonl/);
});

test("最新一筆市價不是有限正數、每日沒有 days 陣列不行", () => {
  assert.throws(() => checkArtifact(write(tmp(), { ...good(), "fx/scania/latest.json": '{"ask100":0}' }), tmp()), /latest\.json/);
  assert.throws(() => checkArtifact(write(tmp(), { ...good(), "fx/scania/latest.json": '{"ask100":1e999}' }), tmp()), /latest\.json/);
  assert.throws(() => checkArtifact(write(tmp(), { ...good(), "fx/scania/daily.json": '{"days":null}' }), tmp()), /daily\.json/);
});

test("jsonl 改了舊行、或整個變短，都不行", () => {
  const changed = write(tmp(), { "fx/scania/ref-samples.jsonl": '{"t":"2026-10-12T16:17:00+08:00","ask100":280}\n' });
  assert.throws(() => checkArtifact(write(tmp(), good()), changed), /只能接在後面/);
  const longer = write(tmp(), { "fx/scania/ref-samples.jsonl": `${good()["fx/scania/ref-samples.jsonl"]}{"t":"2026-10-13T16:40:00+08:00","ask100":310}\n` });
  assert.throws(() => checkArtifact(write(tmp(), good()), longer), /只能接在後面/);
});

test("installArtifact：三個檔＋分支說明、vercel.json 放進工作目錄", () => {
  const out = write(tmp(), good());
  const branch = tmp();
  const statics = write(tmp(), { "README.md": "# fx-data", "vercel.json": '{"git":{"deploymentEnabled":false}}' });
  installArtifact(out, branch, statics);
  assert.equal(fs.readFileSync(path.join(branch, "vercel.json"), "utf8"), '{"git":{"deploymentEnabled":false}}');
  assert.equal(fs.readFileSync(path.join(branch, "fx/scania/daily.json"), "utf8"), good()["fx/scania/daily.json"]);
});